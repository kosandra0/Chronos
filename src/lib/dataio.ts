import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { withDatabaseWriteLock } from "@/db/write-lock";
import { achievements, applications, backupHistory, sessions } from "@/db/schema";
import { closeOpenSessions } from "./engine";
import { getSettings, getTz, invalidateSettingsCache, updateSettings } from "./settings";
import { getStats, querySessions } from "./stats";
import { formatDetailed, formatShort, formatPct } from "./time";
import { levelFor } from "./gamification";
import { APP_VERSION } from "./changelog";

export const SCHEMA_VERSION = 1;
export const SCHEMA_ID = "chronos-export";
const TYPES = ["app", "desktop", "idle", "locked"];

type ExportApp = {
  id: string;
  identityKey: string;
  name: string;
  executableName: string;
  executablePath: string | null;
  category: string;
  categoryOverridden: boolean;
  detectionStatus: string;
  elevated: boolean;
  firstSeen: string;
  lastSeen: string;
};
type ExportSession = {
  id: string;
  applicationId: string | null;
  startTime: string;
  endTime: string;
  durationMs: number;
  activityType: string;
  terminationReason: string | null;
  windowTitle: string | null;
  source: string;
  date: string;
};
export type ExportFile = {
  schema: typeof SCHEMA_ID;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  timezone: string;
  applications: ExportApp[];
  sessions: ExportSession[];
  dailyStatistics: { date: string; activeMs: number; idleMs: number; desktopMs: number }[];
  historicalStatistics: Record<string, unknown>;
  categories: Record<string, string>;
  settings: Record<string, unknown>;
  gamification: { totalXp: number; level: number; achievements: { id: string; unlockedAt: string; xpAwarded: number }[] };
  backupMetadata: { id: string; createdAt: string; status: string; sizeBytes: number; kind: string }[];
};

export async function buildExport(): Promise<ExportFile> {
  await closeStale();
  const tz = await getTz();
  const [apps, sess, ach, backups, stats, settings] = await Promise.all([
    db.select().from(applications),
    db.execute(sql`SELECT id, application_id, start_time, CASE WHEN is_open THEN now() ELSE end_time END AS end_time,
        CASE WHEN is_open THEN (extract(epoch from (now() - start_time)) * 1000)::bigint ELSE duration_ms END AS duration_ms,
        activity_type, termination_reason, window_title, source, to_char(start_time AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date
      FROM sessions ORDER BY start_time`),
    db.select().from(achievements),
    db.select().from(backupHistory).orderBy(desc(backupHistory.createdAt)).limit(200),
    getStats({ from: null, to: null }),
    getSettings(),
  ]);
  const xp = ach.reduce((n, a) => n + a.xpAwarded, 0);
  return {
    schema: SCHEMA_ID,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    timezone: tz,
    applications: apps.map((a) => ({
      id: a.id,
      identityKey: a.identityKey,
      name: a.name,
      executableName: a.executableName,
      executablePath: a.executablePath,
      category: a.category,
      categoryOverridden: a.categoryOverridden,
      detectionStatus: a.detectionStatus,
      elevated: a.elevated,
      firstSeen: a.firstSeen.toISOString(),
      lastSeen: a.lastSeen.toISOString(),
    })),
    sessions: (sess.rows as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      applicationId: (r.application_id as string | null) ?? null,
      startTime: new Date(r.start_time as string).toISOString(),
      endTime: new Date(r.end_time as string).toISOString(),
      durationMs: Number(r.duration_ms),
      activityType: r.activity_type as string,
      terminationReason: (r.termination_reason as string | null) ?? null,
      windowTitle: (r.window_title as string | null) ?? null,
      source: r.source as string,
      date: r.date as string,
    })),
    dailyStatistics: stats.byDay.map((d) => ({ date: d.day, activeMs: d.active, idleMs: d.idle, desktopMs: d.desktop })),
    historicalStatistics: {
      totals: stats.totals,
      uniqueApplications: stats.uniqueApps,
      sessionCount: stats.sessions.count,
      averages: stats.averages,
      ranking: stats.apps.map((a) => ({ name: a.name, executable: a.exe, ms: a.ms })),
    },
    categories: Object.fromEntries(apps.map((a) => [a.id, a.category])),
    settings: settings as unknown as Record<string, unknown>,
    gamification: {
      totalXp: xp,
      level: levelFor(xp).level,
      achievements: ach.map((a) => ({ id: a.id, unlockedAt: a.unlockedAt.toISOString(), xpAwarded: a.xpAwarded })),
    },
    backupMetadata: backups.map((b) => ({ id: b.id, createdAt: b.createdAt.toISOString(), status: b.status, sizeBytes: b.sizeBytes, kind: b.kind })),
  };
}

