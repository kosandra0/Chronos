import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

/**
 * Embedded PostgreSQL for the Windows desktop distribution.
 * No PostgreSQL service, Docker installation, or DATABASE_URL is required.
 * The data directory is supplied by the desktop host under the user's profile.
 */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const dataRoot = process.env.WATCHTOWER_DATA_DIR || path.join(process.cwd(), "chronos-data");
export const dataDirectory = dataRoot;
export const databaseDirectory = process.env.WATCHTOWER_DB_DIR || path.join(dataRoot, "database");
if (!isBuildPhase) fs.mkdirSync(databaseDirectory, { recursive: true });

const globalForDb = globalThis as typeof globalThis & {
  __chronosPGlite?: PGlite;
  __chronosPGliteInit?: Promise<void>;
  __chronosPGliteInitError?: string | null;
  __chronosPGliteReady?: boolean;
};

/** Tables the application requires. Used by initialization and by the readiness check. */
export const REQUIRED_TABLES = ["applications", "sessions", "settings", "achievements", "backup_history"] as const;

/** Snapshot of initialization state, for /api/health. */
export function databaseInitState(): { started: boolean; ready: boolean; error: string | null } {
  return {
    started: Boolean(globalForDb.__chronosPGliteInit),
    ready: globalForDb.__chronosPGliteReady === true,
    error: globalForDb.__chronosPGliteInitError ?? null,
  };
}

export const client = globalForDb.__chronosPGlite ?? (isBuildPhase ? new PGlite() : new PGlite(databaseDirectory));
globalForDb.__chronosPGlite = client;
export const db = drizzle({ client });

/**
 * Create the schema on first run. CREATE IF NOT EXISTS keeps upgrades non-destructive.
 * Concurrency-safe: every caller shares one in-flight promise. A FAILED attempt is not cached
 * (so a later call can retry) and its message is kept for diagnostics. Existing data is never touched.
 */
export async function initializeDatabase(): Promise<void> {
  if (!globalForDb.__chronosPGliteInit) {
    globalForDb.__chronosPGliteInitError = null;
    const attempt = (async () => {
      await client.waitReady;
      await client.exec(`
        CREATE TABLE IF NOT EXISTS applications (
          id text PRIMARY KEY,
          identity_key text NOT NULL,
          name text NOT NULL,
          executable_name text NOT NULL,
          executable_path text,
          category text NOT NULL DEFAULT 'Other',
          category_overridden boolean NOT NULL DEFAULT false,
          detection_status text NOT NULL DEFAULT 'ok',
          elevated boolean NOT NULL DEFAULT false,
          first_seen timestamptz NOT NULL,
          last_seen timestamptz NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS applications_identity_key_uq ON applications (identity_key);

        CREATE TABLE IF NOT EXISTS sessions (
          id text PRIMARY KEY,
          application_id text REFERENCES applications(id) ON DELETE CASCADE,
          start_time timestamptz NOT NULL,
          end_time timestamptz NOT NULL,
          duration_ms bigint NOT NULL DEFAULT 0,
          activity_type text NOT NULL,
          termination_reason text,
          window_title text,
          source text NOT NULL DEFAULT 'agent',
          is_open boolean NOT NULL DEFAULT false
        );
        CREATE INDEX IF NOT EXISTS sessions_start_idx ON sessions (start_time);
        CREATE INDEX IF NOT EXISTS sessions_end_idx ON sessions (end_time);
        CREATE INDEX IF NOT EXISTS sessions_app_start_idx ON sessions (application_id, start_time);
        CREATE INDEX IF NOT EXISTS sessions_open_idx ON sessions (is_open);

        CREATE TABLE IF NOT EXISTS settings (
          key text PRIMARY KEY,
          value text NOT NULL
        );
        CREATE TABLE IF NOT EXISTS achievements (
          id text PRIMARY KEY,
          achievement_type text NOT NULL,
          unlocked_at timestamptz NOT NULL,
          xp_awarded integer NOT NULL,
          seen boolean NOT NULL DEFAULT false
        );
        CREATE TABLE IF NOT EXISTS backup_history (
          id text PRIMARY KEY,
          file_path text NOT NULL,
          created_at timestamptz NOT NULL,
          status text NOT NULL,
          size_bytes bigint NOT NULL DEFAULT 0,
          kind text NOT NULL DEFAULT 'manual',
          message text
        );
        -- 2.0 additive migration: projects and session assignments (no existing table is altered)
        CREATE TABLE IF NOT EXISTS projects (
          id text PRIMARY KEY,
          name text NOT NULL,
          client text NOT NULL DEFAULT '',
          color text NOT NULL DEFAULT '#5b8def',
          billable boolean NOT NULL DEFAULT true,
          hourly_rate double precision NOT NULL DEFAULT 0,
          archived boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS session_projects (
          session_id text PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
          project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          assigned_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS session_projects_project_idx ON session_projects (project_id);
        INSERT INTO settings (key, value) VALUES ('db.schemaVersion', '2') ON CONFLICT (key) DO NOTHING;
      `);
      globalForDb.__chronosPGliteReady = true;
    })();
    globalForDb.__chronosPGliteInit = attempt;
    attempt.catch((error) => {
      globalForDb.__chronosPGliteInitError = error instanceof Error ? error.message : String(error);
      globalForDb.__chronosPGliteReady = false;
      if (globalForDb.__chronosPGliteInit === attempt) globalForDb.__chronosPGliteInit = undefined;
    });
  }
  await globalForDb.__chronosPGliteInit;
}

/** Flush and close PGlite. Called on graceful shutdown so the on-disk database is consistent. */
export async function closeDatabase(): Promise<void> {
  globalForDb.__chronosPGliteReady = false;
  if (!client.closed) await client.close();
}
