import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { getSettings, getTz } from "./settings";
import { addDays, parseYmd, ymd, type DateRange } from "./ranges";
import { formatShort, formatPct } from "./time";

async function rows<T>(q: SQL): Promise<T[]> {
  const r = await db.execute(q);
  return r.rows as unknown as T[];
}

export function bounds(range: DateRange) {
  const from = range.from ?? "1970-01-01";
  const toExcl = range.to ? ymd(addDays(parseYmd(range.to), 1)) : "2999-12-31";
  return { fromLocal: `${from} 00:00:00`, toLocal: `${toExcl} 00:00:00` };
}

/** Effective duration of a session (open sessions run to "now"). */
export const dur = (a = "s") =>
  sql.raw(`(CASE WHEN ${a}.is_open THEN (extract(epoch from (now() - ${a}.start_time)) * 1000)::bigint ELSE ${a}.duration_ms END)`);
const endExpr = (a = "s") => sql.raw(`(CASE WHEN ${a}.is_open THEN now() ELSE ${a}.end_time END)`);

export type SliceRow = { day: string; hour: number; appId: string | null; type: string; ms: number };

/**
 * Splits every session into per-local-hour slices (so midnight/hour boundaries are exact)
 * clipped to the requested range, aggregated by day, hour, application and activity type.
 */
export async function getSlices(range: DateRange, tz: string, appId?: string): Promise<SliceRow[]> {
  const { fromLocal, toLocal } = bounds(range);
  const appFilter = appId ? sql`AND application_id = ${appId}` : sql``;
  const r = await rows<{ day: string; hour: number; appId: string | null; type: string; ms: string }>(sql`
    WITH s AS (
      SELECT application_id, activity_type,
        (start_time AT TIME ZONE ${tz}) AS ls,
        ((CASE WHEN is_open THEN now() ELSE end_time END) AT TIME ZONE ${tz}) AS le
      FROM sessions
      WHERE start_time < (${toLocal}::timestamp AT TIME ZONE ${tz})
        AND (is_open OR end_time > (${fromLocal}::timestamp AT TIME ZONE ${tz}))
        ${appFilter}
    ), sl AS (
      SELECT s.application_id, s.activity_type, gs AS hr,
        EXTRACT(EPOCH FROM (LEAST(s.le, gs + interval '1 hour', ${toLocal}::timestamp) - GREATEST(s.ls, gs, ${fromLocal}::timestamp))) * 1000 AS ms
      FROM s CROSS JOIN LATERAL generate_series(date_trunc('hour', s.ls), date_trunc('hour', s.le), interval '1 hour') AS gs
    )
    SELECT to_char(hr, 'YYYY-MM-DD') AS day, EXTRACT(HOUR FROM hr)::int AS hour,
      application_id AS "appId", activity_type AS type, ROUND(SUM(ms))::bigint AS ms
    FROM sl WHERE ms > 0 GROUP BY 1, 2, 3, 4 ORDER BY 1, 2
  `);
  return r.map((x) => ({ ...x, ms: Number(x.ms) }));
}

type SessAgg = { type: string; c: number; mx: number; mn: number; sm: number };

async function sessionAggs(range: DateRange, tz: string, appId?: string): Promise<SessAgg[]> {
  const { fromLocal, toLocal } = bounds(range);
  const appFilter = appId ? sql`AND s.application_id = ${appId}` : sql``;
  const r = await rows<{ type: string; c: number; mx: string; mn: string; sm: string }>(sql`
    SELECT s.activity_type AS type, COUNT(*)::int AS c, MAX(${dur()})::bigint AS mx, MIN(${dur()})::bigint AS mn, SUM(${dur()})::bigint AS sm
    FROM sessions s
    WHERE s.start_time >= (${fromLocal}::timestamp AT TIME ZONE ${tz}) AND s.start_time < (${toLocal}::timestamp AT TIME ZONE ${tz}) ${appFilter}
    GROUP BY 1
  `);
  return r.map((x) => ({ type: x.type, c: x.c, mx: Number(x.mx), mn: Number(x.mn), sm: Number(x.sm) }));
}

type AppRef = { id: string; name: string; executableName: string; category: string };