async function closeStale() {
  const { reconcileStale } = await import("./engine");
  await reconcileStale();
}

// ---------- Reports (Markdown / TXT) ----------

async function reportData() {
  const stats = await getStats({ from: null, to: null });
  const recent = await querySessions({ page: 1, pageSize: 50, sort: "date", dir: "desc" });
  const weeks = new Map<string, number>();
  const months = new Map<string, number>();
  for (const d of stats.byDay) {
    const dt = new Date(d.day + "T00:00:00Z");
    const mon = new Date(dt.getTime() - ((dt.getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    weeks.set(mon, (weeks.get(mon) ?? 0) + d.total);
    months.set(d.day.slice(0, 7), (months.get(d.day.slice(0, 7)) ?? 0) + d.total);
  }
  return { stats, recent, weeks: [...weeks.entries()].sort().reverse(), months: [...months.entries()].sort().reverse() };
}

export async function renderMarkdown(): Promise<string> {
  const { stats, recent, weeks, months } = await reportData();
  const t = stats.totals;
  const L: string[] = [];
  L.push(`# Chronos Usage Report`, ``, `_Generated ${new Date().toLocaleString()} · Chronos ${APP_VERSION} · timezone ${stats.tz}_`, ``);
  L.push(`> This report is a human-readable summary. It cannot be imported back; use a Chronos JSON export for backups.`, ``);
  L.push(`## Overview`, ``);
  L.push(`| Metric | Value |`, `| --- | --- |`);
  L.push(`| Total screen time | ${formatDetailed(t.screen)} |`, `| Active time | ${formatDetailed(t.active)} |`, `| Idle time | ${formatDetailed(t.idle)} |`, `| Desktop time | ${formatDetailed(t.desktop)} |`);
  L.push(`| Sessions | ${stats.sessions.count} |`, `| Unique applications | ${stats.uniqueApps} |`, `| Usage days | ${stats.averages.usageDays} |`, ``);
  L.push(`## Application ranking`, ``, `| # | Application | Executable | Category | Time | Share |`, `| --- | --- | --- | --- | --- | --- |`);
  stats.apps.forEach((a, i) => L.push(`| ${i + 1} | ${a.name} | ${a.exe} | ${a.category} | ${formatShort(a.ms)} | ${formatPct(a.ms, t.active)} |`));
  if (!stats.apps.length) L.push(`| – | No activity recorded yet | | | | |`);
  L.push(``, `## Daily statistics`, ``, `| Date | Active | Idle | Desktop |`, `| --- | --- | --- | --- |`);
  [...stats.byDay].reverse().slice(0, 90).forEach((d) => L.push(`| ${d.day} | ${formatShort(d.active)} | ${formatShort(d.idle)} | ${formatShort(d.desktop)} |`));
  L.push(``, `## Weekly statistics (week starting Monday)`, ``, `| Week | Screen time |`, `| --- | --- |`);
  weeks.slice(0, 26).forEach(([w, ms]) => L.push(`| ${w} | ${formatShort(ms)} |`));
  L.push(``, `## Monthly statistics`, ``, `| Month | Screen time |`, `| --- | --- |`);
  months.forEach(([w, ms]) => L.push(`| ${w} | ${formatShort(ms)} |`));
  L.push(``, `## Insights`, ``);
  if (stats.insights.length) stats.insights.forEach((i) => L.push(`- ${i}`));
  else L.push(`- Not enough data to generate insights.`);
  L.push(``, `## Recent sessions (latest 50)`, ``, `| Start | End | Application | Type | Duration |`, `| --- | --- | --- | --- | --- |`);
  recent.sessions.forEach((s) => L.push(`| ${new Date(s.start).toLocaleString()} | ${new Date(s.end).toLocaleString()} | ${s.name} | ${s.type} | ${formatShort(s.durationMs)} |`));
  return L.join("\n") + "\n";
}

export async function renderText(): Promise<string> {
  const { stats, recent, weeks, months } = await reportData();
  const t = stats.totals;
  const L: string[] = [];
  const line = "=".repeat(64);
  L.push(line, `CHRONOS USAGE REPORT`, `Generated ${new Date().toLocaleString()} | Chronos ${APP_VERSION} | ${stats.tz}`, line, ``);
  L.push(`Note: this report cannot be imported back. Use a JSON export for backups.`, ``);
  L.push(`OVERVIEW`, `  Total screen time : ${formatDetailed(t.screen)}`, `  Active time       : ${formatDetailed(t.active)}`, `  Idle time         : ${formatDetailed(t.idle)}`, `  Desktop time      : ${formatDetailed(t.desktop)}`);
  L.push(`  Sessions          : ${stats.sessions.count}`, `  Applications      : ${stats.uniqueApps}`, `  Usage days        : ${stats.averages.usageDays}`, ``);
  L.push(`APPLICATION RANKING`);
  if (!stats.apps.length) L.push(`  No activity recorded yet.`);
  stats.apps.forEach((a, i) => L.push(`  ${String(i + 1).padStart(2)}. ${a.name.padEnd(28)} ${formatShort(a.ms).padStart(10)}  ${formatPct(a.ms, t.active).padStart(6)}  [${a.exe}]`));
  L.push(``, `DAILY STATISTICS (latest 90 days)`);
  [...stats.byDay].reverse().slice(0, 90).forEach((d) => L.push(`  ${d.day}  active ${formatShort(d.active).padStart(9)}  idle ${formatShort(d.idle).padStart(9)}  desktop ${formatShort(d.desktop).padStart(9)}`));
  L.push(``, `WEEKLY STATISTICS (week starting Monday)`);
  weeks.slice(0, 26).forEach(([w, ms]) => L.push(`  ${w}  ${formatShort(ms)}`));
  L.push(``, `MONTHLY STATISTICS`);
  months.forEach(([w, ms]) => L.push(`  ${w}  ${formatShort(ms)}`));
  L.push(``, `INSIGHTS`);
  if (stats.insights.length) stats.insights.forEach((i) => L.push(`  - ${i}`));
  else L.push(`  Not enough data to generate insights.`);
  L.push(``, `RECENT SESSIONS (latest 50)`);
  recent.sessions.forEach((s) => L.push(`  ${new Date(s.start).toLocaleString()} -> ${new Date(s.end).toLocaleTimeString()}  ${s.name} (${s.type})  ${formatShort(s.durationMs)}`));
  return L.join("\n") + "\n";
}

// ---------- Import ----------

export type ImportSummary = {
  applications: number;
  sessions: number;
  newSessions: number;
  duplicateSessions: number;
  newApplications: number;
  from: string | null;
  to: string | null;
  schemaVersion: number;
  exportedAt: string;
  existingSessions: number;
};

export type ValidationResult = { ok: true; data: ExportFile; warnings: string[] } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const validTs = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));

export function validateJson(text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON (it may be corrupted or truncated)."] };
  }
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["The JSON root must be an object."] };
  if (raw.schema !== SCHEMA_ID) errors.push(`Not a Chronos export: expected schema "${SCHEMA_ID}".`);
  if (typeof raw.schemaVersion !== "number") errors.push("Missing numeric schemaVersion.");
  else if (raw.schemaVersion > SCHEMA_VERSION) errors.push(`This file uses schema version ${raw.schemaVersion}, newer than supported version ${SCHEMA_VERSION}. Update Chronos first.`);
  else if (raw.schemaVersion < 1) errors.push("Unsupported schema version.");
  if (!Array.isArray(raw.applications)) errors.push("Missing applications array.");
  if (!Array.isArray(raw.sessions)) errors.push("Missing sessions array.");
  if (errors.length) return { ok: false, errors };

  const apps = raw.applications as unknown[];
  const sess = raw.sessions as unknown[];
  const appIds = new Set<string>();
  const keys = new Set<string>();
  apps.forEach((a, i) => {
    if (!isObj(a) || typeof a.id !== "string" || typeof a.identityKey !== "string" || typeof a.name !== "string" || typeof a.executableName !== "string") {
      if (errors.length < 20) errors.push(`applications[${i}] is missing required fields (id, identityKey, name, executableName).`);
      return;
    }
    if (!validTs(a.firstSeen) || !validTs(a.lastSeen)) errors.length < 20 && errors.push(`applications[${i}] has invalid timestamps.`);
    if (appIds.has(a.id)) errors.length < 20 && errors.push(`Duplicate application id ${a.id}.`);
    if (keys.has(a.identityKey)) errors.length < 20 && errors.push(`Duplicate application identityKey ${a.identityKey}.`);
    appIds.add(a.id);
    keys.add(a.identityKey);
  });
  const seen = new Set<string>();
  let dupes = 0;
  const now = Date.now() + 86400000;
  sess.forEach((s, i) => {
    const push = (m: string) => errors.length < 20 && errors.push(`sessions[${i}]: ${m}`);
    if (!isObj(s)) return push("not an object.");
    if (typeof s.id !== "string" || !s.id) return push("missing id.");
    if (!validTs(s.startTime) || !validTs(s.endTime)) return push("invalid start/end timestamp.");
    const st = Date.parse(s.startTime as string);
    const en = Date.parse(s.endTime as string);
    if (en < st) return push("end is before start.");
    if (st < Date.parse("2000-01-01") || en > now) return push("timestamp outside plausible range.");
    if (typeof s.durationMs !== "number" || !Number.isInteger(s.durationMs) || s.durationMs < 0) return push("durationMs must be a non-negative integer.");
    if (Math.abs(s.durationMs - (en - st)) > 2000) warnings.length < 20 && warnings.push(`sessions[${i}]: durationMs differs from end-start; duration will be recomputed.`);
    if (typeof s.activityType !== "string" || !TYPES.includes(s.activityType)) return push("invalid activityType.");
    if (s.activityType === "app" && (typeof s.applicationId !== "string" || !appIds.has(s.applicationId))) return push("references an unknown application.");
    if (seen.has(s.id)) {
      dupes++;
      return;
    }
    seen.add(s.id);
  });
  if (dupes) warnings.push(`${dupes} duplicate session id(s) inside the file will be skipped.`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, data: raw as unknown as ExportFile, warnings };
}

