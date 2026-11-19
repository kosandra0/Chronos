import fs from "fs/promises";
import path from "path";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { backupDirectory, createBackup } from "@/lib/dataio";
import { closeOpenSessions, reconcileStale } from "@/lib/engine";
import { badRequest, handle } from "@/lib/http";
import { isValidYmd } from "@/lib/ranges";
import { getTz, invalidateSettingsCache } from "@/lib/settings";

export const dynamic = "force-dynamic";

function dbLocation() {
  const dir = process.env.CHRONOS_DB_DIR || path.join(process.env.CHRONOS_DATA_DIR || process.cwd(), "database");
  return `Embedded PostgreSQL (PGlite) · ${dir}`;
}

async function dirSize(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  async function visit(current: string) {
    let entries;
    try { entries = await fs.readdir(current, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) {
        try { bytes += (await fs.stat(full)).size; files++; } catch { /* file may rotate */ }
      }
    }
  }
  await visit(dir);
  return { bytes, files };
}

export async function GET() {
  return handle(async () => {
    const r = (
      await db.execute(sql`SELECT (SELECT COUNT(*) FROM sessions)::int AS sessions,
        (SELECT COUNT(*) FROM applications)::int AS apps,
        (SELECT COUNT(*) FROM achievements)::int AS achievements,
        (SELECT MIN(start_time) FROM sessions) AS first_session`)
    ).rows[0] as { sessions: number; apps: number; achievements: number; first_session: Date | null };
    const dir = await backupDirectory();
    const dbDir = process.env.CHRONOS_DB_DIR || path.join(process.env.CHRONOS_DATA_DIR || process.cwd(), "database");
    const dbStats = await dirSize(dbDir);
    return {
      location: dbLocation(),
      databaseBytes: dbStats.bytes,
      sessions: r.sessions,
      applications: r.apps,
      achievements: r.achievements,
      firstSession: r.first_session ? new Date(r.first_session).toISOString() : null,
      backupDirectory: dir,
      backups: await dirSize(dir),
    };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { action?: string; before?: string; confirm?: boolean };
    if (body.action === "integrity") {
      await reconcileStale();
      const q = async (query: ReturnType<typeof sql>) => Number(((await db.execute(query)).rows[0] as { c: number }).c);
      const checks = [
        { name: "Database connection", problems: 0 },
        { name: "Sessions ending before they start", problems: await q(sql`SELECT COUNT(*)::int AS c FROM sessions WHERE end_time < start_time`) },
        {
          name: "Closed sessions with inconsistent duration",
          problems: await q(sql`SELECT COUNT(*)::int AS c FROM sessions WHERE is_open = false AND abs(duration_ms - (extract(epoch from (end_time - start_time)) * 1000)::bigint) > 1`),
        },
        {
          name: "Overlapping sessions (> 2 s)",
          problems: await q(sql`SELECT COUNT(*)::int AS c FROM (SELECT start_time, lag(end_time) OVER (ORDER BY start_time, id) AS pe FROM sessions) t WHERE pe IS NOT NULL AND start_time < pe - interval '2 seconds'`),
        },
        { name: "More than one open session", problems: await q(sql`SELECT GREATEST(COUNT(*) - 1, 0)::int AS c FROM sessions WHERE is_open = true`) },
        { name: "Application sessions without an application", problems: await q(sql`SELECT COUNT(*)::int AS c FROM sessions WHERE activity_type = 'app' AND application_id IS NULL`) },
      ];
      return { checks, ok: checks.every((c) => c.problems === 0) };
    }
    if (body.action === "repair-durations") {
      const r = await db.execute(sql`UPDATE sessions SET duration_ms = (extract(epoch from (end_time - start_time)) * 1000)::bigint
        WHERE is_open = false AND abs(duration_ms - (extract(epoch from (end_time - start_time)) * 1000)::bigint) > 1`);
      return { ok: true, repaired: r.rowCount ?? 0 };
    }
    if (body.action === "clear-cache") {
      invalidateSettingsCache();
      const dir = await backupDirectory();
      let removed = 0;
      try {
        for (const f of await fs.readdir(dir)) {
          if (f.endsWith(".tmp")) {
            await fs.rm(path.join(dir, f), { force: true });
            removed++;
          }
        }
      } catch {
        /* directory may not exist yet */
      }
      return { ok: true, removedTempFiles: removed };
    }
    if (body.action === "purge") {
      if (body.confirm !== true) return badRequest("Deleting history requires explicit confirmation.");
      if (!isValidYmd(body.before)) return badRequest("before=YYYY-MM-DD is required");
      const backup = await createBackup("manual");
      if (backup.status !== "ok") return badRequest(`Safety backup failed (${backup.message}). Nothing was deleted.`, 500);
      await closeOpenSessions("purge");
      const tz = await getTz();
      const r = await db.execute(sql`DELETE FROM sessions WHERE end_time < (${body.before + " 00:00:00"}::timestamp AT TIME ZONE ${tz})`);
      return { ok: true, deleted: r.rowCount ?? 0, backup };
    }
    return badRequest("Unknown action");
  });
}
