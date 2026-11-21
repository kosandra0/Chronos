import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { getSettings, getTz } from "../settings";
import { getStats, bounds, dur } from "../stats";
import { addDays, isValidYmd, parseYmd, ymd, type DateRange } from "../ranges";
import { DEFAULT_FOCUS_CONFIG, advance, initialFocusState, pause, remaining, resume, sanitizeFocusConfig, startFocus, stop, type FocusConfig, type FocusState } from "./focus";
import { evaluateLimit, localDayKey, notificationsDue, sanitizeLimit, type Limit } from "./limits";
import { defaultProdClass, goalProgress, isProdClass, productivityScore, type ProdClass } from "./productivity";
import { compareValues, lastCompletedWeek, periodPair, weekBefore, weeklyReportDue } from "./periods";
import { amountFor, isCurrency, projectRow, reportCsv, type ProjectReportRow } from "./billing";
import { cleanName, exportPack, mergeImported, sanitizeGradient, validatePack, type Gradient } from "./themepack";

async function rows<T>(q: SQL): Promise<T[]> {
  const r = await db.execute(q);
  return r.rows as unknown as T[];
}
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

// ------------------------------------------------------------------ key/value (settings table, non-typed keys)
export async function kvGet(key: string): Promise<string | null> {
  const r = await rows<{ value: string }>(sql`SELECT value FROM settings WHERE key = ${key}`);
  return r[0]?.value ?? null;
}
export async function kvSet(key: string, value: string) {
  await db.execute(sql`INSERT INTO settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
}
export async function kvDel(key: string) {
  await db.execute(sql`DELETE FROM settings WHERE key = ${key}`);
}
export async function kvList(prefix: string): Promise<{ key: string; value: string }[]> {
  const like = prefix.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";
  return rows<{ key: string; value: string }>(sql`SELECT key, value FROM settings WHERE key LIKE ${like} ORDER BY key`);
}
async function kvJson<T>(key: string, fallback: T): Promise<T> {
  const v = await kvGet(key);
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

// ------------------------------------------------------------------ notification outbox (delivered by the desktop host)
export type Note = { id: string; title: string; body: string; route: string; createdAt: number };
const g = globalThis as typeof globalThis & { __wtOutbox?: Note[]; __wtTickAt?: number; __wtTicking?: boolean };
const outbox = () => (g.__wtOutbox ??= []);
export function enqueue(n: Omit<Note, "id" | "createdAt">) {
  const box = outbox();
  box.push({ ...n, id: newId(), createdAt: Date.now() });
  if (box.length > 50) box.splice(0, box.length - 50);
}
export const pendingNotes = () => [...outbox()];
export function ackNotes(ids: string[]) {
  g.__wtOutbox = outbox().filter((n) => !ids.includes(n.id));
}
async function wasSent(key: string): Promise<boolean> {
  return (await kvGet(`v2.sent.${key}`)) !== null;
}
async function markSent(key: string) {
  await kvSet(`v2.sent.${key}`, String(Date.now()));
}

// ------------------------------------------------------------------ focus
const FOCUS_CFG = "v2.focus.config";
const FOCUS_STATE = "v2.focus.state";
export async function focusConfig(): Promise<FocusConfig> {
  return sanitizeFocusConfig(await kvJson<unknown>(FOCUS_CFG, {}));
}
async function loadFocusState(now: number): Promise<FocusState> {
  const raw = await kvJson<Partial<FocusState> | null>(FOCUS_STATE, null);
  if (!raw || typeof raw !== "object" || !["idle", "running", "paused"].includes(String(raw.status))) return initialFocusState(now);
  return { ...initialFocusState(now), ...raw } as FocusState;
}
async function saveFocusState(s: FocusState) {
  await kvSet(FOCUS_STATE, JSON.stringify(s));
}
const FOCUS_NAMES = { focus: "Focus block", short: "Short break", long: "Long break" } as const;

/** Advances the saved timer to `now`, persists it and queues (at most one) notification per event. */
export async function focusTick(now = Date.now()) {
  const cfg = await focusConfig();
  const before = await loadFocusState(now);
  const { state, events } = advance(before, cfg, now);
  const tz = await getTz();
  const day = localDayKey(now, tz);
  if ((await kvGet("v2.focus.day")) !== day) {
    state.focusMsToday = 0;
    await kvSet("v2.focus.day", day);
  }
  if (JSON.stringify(state) !== JSON.stringify(before)) await saveFocusState(state);
  for (const e of events) {
    if (e.type === "phase-complete" && cfg.notifyPhaseEnd) {
      enqueue(e.phase === "focus"
        ? { title: "Focus block complete", body: `Time for a ${e.next === "long" ? "long" : "short"} break. Rest your eyes and stretch.${e.auto ? "" : " Open Focus to start it."}`, route: "/focus" }
        : { title: "Break is over", body: "Ready for the next focus block?", route: "/focus" });
    } else if (e.type === "reminder") {
      enqueue({ title: e.kind === "eyes" ? "Rest your eyes" : "Time to stretch", body: e.kind === "eyes" ? "Look at something 20 feet away for 20 seconds." : "Stand up, roll your shoulders and take a deep breath.", route: "/focus" });
    }
  }
  return { cfg, state, events };
}

export async function focusSnapshot(now = Date.now()) {
  const { cfg, state } = await focusTick(now);
  return { config: cfg, state, remainingMs: remaining(state, now), phaseLabel: FOCUS_NAMES[state.phase], now };
}

export async function focusAction(action: string, body: Record<string, unknown>, now = Date.now()) {
  let cfg = await focusConfig();
  if (body.config) {
    cfg = sanitizeFocusConfig(body.config, cfg);
    await kvSet(FOCUS_CFG, JSON.stringify(cfg));
  }
  await focusTick(now);
  let s = await loadFocusState(now);
  if (action === "start") s = startFocus(s, cfg, now);
  else if (action === "pause") s = pause(s, now);
  else if (action === "resume") s = resume(s, now);
  else if (action === "stop") s = stop(s, now);
  else if (action === "skip" && s.status === "running") s = { ...s, endsAt: now, lastSeen: now }; // finishes the phase on the next tick
  else if (action !== "config" && action !== "skip") throw Object.assign(new Error("Unknown focus action."), { status: 400 });
  await saveFocusState(s);
  if (action === "skip") await focusTick(now + 1);
  return focusSnapshot(now + (action === "skip" ? 1 : 0));
}

// ------------------------------------------------------------------ productivity
export async function prodOverrides(): Promise<Map<string, ProdClass>> {
  const m = new Map<string, ProdClass>();
  for (const r of await kvList("v2.prodclass.")) {
    const c = r.value.replace(/"/g, "");
    if (isProdClass(c)) m.set(r.key.slice("v2.prodclass.".length), c);
  }
  return m;
}
export async function setProdClass(appId: string, cls: string | null) {
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(appId)) throw Object.assign(new Error("Invalid application id."), { status: 400 });
  const exists = await rows<{ id: string }>(sql`SELECT id FROM applications WHERE id = ${appId}`);
  if (!exists.length) throw Object.assign(new Error("Unknown application."), { status: 404 });
  if (cls === null) await kvDel(`v2.prodclass.${appId}`);
  else if (isProdClass(cls)) await kvSet(`v2.prodclass.${appId}`, cls);
  else throw Object.assign(new Error("class must be productive, neutral or distracting."), { status: 400 });
}

export async function productivitySummary(range: DateRange) {
  const [stats, overrides, settings] = await Promise.all([getStats(range), prodOverrides(), getSettings()]);
  let productive = 0, distracting = 0, neutral = 0;
  const apps = stats.apps.map((a) => {
    const override = overrides.get(a.id);
    const cls = override ?? defaultProdClass(a.category);
    if (cls === "productive") productive += a.ms;
    else if (cls === "distracting") distracting += a.ms;
    else neutral += a.ms;
    return { id: a.id, name: a.name, exe: a.exe, category: a.category, ms: a.ms, cls, overridden: override !== undefined };
  });
  return { range, productiveMs: productive, distractingMs: distracting, neutralMs: neutral, score: productivityScore(productive, distracting), goal: { hours: settings.productivityGoalHours, ...goalProgress(productive, settings.productivityGoalHours) }, apps };
}

/** Today's summary plus comparison with yesterday and with the same weekday last week. */
export async function productivityDashboard(day?: string) {
  const tz = await getTz();
  const today = day && isValidYmd(day) ? day : localDayKey(Date.now(), tz);
  const prev = ymd(addDays(parseYmd(today), -1));
  const [cur, yest] = await Promise.all([productivitySummary({ from: today, to: today }), productivitySummary({ from: prev, to: prev })]);
  return { day: today, current: cur, previous: yest, change: { productive: compareValues(cur.productiveMs, yest.productiveMs), distracting: compareValues(cur.distractingMs, yest.distractingMs), score: cur.score === null || yest.score === null ? null : cur.score - yest.score } };
}

// ------------------------------------------------------------------ limits
export async function listLimits(): Promise<Limit[]> {
  const out: Limit[] = [];
  for (const r of await kvList("v2.limit.")) {
    try {
      const v = sanitizeLimit(JSON.parse(r.value), r.key.slice("v2.limit.".length));
      if (v.ok) out.push(v.value);
    } catch {
      /* ignore a malformed record */
    }
  }
  return out;
}
export async function saveLimit(raw: Record<string, unknown>): Promise<Limit> {
  const id = typeof raw.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(raw.id) ? raw.id : newId();
  const v = sanitizeLimit(raw, id);
  if (!v.ok) throw Object.assign(new Error(v.error), { status: 400 });
  if (v.value.kind === "app") {
    const a = await rows<{ name: string }>(sql`SELECT name FROM applications WHERE id = ${v.value.target}`);
    if (!a.length) throw Object.assign(new Error("Unknown application."), { status: 400 });
    v.value.targetName = a[0].name;
  } else {
    const cats = ["Browsers", "Development", "Productivity", "Communication", "Entertainment", "Gaming", "System Utilities", "Administration", "Media", "Education", "Other"];
    if (!cats.includes(v.value.target)) throw Object.assign(new Error("Unknown category."), { status: 400 });
    v.value.targetName = v.value.target;
  }
  await kvSet(`v2.limit.${id}`, JSON.stringify(v.value));
  return v.value;
}
export async function deleteLimit(id: string) {
  await kvDel(`v2.limit.${id}`);
}
async function todayUsage(now: number) {
  const tz = await getTz();
  const day = localDayKey(now, tz);
  const s = await getStats({ from: day, to: day });
  const byApp = new Map(s.apps.map((a) => [a.id, a.ms]));
  const byCat = new Map<string, number>();
  for (const a of s.apps) byCat.set(a.category, (byCat.get(a.category) ?? 0) + a.ms);
  return { day, byApp, byCat };
}
export async function limitsWithUsage(now = Date.now()) {
  const [limits, u] = await Promise.all([listLimits(), todayUsage(now)]);
  return { day: u.day, limits: limits.map((l) => ({ ...l, ...evaluateLimit(l, (l.kind === "app" ? u.byApp.get(l.target) : u.byCat.get(l.target)) ?? 0) })) };
}
async function limitsTick(now: number) {
  const settings = await getSettings();
  const limits = await listLimits();
  if (!limits.length) return;
  const u = await todayUsage(now);
  const sentKeys = new Set((await kvList(`v2.sent.limit.`)).map((r) => r.key.slice("v2.sent.".length)));
  for (const l of limits) {
    const used = (l.kind === "app" ? u.byApp.get(l.target) : u.byCat.get(l.target)) ?? 0;
    for (const n of notificationsDue(l, used, u.day, (k) => sentKeys.has(k))) {
      await markSent(n.key);
      sentKeys.add(n.key);
      if (!n.silent && settings.limitNotifications) enqueue({ title: n.title, body: n.body, route: "/limits" });
    }
  }
}

// ------------------------------------------------------------------ weekly report / comparison
export function validWeekStart(w: string | undefined | null, now = new Date()): string | null {
  if (!w || !isValidYmd(w)) return null;
  const d = parseYmd(w);
  if ((d.getDay() + 6) % 7 !== 0) return null; // must be a Monday
  return d.getTime() > parseYmd(lastCompletedWeek(now).from as string).getTime() ? null : w; // completed weeks only
}

export async function weeklyReport(weekStart?: string, now = new Date()) {
  const from = validWeekStart(weekStart, now) ?? (lastCompletedWeek(now).from as string);
  const range: DateRange = { from, to: ymd(addDays(parseYmd(from), 6)) };
  const prevRange = weekBefore(range);
  const [cur, prev, pc, pp] = await Promise.all([getStats(range), getStats(prevRange), productivitySummary(range), productivitySummary(prevRange)]);
  const byDay = Array.from({ length: 7 }, (_, i) => {
    const day = ymd(addDays(parseYmd(from), i));
    return { day, ms: cur.byDay.find((d) => d.day === day)?.total ?? 0 };
  });
  return {
    range,
    previousRange: prevRange,
    totalMs: cur.totals.screen,
    previousTotalMs: prev.totals.screen,
    comparison: compareValues(cur.totals.screen, prev.totals.screen),
    productive: { ms: pc.productiveMs, comparison: compareValues(pc.productiveMs, pp.productiveMs) },
    distracting: { ms: pc.distractingMs, comparison: compareValues(pc.distractingMs, pp.distractingMs) },
    neutralMs: pc.neutralMs,
    score: pc.score,
    previousScore: pp.score,
    topApps: cur.apps.slice(0, 5).map((a) => ({ id: a.id, name: a.name, ms: a.ms })),
    topCategories: cur.categories.slice(0, 5),
    byDay,
    complete: true,
  };
}

const h = (ms: number) => {
  const m = Math.round(ms / 60000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
};
async function weeklyTick(now: number) {
  const s = await getSettings();
  if (!s.weeklyReportEnabled) return;
  const date = new Date(now);
  const probe = weeklyReportDue(date, s.weeklyReportDay, s.weeklyReportTime, null);
  if (!probe.due || (await wasSent(`weekly.${probe.weekKey}`))) return;
  await markSent(`weekly.${probe.weekKey}`); // mark first: a failure can never produce a duplicate
  const r = await weeklyReport(probe.weekKey, date);
  const pct = r.comparison.pct;
  const change = pct === null ? "no data for the week before" : `${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% vs the previous week`;
  enqueue({ title: "Your weekly screen-time report", body: `${h(r.totalMs)} last week (${change}). Open WatchTower for the full report.`, route: `/reports?week=${probe.weekKey}` });
}

export async function comparePeriods(kind: "week" | "month", now = new Date()) {
  const { current, previous } = periodPair(kind, now);
  const [a, b, pa, pb] = await Promise.all([getStats(current), getStats(previous), productivitySummary(current), productivitySummary(previous)]);
  const names = new Map<string, string>();
  const appMap = (st: typeof a) => new Map(st.apps.map((x) => (names.set(x.id, x.name), [x.id, x.ms] as const)));
  const am = appMap(a), bm = appMap(b);
  const ids = new Set([...am.keys(), ...bm.keys()]);
  const apps = [...ids].map((id) => ({ id, name: names.get(id) ?? "Unknown", ...compareValues(am.get(id) ?? 0, bm.get(id) ?? 0) })).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff)).slice(0, 15);
  const cm = new Map(a.categories.map((x) => [x.category, x.ms])), cp = new Map(b.categories.map((x) => [x.category, x.ms]));
  const categories = [...new Set([...cm.keys(), ...cp.keys()])].map((c) => ({ category: c, ...compareValues(cm.get(c) ?? 0, cp.get(c) ?? 0) })).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  return {
    kind,
    current,
    previous,
    total: compareValues(a.totals.screen, b.totals.screen),
    productive: compareValues(pa.productiveMs, pb.productiveMs),
    distracting: compareValues(pa.distractingMs, pb.distractingMs),
    apps,
    categories,
  };
}

// ------------------------------------------------------------------ projects
export type ProjectRow = { id: string; name: string; client: string; color: string; billable: boolean; rate: number; archived: boolean; createdAt: string };
const mapProject = (r: Record<string, unknown>): ProjectRow => ({ id: r.id as string, name: r.name as string, client: r.client as string, color: r.color as string, billable: r.billable as boolean, rate: Number(r.hourly_rate), archived: r.archived as boolean, createdAt: new Date(r.created_at as string).toISOString() });

function cleanProject(raw: Record<string, unknown>, base?: ProjectRow) {
  const name = raw.name === undefined && base ? base.name : cleanName(raw.name);
  if (!name) throw Object.assign(new Error("Project name is required."), { status: 400 });
  const client = raw.client === undefined && base ? base.client : cleanName(raw.client);
  const color = raw.color === undefined && base ? base.color : String(raw.color ?? "#5b8def");
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw Object.assign(new Error("color must be #rrggbb."), { status: 400 });
  const rate = raw.rate === undefined && base ? base.rate : Number(raw.rate ?? 0);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100000) throw Object.assign(new Error("rate must be between 0 and 100000."), { status: 400 });
  const billable = typeof raw.billable === "boolean" ? raw.billable : base ? base.billable : true;
  const archived = typeof raw.archived === "boolean" ? raw.archived : base ? base.archived : false;
  return { name, client, color: color.toLowerCase(), rate: Math.round(rate * 100) / 100, billable, archived };
}
export async function createProject(raw: Record<string, unknown>) {
  const p = cleanProject(raw);
  const dup = await rows<{ id: string }>(sql`SELECT id FROM projects WHERE lower(name) = lower(${p.name}) AND lower(client) = lower(${p.client})`);
  if (dup.length) throw Object.assign(new Error("A project with this name and client already exists."), { status: 409 });
  const id = newId();
  await db.execute(sql`INSERT INTO projects (id, name, client, color, billable, hourly_rate, archived) VALUES (${id}, ${p.name}, ${p.client}, ${p.color}, ${p.billable}, ${p.rate}, ${p.archived})`);
  return getProject(id);
}
export async function getProject(id: string): Promise<ProjectRow | null> {
  const r = await rows<Record<string, unknown>>(sql`SELECT * FROM projects WHERE id = ${id}`);
  return r[0] ? mapProject(r[0]) : null;
}
export async function updateProject(id: string, raw: Record<string, unknown>) {
  const base = await getProject(id);
  if (!base) throw Object.assign(new Error("Unknown project."), { status: 404 });
  const p = cleanProject(raw, base);
  const dup = await rows<{ id: string }>(sql`SELECT id FROM projects WHERE lower(name) = lower(${p.name}) AND lower(client) = lower(${p.client}) AND id <> ${id}`);
  if (dup.length) throw Object.assign(new Error("A project with this name and client already exists."), { status: 409 });
  await db.execute(sql`UPDATE projects SET name = ${p.name}, client = ${p.client}, color = ${p.color}, billable = ${p.billable}, hourly_rate = ${p.rate}, archived = ${p.archived} WHERE id = ${id}`);
  return getProject(id);
}
/** Deleting a project only removes the assignments; the recorded sessions themselves are never touched. */
export async function deleteProject(id: string) {
  const n = await rows<{ c: number }>(sql`SELECT COUNT(*)::int AS c FROM session_projects WHERE project_id = ${id}`);
  await db.execute(sql`DELETE FROM projects WHERE id = ${id}`);
  return { unassigned: n[0]?.c ?? 0 };
}

async function clipFragments(range: DateRange) {
  const tz = await getTz();
  const { fromLocal, toLocal } = bounds(range);
  const lo = sql`(${fromLocal}::timestamp AT TIME ZONE ${tz})`;
  const hi = sql`(${toLocal}::timestamp AT TIME ZONE ${tz})`;
  const end = sql.raw(`(CASE WHEN s.is_open THEN now() ELSE s.end_time END)`);
  return { lo, hi, ms: sql`GREATEST(0, EXTRACT(EPOCH FROM (LEAST(${end}, ${hi}) - GREATEST(s.start_time, ${lo}))) * 1000)`, where: sql`s.start_time < ${hi} AND (s.is_open OR s.end_time > ${lo}) AND s.activity_type IN ('app','desktop')` };
}
export async function listProjects(range: DateRange = { from: null, to: null }) {
  const c = await clipFragments(range);
  const list = await rows<Record<string, unknown>>(sql`
    SELECT p.*, COALESCE(x.total, 0)::bigint AS total, COALESCE(x.cnt, 0)::int AS cnt, COALESCE(y.all_cnt, 0)::int AS all_cnt
    FROM projects p
    LEFT JOIN (SELECT sp.project_id, ROUND(SUM(${c.ms}))::bigint AS total, COUNT(*) AS cnt FROM session_projects sp JOIN sessions s ON s.id = sp.session_id WHERE ${c.where} GROUP BY sp.project_id) x ON x.project_id = p.id
    LEFT JOIN (SELECT project_id, COUNT(*) AS all_cnt FROM session_projects GROUP BY project_id) y ON y.project_id = p.id
    ORDER BY p.archived, lower(p.client), lower(p.name)`);
  return list.map((r) => ({ ...mapProject(r), totalMs: Number(r.total), sessions: Number(r.cnt), assignedSessions: Number(r.all_cnt) }));
}
export async function assignSessions(sessionIds: string[], projectId: string | null) {
  const ids = [...new Set(sessionIds.filter((x) => typeof x === "string" && x.length > 0 && x.length <= 80))].slice(0, 500);
  if (!ids.length) throw Object.assign(new Error("No sessions selected."), { status: 400 });
  if (projectId !== null && !(await getProject(projectId))) throw Object.assign(new Error("Unknown project."), { status: 404 });
  const valid = await rows<{ id: string }>(sql`SELECT id FROM sessions WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
  const ok = valid.map((v) => v.id);
  for (const id of ok) {
    if (projectId === null) await db.execute(sql`DELETE FROM session_projects WHERE session_id = ${id}`);
    else await db.execute(sql`INSERT INTO session_projects (session_id, project_id) VALUES (${id}, ${projectId}) ON CONFLICT (session_id) DO UPDATE SET project_id = EXCLUDED.project_id, assigned_at = now()`);
  }
  return { updated: ok.length, ignored: ids.length - ok.length };
}
export async function sessionProject(sessionId: string): Promise<string | null> {
  const r = await rows<{ project_id: string }>(sql`SELECT project_id FROM session_projects WHERE session_id = ${sessionId}`);
  return r[0]?.project_id ?? null;
}
export async function projectSessions(projectId: string, range: DateRange, page = 1, pageSize = 50) {
  const tz = await getTz();
  const c = await clipFragments(range);
  const list = await rows<Record<string, unknown>>(sql`
    SELECT s.id, s.start_time, (CASE WHEN s.is_open THEN now() ELSE s.end_time END) AS end_time, ROUND(${c.ms})::bigint AS ms, s.activity_type, a.name,
      to_char(s.start_time AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date
    FROM session_projects sp JOIN sessions s ON s.id = sp.session_id LEFT JOIN applications a ON a.id = s.application_id
    WHERE sp.project_id = ${projectId} AND ${c.where} ORDER BY s.start_time DESC LIMIT ${Math.min(200, pageSize)} OFFSET ${(Math.max(1, page) - 1) * pageSize}`);
  const cnt = await rows<{ c: number }>(sql`SELECT COUNT(*)::int AS c FROM session_projects sp JOIN sessions s ON s.id = sp.session_id WHERE sp.project_id = ${projectId} AND ${c.where}`);
  return {
    total: cnt[0]?.c ?? 0,
    sessions: list.map((r) => ({ id: r.id as string, date: r.date as string, start: new Date(r.start_time as string).toISOString(), end: new Date(r.end_time as string).toISOString(), ms: Number(r.ms), type: r.activity_type as string, name: (r.name as string | null) ?? "Desktop" })),
  };
}
export async function projectReport(range: DateRange, includeArchived = true) {
  const settings = await getSettings();
  const list = (await listProjects(range)).filter((p) => includeArchived || !p.archived);
  const rowsOut: ProjectReportRow[] = list.filter((p) => p.totalMs > 0 || p.assignedSessions > 0).map((p) => projectRow({ client: p.client, name: p.name, billable: p.billable, rate: p.rate }, p.totalMs, range, settings.currency));
  return { range, currency: settings.currency, rows: rowsOut, totals: { totalMs: rowsOut.reduce((n, r) => n + r.totalMs, 0), billableMs: rowsOut.reduce((n, r) => n + r.billableMs, 0), amount: Math.round(rowsOut.reduce((n, r) => n + r.amount, 0) * 100) / 100 } };
}
export const projectReportCsv = (r: Awaited<ReturnType<typeof projectReport>>) => reportCsv(r.rows);
export { amountFor, isCurrency };

// ------------------------------------------------------------------ gradient presets / theme packs
type StoredGradient = Gradient & { id: string; createdAt: number };
export async function listGradients(): Promise<StoredGradient[]> {
  const out: StoredGradient[] = [];
  for (const r of await kvList("v2.gradient.")) {
    try {
      const j = JSON.parse(r.value) as Record<string, unknown>;
      const v = sanitizeGradient(j);
      if (v.ok) out.push({ ...v.value, id: r.key.slice("v2.gradient.".length), createdAt: Number(j.createdAt) || 0 });
    } catch {
      /* skip malformed */
    }
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}
async function putGradient(id: string, g: Gradient, createdAt: number) {
  await kvSet(`v2.gradient.${id}`, JSON.stringify({ ...g, id: undefined, createdAt }));
}
export async function saveGradient(raw: Record<string, unknown>) {
  const v = sanitizeGradient(raw);
  if (!v.ok) throw Object.assign(new Error(v.error), { status: 400 });
  const all = await listGradients();
  const id = typeof raw.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(raw.id) ? raw.id : null;
  const existing = id ? all.find((x) => x.id === id) : undefined;
  if (all.some((x) => x.id !== existing?.id && x.name.toLowerCase() === v.value.name.toLowerCase())) throw Object.assign(new Error("A preset with this name already exists."), { status: 409 });
  if (!existing && all.length >= 200) throw Object.assign(new Error("Preset limit reached."), { status: 400 });
  const gid = existing?.id ?? newId();
  await putGradient(gid, v.value, existing?.createdAt ?? Date.now());
  return { ...v.value, id: gid };
}
export async function deleteGradient(id: string) {
  await kvDel(`v2.gradient.${id}`);
}
export async function exportGradients(ids?: string[]) {
  const all = await listGradients();
  const pick = ids && ids.length ? all.filter((g) => ids.includes(g.id)) : all;
  return exportPack(pick, ids && ids.length ? "WatchTower selected themes" : "WatchTower theme pack");
}
export async function importGradients(content: string, apply: boolean) {
  const v = validatePack(content);
  if (!v.ok) throw Object.assign(new Error(v.errors.join(" ")), { status: 400, errors: v.errors });
  const existing = await listGradients();
  const { merged, renamed } = mergeImported(existing, v.gradients);
  const added = merged.slice(existing.length);
  if (existing.length + added.length > 200) throw Object.assign(new Error("Importing would exceed 200 presets."), { status: 400 });
  if (apply) {
    let n = Date.now();
    for (const g of added) await putGradient(newId(), g, n++);
  }
  return { applied: apply, added: added.map((g) => g.name), renamed };
}

// ------------------------------------------------------------------ scheduler hook
/** Evaluates focus, limits and the weekly report. Throttled; safe to call from the scheduler and the notification poller. */
export async function v2Tick(now = Date.now(), force = false) {
  if (g.__wtTicking) return;
  if (!force && g.__wtTickAt && now - g.__wtTickAt < 10000) return;
  g.__wtTicking = true;
  g.__wtTickAt = now;
  try {
    await focusTick(now);
    await limitsTick(now);
    await weeklyTick(now);
  } catch (e) {
    console.error("[watchtower] v2 tick failed", e);
  } finally {
    g.__wtTicking = false;
  }
}

export { dur };