async function appRefs(ids: string[]): Promise<Map<string, AppRef>> {
  const m = new Map<string, AppRef>();
  if (!ids.length) return m;
  const r = await rows<{ id: string; name: string; executable_name: string; category: string }>(
    sql`SELECT id, name, executable_name, category FROM applications WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`,
  );
  for (const a of r) m.set(a.id, { id: a.id, name: a.name, executableName: a.executable_name, category: a.category });
  return m;
}

function words(ms: number) {
  return formatShort(ms);
}

export type DayRow = { day: string; active: number; idle: number; desktop: number; total: number };

export async function getStats(range: DateRange, opts: { appId?: string } = {}) {
  const tz = await getTz();
  const settings = await getSettings();
  const idleIn = settings.idleInTotal;
  const slices = await getSlices(range, tz, opts.appId);
  const aggs = await sessionAggs(range, tz, opts.appId);

  let app = 0,
    desktop = 0,
    idle = 0,
    locked = 0;
  const byApp = new Map<string, number>();
  const dayMap = new Map<string, DayRow>();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, active: 0, idle: 0, desktop: 0, total: 0 }));
  for (const s of slices) {
    const d = dayMap.get(s.day) ?? { day: s.day, active: 0, idle: 0, desktop: 0, total: 0 };
    const h = hours[s.hour];
    if (s.type === "app") {
      app += s.ms;
      d.active += s.ms;
      h.active += s.ms;
      if (s.appId) byApp.set(s.appId, (byApp.get(s.appId) ?? 0) + s.ms);
    } else if (s.type === "desktop") {
      desktop += s.ms;
      d.active += s.ms;
      d.desktop += s.ms;
      h.active += s.ms;
      h.desktop += s.ms;
    } else if (s.type === "idle") {
      idle += s.ms;
      d.idle += s.ms;
      h.idle += s.ms;
    } else locked += s.ms;
    dayMap.set(s.day, d);
  }
  const byDay = [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day));
  for (const d of byDay) d.total = d.active + (idleIn ? d.idle : 0);
  for (const h of hours) h.total = h.active + (idleIn ? h.idle : 0);
  const active = app + desktop;
  const screen = active + (idleIn ? idle : 0);

  const refs = await appRefs([...byApp.keys()]);
  const apps = [...byApp.entries()]
    .map(([id, ms]) => {
      const r = refs.get(id);
      return { id, name: r?.name ?? "Unknown", exe: r?.executableName ?? "", category: r?.category ?? "Other", ms, pct: active ? ms / active : 0 };
    })
    .sort((a, b) => b.ms - a.ms);

  const catMap = new Map<string, number>();
  for (const a of apps) catMap.set(a.category, (catMap.get(a.category) ?? 0) + a.ms);
  if (desktop) catMap.set("Desktop", desktop);
  const categories = [...catMap.entries()].map(([category, ms]) => ({ category, ms })).sort((a, b) => b.ms - a.ms);

  // Session statistics (sessions are attributed to the day they start).
  const g = (t: string) => aggs.find((a) => a.type === t);
  const activeAggs = [g("app"), g("desktop")].filter(Boolean) as SessAgg[];
  const activeCount = activeAggs.reduce((n, a) => n + a.c, 0);
  const activeSum = activeAggs.reduce((n, a) => n + a.sm, 0);
  const sessionCount = aggs.filter((a) => a.type !== "locked").reduce((n, a) => n + a.c, 0);
  const idleAgg = g("idle");

  let longest: { ms: number; start: string; app: string } | null = null;
  if (activeCount) {
    const { fromLocal, toLocal } = bounds(range);
    const appFilter = opts.appId ? sql`AND s.application_id = ${opts.appId}` : sql``;
    const l = await rows<{ start_time: Date; name: string | null; d: string }>(sql`
      SELECT s.start_time, a.name, ${dur()}::bigint AS d FROM sessions s LEFT JOIN applications a ON a.id = s.application_id
      WHERE s.activity_type IN ('app','desktop') AND s.start_time >= (${fromLocal}::timestamp AT TIME ZONE ${tz})
        AND s.start_time < (${toLocal}::timestamp AT TIME ZONE ${tz}) ${appFilter}
      ORDER BY d DESC LIMIT 1`);
    if (l[0]) longest = { ms: Number(l[0].d), start: new Date(l[0].start_time).toISOString(), app: l[0].name ?? "Desktop" };
  }

  // Denominators
  const today = ymd(new Date());
  const firstDay = range.from ?? byDay[0]?.day ?? today;
  const lastDay = range.to && range.to < today ? range.to : today;
  const calendarDays = firstDay > lastDay ? 0 : Math.round((parseYmd(lastDay).getTime() - parseYmd(firstDay).getTime()) / 86400000) + 1;
  const usageDays = byDay.filter((d) => d.total > 0).length;
  const usedDays = byDay.filter((d) => d.total > 0);
  const highest = usedDays.length ? usedDays.reduce((a, b) => (b.total > a.total ? b : a)) : null;
  const lowest = usedDays.length ? usedDays.reduce((a, b) => (b.total < a.total ? b : a)) : null;
  const averages = {
    perUsageDay: usageDays ? Math.round(screen / usageDays) : null,
    perCalendarDay: calendarDays ? Math.round(screen / calendarDays) : null,
    perWeek: calendarDays >= 1 ? Math.round(screen / (calendarDays / 7)) : null,
    perMonth: calendarDays >= 1 ? Math.round(screen / (calendarDays / 30.4375)) : null,
    usageDays,
    calendarDays,
  };

  const switches = Math.max(0, activeCount - 1);
  const switchesPerHour = active > 0 ? switches / (active / 3600000) : null;

  // Insights — derived strictly from recorded data.
  const insights: string[] = [];
  if (active >= 60_000 && !opts.appId) {
    if (apps[0]) insights.push(`${apps[0].name} was your most-used application (${formatPct(apps[0].ms, active)} of active time, ${words(apps[0].ms)}).`);
    const dev = catMap.get("Development") ?? 0;
    if (dev > 0) insights.push(`You spent ${formatPct(dev, active)} of your active time in development tools.`);
    if (longest) insights.push(`Your longest uninterrupted session lasted ${words(longest.ms)} in ${longest.app}.`);
    if (settings.idleEnabled && idleAgg && idleAgg.c > 0) insights.push(`You had ${idleAgg.c} idle session${idleAgg.c === 1 ? "" : "s"}, ${words(idle)} in total.`);
    const peak = hours.reduce((a, b) => (b.active > a.active ? b : a));
    if (peak.active > 0) insights.push(`Your busiest hour was ${String(peak.hour).padStart(2, "0")}:00–${String((peak.hour + 1) % 24).padStart(2, "0")}:00.`);
    if (desktop > 0 && desktop / active >= 0.05) insights.push(`${formatPct(desktop, active)} of your active time was spent on the Windows desktop.`);
    if (switchesPerHour !== null && activeCount >= 5) insights.push(`You switched activity ${switchesPerHour.toFixed(1)} times per active hour.`);
  }

  return {
    range,
    tz,
    idleInTotal: idleIn,
    totals: { screen, active, idle, desktop, app, locked },
    uniqueApps: apps.length,
    apps,
    categories,
    byDay,
    byHour: hours,
    sessions: {
      count: sessionCount,
      activeCount,
      avgMs: activeCount ? Math.round(activeSum / activeCount) : null,
      longest,
      shortestMs: activeAggs.length ? Math.min(...activeAggs.filter((a) => a.c > 0).map((a) => a.mn)) : null,
      switches,
      switchesPerHour,
    },
    idle: {
      count: idleAgg?.c ?? 0,
      totalMs: idle,
      longestMs: idleAgg?.mx ?? 0,
      avgMs: idleAgg && idleAgg.c ? Math.round(idleAgg.sm / idleAgg.c) : null,
      byDay: byDay.filter((d) => d.idle > 0).map((d) => ({ day: d.day, ms: d.idle })),
    },
    highestDay: highest ? { day: highest.day, ms: highest.total } : null,
    lowestDay: lowest ? { day: lowest.day, ms: lowest.total } : null,
    mostUsed: apps[0] ?? null,
    leastUsed: apps.length > 1 ? apps[apps.length - 1] : apps[0] ?? null,
    averages,
    insights,
  };
}