export async function previewImport(data: ExportFile): Promise<ImportSummary> {
  const ids = data.sessions.map((s) => s.id);
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 5000) {
    const r = await db.select({ id: sessions.id }).from(sessions).where(inArray(sessions.id, ids.slice(i, i + 5000)));
    r.forEach((x) => existing.add(x.id));
  }
  const keys = data.applications.map((a) => a.identityKey);
  const have = keys.length ? await db.select({ k: applications.identityKey }).from(applications).where(inArray(applications.identityKey, keys)) : [];
  const unique = new Set(ids);
  const cnt = await db.select({ c: sql<number>`count(*)::int` }).from(sessions);
  const times = data.sessions.map((s) => Date.parse(s.startTime)).sort((a, b) => a - b);
  return {
    applications: data.applications.length,
    sessions: unique.size,
    duplicateSessions: [...unique].filter((i) => existing.has(i)).length,
    newSessions: [...unique].filter((i) => !existing.has(i)).length,
    newApplications: data.applications.length - have.length,
    from: times.length ? new Date(times[0]).toISOString() : null,
    to: times.length ? new Date(times[times.length - 1]).toISOString() : null,
    schemaVersion: data.schemaVersion,
    exportedAt: data.exportedAt,
    existingSessions: cnt[0]?.c ?? 0,
  };
}

