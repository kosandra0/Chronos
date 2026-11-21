// Application / category daily limits. Awareness only: nothing here blocks or closes applications.

export type Limit = { id: string; kind: "app" | "category"; target: string; targetName: string; dailyMinutes: number; warnPct: number; enabled: boolean };

export function sanitizeLimit(raw: unknown, id: string): { ok: true; value: Limit } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Limit must be an object." };
  const r = raw as Record<string, unknown>;
  if (r.kind !== "app" && r.kind !== "category") return { ok: false, error: "kind must be 'app' or 'category'." };
  if (typeof r.target !== "string" || !r.target.trim() || r.target.length > 80) return { ok: false, error: "target is required." };
  const minutes = Number(r.dailyMinutes);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) return { ok: false, error: "dailyMinutes must be between 1 and 1440." };
  const warnRaw = r.warnPct === undefined ? 80 : Number(r.warnPct);
  if (!Number.isFinite(warnRaw) || warnRaw < 10 || warnRaw > 99) return { ok: false, error: "warnPct must be between 10 and 99." };
  const name = typeof r.targetName === "string" && r.targetName.trim() ? r.targetName.trim().slice(0, 80) : r.target;
  return { ok: true, value: { id, kind: r.kind, target: r.target.trim(), targetName: name, dailyMinutes: Math.round(minutes), warnPct: Math.round(warnRaw), enabled: r.enabled !== false } };
}

export type LimitStatus = { limitMs: number; usedMs: number; pct: number; remainingMs: number; state: "ok" | "warn" | "reached" };
export function evaluateLimit(l: Pick<Limit, "dailyMinutes" | "warnPct">, usedMs: number): LimitStatus {
  const limitMs = l.dailyMinutes * 60_000;
  const used = Math.max(0, usedMs);
  const pct = limitMs ? (used / limitMs) * 100 : 0;
  return { limitMs, usedMs: used, pct, remainingMs: Math.max(0, limitMs - used), state: used >= limitMs ? "reached" : pct >= l.warnPct ? "warn" : "ok" };
}

export type LimitNote = { key: string; kind: "warn" | "reached"; title: string; body: string; silent?: boolean };
const fmt = (ms: number) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
};
/**
 * Notifications due now. `sent(key)` says whether a dedupe key was already delivered (keys include the local day,
 * so each limit notifies at most once per kind per day). If the limit is already reached, the warning is marked
 * as covered (silent) instead of being shown after the fact.
 */
export function notificationsDue(l: Limit, usedMs: number, dayKey: string, sent: (key: string) => boolean): LimitNote[] {
  if (!l.enabled) return [];
  const st = evaluateLimit(l, usedMs);
  const out: LimitNote[] = [];
  const kw = `limit.${l.id}.${dayKey}.warn`;
  const kr = `limit.${l.id}.${dayKey}.reached`;
  const what = l.kind === "app" ? l.targetName : `${l.targetName} apps`;
  if (st.state === "reached") {
    if (!sent(kr)) out.push({ key: kr, kind: "reached", title: "Daily limit reached", body: `${what}: you have used your ${fmt(st.limitMs)} limit for today.` });
    if (!sent(kw)) out.push({ key: kw, kind: "warn", title: "", body: "", silent: true });
  } else if (st.state === "warn" && !sent(kw)) {
    out.push({ key: kw, kind: "warn", title: "Approaching daily limit", body: `${what}: ${Math.floor(st.pct)}% used, ${fmt(st.remainingMs)} left today.` });
  }
  return out;
}

/** Local calendar day key (YYYY-MM-DD) in an IANA time zone; limits reset at that zone's local midnight. */
export function localDayKey(ms: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}