export type StatsResult = Awaited<ReturnType<typeof getStats>>;

// ---------- Applications list ----------

const APP_SORTS: Record<string, string> = {
  most: "total DESC",
  least: "total ASC",
  alpha: "lower(a.name) ASC",
  recent: "last_used DESC NULLS LAST",
  longest: "longest DESC NULLS LAST",
  count: "cnt DESC",
};

export async function listApps(p: { q?: string; sort?: string; category?: string }) {
  const order = sql.raw(APP_SORTS[p.sort ?? "most"] ?? APP_SORTS.most);
  const conds: SQL[] = [];
  if (p.q) {
    const like = `%${p.q}%`;
    conds.push(sql`(a.name ILIKE ${like} OR a.executable_name ILIKE ${like} OR a.executable_path ILIKE ${like})`);
  }
  if (p.category && p.category !== "all") conds.push(sql`a.category = ${p.category}`);
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
  const list = await rows<Record<string, unknown>>(sql`
    SELECT a.id, a.name, a.executable_name, a.executable_path, a.category, a.category_overridden, a.detection_status, a.elevated, a.first_seen, a.last_seen,
      COALESCE(x.total, 0)::bigint AS total, COALESCE(x.cnt, 0)::int AS cnt, x.longest, x.shortest, x.last_used
    FROM applications a
    LEFT JOIN (
      SELECT s.application_id, SUM(${dur()}) AS total, COUNT(*) AS cnt, MAX(${dur()}) AS longest, MIN(${dur()}) AS shortest, MAX(${endExpr()}) AS last_used
      FROM sessions s WHERE s.activity_type = 'app' GROUP BY s.application_id
    ) x ON x.application_id = a.id
    ${where}
    ORDER BY ${order}, a.id
  `);
  const grand = await rows<{ t: string }>(sql`SELECT COALESCE(SUM(${dur()}), 0)::bigint AS t FROM sessions s WHERE s.activity_type IN ('app','desktop')`);
  const grandTotal = Number(grand[0]?.t ?? 0);
  return {
    grandTotal,
    apps: list.map((a) => ({
      id: a.id as string,
      name: a.name as string,
      exe: a.executable_name as string,
      path: (a.executable_path as string | null) ?? null,
      category: a.category as string,
      categoryOverridden: a.category_overridden as boolean,
      detectionStatus: a.detection_status as string,
      elevated: a.elevated as boolean,
      firstSeen: new Date(a.first_seen as string).toISOString(),
      lastSeen: new Date(a.last_seen as string).toISOString(),
      total: Number(a.total),
      sessions: Number(a.cnt),
      longest: a.longest == null ? null : Number(a.longest),
      shortest: a.shortest == null ? null : Number(a.shortest),
      lastUsed: a.last_used ? new Date(a.last_used as string).toISOString() : null,
      pct: grandTotal ? Number(a.total) / grandTotal : 0,
    })),
  };
}

