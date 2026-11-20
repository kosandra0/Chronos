import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { dataDirectory, db, databaseInitState, initializeDatabase, REQUIRED_TABLES } from "@/db";
import { APP_VERSION } from "@/lib/changelog";

export const dynamic = "force-dynamic";

const INIT_WAIT_MS = 10_000;

function dataDirectoryWritable(): boolean {
  const probe = path.join(dataDirectory, `.chronos-write-test-${process.pid}`);
  try {
    fs.mkdirSync(dataDirectory, { recursive: true });
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Readiness check used by the desktop host. HTTP 200 only when the server is up AND the embedded
 * database is initialised, queryable, has every required table, and the data directory is writable.
 * Otherwise 503 with the failing component(s) so the host can report a precise cause.
 */
export async function GET() {
  const health = {
    ok: false,
    server: true,
    database: false,
    schema: false,
    dataDirectory: false,
    scheduler: false,
    agentScript: false,
    initializing: false,
    initFailed: false,
    error: null as string | null,
    version: APP_VERSION,
  };

  health.dataDirectory = dataDirectoryWritable();
  if (!health.dataDirectory) health.error = "The WatchTower data directory is not writable.";

  try {
    const init = initializeDatabase();
    const timeout = new Promise<"timeout">((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), INIT_WAIT_MS);
      timer.unref?.();
    });
    const outcome = await Promise.race([init.then(() => "ready" as const), timeout]);
    if (outcome === "timeout") {
      health.initializing = true;
      health.error = health.error ?? "Database initialization is still running.";
      // The pending promise may still reject later; keep it from becoming an unhandled rejection.
      init.catch(() => undefined);
    } else {
      await db.execute(sql`select 1`);
      health.database = true;
      const result = await db.execute(
        sql`select table_name from information_schema.tables where table_schema = 'public'`,
      );
      const present = new Set((result.rows as Array<{ table_name: string }>).map((row) => row.table_name));
      const missing = REQUIRED_TABLES.filter((table) => !present.has(table));
      health.schema = missing.length === 0;
      if (!health.schema) health.error = health.error ?? `Database schema is incomplete (missing: ${missing.join(", ")}).`;
    }
  } catch (error) {
    const state = databaseInitState();
    health.initFailed = true;
    health.error = state.error ?? (error instanceof Error ? error.message : String(error));
  }

  const g = globalThis as typeof globalThis & { __chronosScheduler?: unknown };
  health.scheduler = Boolean(g.__chronosScheduler);
  const agentPath = process.env.WATCHTOWER_AGENT_PATH;
  health.agentScript = agentPath ? fs.existsSync(agentPath) : false;

  health.ok = health.server && health.database && health.schema && health.dataDirectory;
  return Response.json(health, { status: health.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