async function chunked<T>(arr: T[], n: number, fn: (c: T[]) => Promise<number | void>) {
  let total = 0;
  for (let i = 0; i < arr.length; i += n) total += (await fn(arr.slice(i, i + n))) ?? 0;
  return total;
}

export async function applyImport(data: ExportFile, mode: "merge" | "replace") {
  let backup: BackupRecord | null = null;
  if (mode === "replace") {
    backup = await createBackup("pre-import");
    if (backup.status !== "ok") throw new Error(`Could not create the safety backup (${backup.message}). Nothing was changed.`);
  }
  await closeOpenSessions("import");
  const result = await withDatabaseWriteLock(() => db.transaction(async (tx) => {
    if (mode === "replace") {
      await tx.delete(sessions);
      await tx.delete(applications);
      await tx.delete(achievements);
    }
    // Map file application ids -> database ids (identity key is authoritative).
    const idMap = new Map<string, string>();
    let newApps = 0;
    for (const a of data.applications) {
      const found = await tx.select().from(applications).where(eq(applications.identityKey, a.identityKey)).limit(1);
      if (found[0]) {
        idMap.set(a.id, found[0].id);
        const first = new Date(a.firstSeen) < found[0].firstSeen ? new Date(a.firstSeen) : found[0].firstSeen;
        const last = new Date(a.lastSeen) > found[0].lastSeen ? new Date(a.lastSeen) : found[0].lastSeen;
        await tx.update(applications).set({ firstSeen: first, lastSeen: last }).where(eq(applications.id, found[0].id));
        continue;
      }
      const clash = await tx.select({ id: applications.id }).from(applications).where(eq(applications.id, a.id)).limit(1);
      const id = clash[0] ? randomUUID() : a.id;
      await tx.insert(applications).values({
        id,
        identityKey: a.identityKey,
        name: a.name,
        executableName: a.executableName,
        executablePath: a.executablePath ?? null,
        category: a.category || "Other",
        categoryOverridden: !!a.categoryOverridden,
        detectionStatus: a.detectionStatus || "ok",
        elevated: !!a.elevated,
        firstSeen: new Date(a.firstSeen),
        lastSeen: new Date(a.lastSeen),
      });
      idMap.set(a.id, id);
      newApps++;
    }
    const seen = new Set<string>();
    const rowsToInsert = data.sessions
      .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
      .map((s) => {
        const st = new Date(s.startTime);
        const en = new Date(s.endTime);
        return {
          id: s.id,
          applicationId: s.applicationId ? (idMap.get(s.applicationId) ?? null) : null,
          startTime: st,
          endTime: en,
          durationMs: en.getTime() - st.getTime(),
          activityType: s.activityType,
          terminationReason: s.terminationReason ?? "imported",
          windowTitle: s.windowTitle ?? null,
          source: s.source || "import",
          isOpen: false,
        };
      });
    const inserted = await chunked(rowsToInsert, 1000, async (c) => {
      const r = await tx.insert(sessions).values(c).onConflictDoNothing().returning({ id: sessions.id });
      return r.length;
    });
    const ach = data.gamification?.achievements ?? [];
    if (Array.isArray(ach)) {
      for (const a of ach) {
        if (isObj(a) && typeof a.id === "string" && validTs(a.unlockedAt) && typeof a.xpAwarded === "number")
          await tx.insert(achievements).values({ id: a.id, achievementType: a.id, unlockedAt: new Date(a.unlockedAt), xpAwarded: a.xpAwarded, seen: true }).onConflictDoNothing();
      }
    }
    return { insertedSessions: inserted, skippedSessions: rowsToInsert.length - inserted, newApplications: newApps };
  }));
  if (mode === "replace" && isObj(data.settings)) {
    const { backupDir: _bd, ...rest } = data.settings as Record<string, unknown>;
    void _bd;
    await updateSettings(rest);
  }
  invalidateSettingsCache();
  return { ...result, backup };
}