/** Usage of one application over several local-date ranges in a single query. */
export async function periodTotals(appId: string, ranges: Record<string, DateRange>, tz: string) {
  const cols = Object.entries(ranges).map(([k, r]) => {
    const { fromLocal, toLocal } = bounds(r);
    return sql`COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (
      LEAST((${endExpr()} AT TIME ZONE ${tz}), ${toLocal}::timestamp) - GREATEST((s.start_time AT TIME ZONE ${tz}), ${fromLocal}::timestamp)
    )) * 1000)), 0)::bigint AS ${sql.raw(`"${k}"`)}`;
  });
  const r = await rows<Record<string, string>>(sql`SELECT ${sql.join(cols, sql`, `)} FROM sessions s WHERE s.application_id = ${appId} AND s.activity_type = 'app'`);
  const out: Record<string, number> = {};
  for (const k of Object.keys(ranges)) out[k] = Math.round(Number(r[0]?.[k] ?? 0));
  return out;
}

// ---------- Sessions ----------

export type SessionQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
  from?: string | null;
  to?: string | null;
  appId?: string;
  category?: string;
  type?: string;
  sort?: string;
  dir?: string;
};

const SESSION_SORTS: Record<string, string> = {
  date: "s.start_time",
  duration: "d",
  app: "lower(COALESCE(a.name, s.activity_type))",
  category: "lower(COALESCE(a.category, s.activity_type))",
  type: "s.activity_type",
};

function sessionWhere(p: SessionQuery, tz: string): SQL {
  const c: SQL[] = [];
  if (p.from) c.push(sql`s.start_time >= (${bounds({ from: p.from, to: null }).fromLocal}::timestamp AT TIME ZONE ${tz})`);
  if (p.to) c.push(sql`s.start_time < (${bounds({ from: null, to: p.to }).toLocal}::timestamp AT TIME ZONE ${tz})`);
  if (p.q) {
    const like = `%${p.q}%`;
    c.push(sql`(a.name ILIKE ${like} OR a.executable_name ILIKE ${like} OR s.window_title ILIKE ${like} OR s.activity_type ILIKE ${like})`);
  }
  if (p.appId) c.push(sql`s.application_id = ${p.appId}`);
  if (p.type && p.type !== "all") c.push(sql`s.activity_type = ${p.type}`);
  if (p.category && p.category !== "all") {
    if (["Desktop", "Idle", "Locked"].includes(p.category)) c.push(sql`s.activity_type = ${p.category.toLowerCase()}`);
    else c.push(sql`a.category = ${p.category}`);
  }
  return c.length ? sql`WHERE ${sql.join(c, sql` AND `)}` : sql``;
}

