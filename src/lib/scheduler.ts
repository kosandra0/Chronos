import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { backupHistory } from "@/db/schema";
import { createBackup } from "./dataio";
import { reconcileStale } from "./engine";
import { getSettings } from "./settings";
import { BACKUP_FREQ_MS } from "./settings-shared";
import { v2Tick } from "./v2/store";

const g = globalThis as typeof globalThis & { __chronosScheduler?: NodeJS.Timeout };

export async function nextBackupInfo() {
  const s = await getSettings();
  const last = await db.select().from(backupHistory).where(eq(backupHistory.status, "ok")).orderBy(desc(backupHistory.createdAt)).limit(1);
  const lastAt = last[0]?.createdAt.getTime() ?? null;
  const next = s.backupEnabled ? (lastAt ? lastAt + BACKUP_FREQ_MS[s.backupFrequency] : Date.now()) : null;
  return { lastBackupAt: lastAt ? new Date(lastAt).toISOString() : null, nextBackupAt: next ? new Date(next).toISOString() : null };
}

let lastAttempt = 0;

export async function tick() {
  try {
    await reconcileStale();
    // focus timer, limit and weekly-report notifications (queued for the desktop host). Automated tests drive this
    // themselves with an explicit clock (WATCHTOWER_TEST_HOOKS), so the real-time tick is skipped there.
    if (process.env.WATCHTOWER_TEST_HOOKS !== "1") await v2Tick();
    const s = await getSettings();
    if (!s.backupEnabled) return;
    const info = await nextBackupInfo();
    const due = info.nextBackupAt ? Date.parse(info.nextBackupAt) <= Date.now() : false;
    // Do not create an empty backup, and back off 15 min after a failed attempt.
    if (due && Date.now() - lastAttempt > 15 * 60_000) {
      lastAttempt = Date.now();
      const sessCount = await db.execute(sql`select 1 from sessions limit 1`);
      if (sessCount.rows.length) await createBackup("scheduled");
    }
  } catch (e) {
    console.error("[chronos] scheduler tick failed", e);
  }
}

export function startScheduler() {
  if (g.__chronosScheduler) return;
  g.__chronosScheduler = setInterval(tick, 60_000);
  void tick();
}