// ---------- Backups ----------

export type BackupRecord = { id: string; filePath: string; createdAt: string; status: string; sizeBytes: number; kind: string; message: string | null };

export async function backupDirectory(): Promise<string> {
  const s = await getSettings();
  return s.backupDir.trim() || process.env.CHRONOS_BACKUP_DIR || path.join(process.env.CHRONOS_DATA_DIR || process.cwd(), "backups");
}

export async function createBackup(kind: "manual" | "scheduled" | "pre-import" | "pre-restore"): Promise<BackupRecord> {
  const id = randomUUID();
  const createdAt = new Date();
  const dir = await backupDirectory();
  const stamp = createdAt.toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `chronos-backup-${stamp}-${id.slice(0, 8)}.json`);
  let status = "ok";
  let message: string | null = null;
  let size = 0;
  try {
    await fs.mkdir(dir, { recursive: true });
    const data = await buildExport();
    const text = JSON.stringify(data);
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, text, { flag: "wx" }); // never overwrite
    // Verify integrity before the file becomes visible.
    const back = JSON.parse(await fs.readFile(tmp, "utf8")) as ExportFile;
    if (back.sessions.length !== data.sessions.length || back.applications.length !== data.applications.length) throw new Error("Verification failed: record counts differ.");
    await fs.rename(tmp, file);
    size = (await fs.stat(file)).size;
    message = `Verified ${data.sessions.length} sessions, ${data.applications.length} applications.`;
  } catch (e) {
    status = "failed";
    message = e instanceof Error ? e.message : String(e);
    await fs.rm(`${file}.tmp`, { force: true }).catch(() => {});
  }
  await db.insert(backupHistory).values({ id, filePath: file, createdAt, status, sizeBytes: size, kind, message });
  return { id, filePath: file, createdAt: createdAt.toISOString(), status, sizeBytes: size, kind, message };
}

export async function restoreBackup(id: string) {
  const r = await db.select().from(backupHistory).where(eq(backupHistory.id, id)).limit(1);
  if (!r[0] || r[0].status !== "ok") throw new Error("Backup not found or not valid.");
  let text: string;
  try {
    text = await fs.readFile(r[0].filePath, "utf8");
  } catch {
    throw new Error("The backup file could not be read. It may have been moved or deleted.");
  }
  const v = validateJson(text);
  if (!v.ok) throw new Error(`Backup failed validation: ${v.errors[0]}`);
  return applyImport(v.data, "replace");
}

export async function listBackups() {
  const rows = await db.select().from(backupHistory).orderBy(desc(backupHistory.createdAt)).limit(50);
  return rows.map((b) => ({ id: b.id, filePath: b.filePath, createdAt: b.createdAt.toISOString(), status: b.status, sizeBytes: b.sizeBytes, kind: b.kind, message: b.message }));
}