const SESSION_SELECT = (tz: string) => sql`
  s.id, s.start_time, ${endExpr()} AS end_time, ${dur()}::bigint AS d, s.activity_type, s.termination_reason, s.window_title, s.source, s.is_open,
  a.id AS app_id, a.name, a.executable_name, a.executable_path, a.category, a.elevated, a.detection_status,
  to_char(s.start_time AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date`;

function mapSession(r: Record<string, unknown>) {
  const type = r.activity_type as string;
  return {
    id: r.id as string,
    date: r.date as string,
    start: new Date(r.start_time as string).toISOString(),
    end: new Date(r.end_time as string).toISOString(),
    durationMs: Number(r.d),
    type,
    reason: (r.termination_reason as string | null) ?? null,
    title: (r.window_title as string | null) ?? null,
    source: r.source as string,
    open: r.is_open as boolean,
    appId: (r.app_id as string | null) ?? null,
    name: (r.name as string | null) ?? (type === "desktop" ? "Desktop" : type === "idle" ? "Idle" : type === "locked" ? "Locked" : "Unknown"),
    exe: (r.executable_name as string | null) ?? null,
    path: (r.executable_path as string | null) ?? null,
    category: (r.category as string | null) ?? (type === "desktop" ? "Desktop" : type === "idle" ? "Idle" : "Locked"),
    elevated: (r.elevated as boolean | null) ?? false,
    detection: (r.detection_status as string | null) ?? "ok",
  };
}

export type SessionRow = ReturnType<typeof mapSession>;

export async function querySessions(p: SessionQuery) {
  const tz = await getTz();
  const where = sessionWhere(p, tz);
  const pageSize = Math.min(200, Math.max(1, p.pageSize ?? 25));
  const page = Math.max(1, p.page ?? 1);
  const order = sql.raw(SESSION_SORTS[p.sort ?? "date"] ?? SESSION_SORTS.date);
  const dir = sql.raw(p.dir === "asc" ? "ASC" : "DESC");
  const [list, cnt] = await Promise.all([
    rows<Record<string, unknown>>(sql`
      SELECT ${SESSION_SELECT(tz)} FROM sessions s LEFT JOIN applications a ON a.id = s.application_id
      ${where} ORDER BY ${order} ${dir}, s.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    rows<{ c: number }>(sql`SELECT COUNT(*)::int AS c FROM sessions s LEFT JOIN applications a ON a.id = s.application_id ${where}`),
  ]);
  return { sessions: list.map(mapSession), total: cnt[0]?.c ?? 0, page, pageSize };
}

export async function sessionsForDay(date: string) {
  const tz = await getTz();
  const { fromLocal, toLocal } = bounds({ from: date, to: date });
  const b = await rows<{ ds: Date; de: Date }>(sql`SELECT (${fromLocal}::timestamp AT TIME ZONE ${tz}) AS ds, (${toLocal}::timestamp AT TIME ZONE ${tz}) AS de`);
  const list = await rows<Record<string, unknown>>(sql`
    SELECT ${SESSION_SELECT(tz)} FROM sessions s LEFT JOIN applications a ON a.id = s.application_id
    WHERE s.start_time < ${b[0].de} AND ${endExpr()} > ${b[0].ds} ORDER BY s.start_time ASC LIMIT 5000`);
  return { dayStart: new Date(b[0].ds).toISOString(), dayEnd: new Date(b[0].de).toISOString(), sessions: list.map(mapSession) };
}

export async function getSession(id: string) {
  const tz = await getTz();
  const r = await rows<Record<string, unknown>>(sql`SELECT ${SESSION_SELECT(tz)} FROM sessions s LEFT JOIN applications a ON a.id = s.application_id WHERE s.id = ${id}`);
  return r[0] ? mapSession(r[0]) : null;
}
