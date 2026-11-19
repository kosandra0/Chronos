import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { achievements } from "@/db/schema";
import { getKV, getTz, setKV } from "./settings";

export type AchievementDef = { id: string; title: string; description: string; xp: number };

// Finite, milestone-based XP. Leaving the computer running never produces unlimited XP.
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_session", title: "First Session", description: "Record your first activity session.", xp: 50 },
  { id: "first_full_day", title: "A Full Day", description: "Record at least 6 hours of activity in a single day.", xp: 100 },
  { id: "seven_days", title: "Seven Days of Insight", description: "Use Chronos on 7 different days.", xp: 150 },
  { id: "streak_3", title: "Steady Observer", description: "Track at least 30 minutes a day for 3 days in a row.", xp: 100 },
  { id: "streak_14", title: "Consistent Tracker", description: "Track at least 30 minutes a day for 14 days in a row.", xp: 250 },
  { id: "apps_10", title: "Wide Horizons", description: "Observe 10 different applications.", xp: 75 },
  { id: "sessions_100", title: "Hundred Sessions", description: "Record 100 activity sessions.", xp: 60 },
  { id: "hours_10", title: "Ten Hours Recorded", description: "Accumulate 10 hours of active time.", xp: 80 },
  { id: "hours_100", title: "Hundred Hours Recorded", description: "Accumulate 100 hours of active time.", xp: 300 },
  { id: "explore_apps", title: "Application Explorer", description: "Open an application's detail page.", xp: 40 },
  { id: "review_weekly", title: "Weekly Review", description: "Review your statistics for This Week.", xp: 40 },
  { id: "explore_heatmap", title: "Pattern Seeker", description: "Explore the activity heat map.", xp: 30 },
  { id: "first_backup", title: "Safety Net", description: "Create your first verified backup.", xp: 40 },
];

export const EVENT_ACHIEVEMENTS = ["explore_apps", "review_weekly", "explore_heatmap"];

const LEVEL_NAMES = [
  "Digital Explorer",
  "Time Observer",
  "Usage Analyst",
  "Digital Strategist",
  "Chronos Enthusiast",
  "Rhythm Keeper",
  "Focus Cartographer",
  "Habit Architect",
  "Temporal Scholar",
  "Chronos Master",
];

export function xpForLevel(level: number) {
  return 50 * level * (level - 1); // L1:0 L2:100 L3:300 L4:600 L5:1000 ...
}

export function levelFor(xp: number) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    name: LEVEL_NAMES[level - 1] ?? `Chronos Master ${level - LEVEL_NAMES.length + 1}`,
    xp,
    currentFloor: cur,
    nextAt: next,
    progress: (xp - cur) / (next - cur),
    toNext: next - xp,
  };
}

export async function recordEvent(name: string) {
  if (!EVENT_ACHIEVEMENTS.includes(name)) return false;
  if (!(await getKV(`event:${name}`))) await setKV(`event:${name}`, new Date().toISOString());
  return true;
}

async function metrics() {
  const tz = await getTz();
  const days = (
    await db.execute(sql`
      SELECT to_char(start_time AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
        SUM(CASE WHEN is_open THEN (extract(epoch from (now() - start_time)) * 1000)::bigint ELSE duration_ms END)::bigint AS ms
      FROM sessions WHERE activity_type IN ('app','desktop') GROUP BY 1 ORDER BY 1`)
  ).rows as unknown as { day: string; ms: string }[];
  const counts = (
    await db.execute(sql`SELECT
      (SELECT COUNT(*) FROM sessions)::int AS sessions,
      (SELECT COUNT(*) FROM sessions WHERE is_open = false)::int AS closed,
      (SELECT COUNT(DISTINCT application_id) FROM sessions WHERE activity_type = 'app')::int AS apps,
      (SELECT COUNT(*) FROM backup_history WHERE status = 'ok')::int AS backups`)
  ).rows[0] as unknown as { sessions: number; closed: number; apps: number; backups: number };
  const dayMs = days.map((d) => ({ day: d.day, ms: Number(d.ms) }));
  const totalMs = dayMs.reduce((n, d) => n + d.ms, 0);
  // Longest streak of days with >= 30 minutes.
  let best = 0,
    run = 0,
    prev: number | null = null;
  for (const d of dayMs) {
    if (d.ms < 30 * 60_000) {
      run = 0;
      prev = null;
      continue;
    }
    const t = Date.parse(d.day + "T00:00:00Z");
    run = prev !== null && t - prev === 86400000 ? run + 1 : 1;
    prev = t;
    best = Math.max(best, run);
  }
  return {
    closedSessions: counts.closed,
    sessions: counts.sessions,
    apps: counts.apps,
    backups: counts.backups,
    usageDays: dayMs.filter((d) => d.ms > 0).length,
    maxDayMs: dayMs.reduce((n, d) => Math.max(n, d.ms), 0),
    totalMs,
    streak: best,
  };
}

export async function evaluate() {
  const m = await metrics();
  const events = await Promise.all(EVENT_ACHIEVEMENTS.map(async (e) => [e, !!(await getKV(`event:${e}`))] as const));
  const ev = Object.fromEntries(events);
  const ok: Record<string, boolean> = {
    first_session: m.closedSessions >= 1,
    first_full_day: m.maxDayMs >= 6 * 3600_000,
    seven_days: m.usageDays >= 7,
    streak_3: m.streak >= 3,
    streak_14: m.streak >= 14,
    apps_10: m.apps >= 10,
    sessions_100: m.sessions >= 100,
    hours_10: m.totalMs >= 10 * 3600_000,
    hours_100: m.totalMs >= 100 * 3600_000,
    explore_apps: ev.explore_apps,
    review_weekly: ev.review_weekly,
    explore_heatmap: ev.explore_heatmap,
    first_backup: m.backups >= 1,
  };
  const have = new Set((await db.select({ id: achievements.id }).from(achievements)).map((a) => a.id));
  for (const def of ACHIEVEMENTS) {
    if (ok[def.id] && !have.has(def.id)) {
      await db
        .insert(achievements)
        .values({ id: def.id, achievementType: def.id, unlockedAt: new Date(), xpAwarded: def.xp, seen: false })
        .onConflictDoNothing();
    }
  }
  return getProgress(m);
}

export async function getProgress(m?: Awaited<ReturnType<typeof metrics>>) {
  const metricsNow = m ?? (await metrics());
  const rows = await db.select().from(achievements).orderBy(sql`${achievements.unlockedAt} desc`);
  const xp = rows.reduce((n, r) => n + r.xpAwarded, 0);
  const unlocked = new Map(rows.map((r) => [r.id, r]));
  return {
    level: levelFor(xp),
    xp,
    achievements: ACHIEVEMENTS.map((a) => ({
      ...a,
      unlockedAt: unlocked.get(a.id)?.unlockedAt.toISOString() ?? null,
      seen: unlocked.get(a.id)?.seen ?? true,
    })),
    unseen: ACHIEVEMENTS.filter((a) => unlocked.has(a.id) && !unlocked.get(a.id)!.seen).map((a) => ({ id: a.id, title: a.title, xp: a.xp })),
    stats: metricsNow,
  };
}

export async function markSeen() {
  await db.update(achievements).set({ seen: true }).where(eq(achievements.seen, false));
}
