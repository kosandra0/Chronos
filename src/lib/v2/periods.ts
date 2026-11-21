import { addDays, parseYmd, resolvePreset, startOfWeek, ymd, type DateRange } from "../ranges.ts";

export type Comparison = { current: number; previous: number; diff: number; pct: number | null; direction: "up" | "down" | "same" };

/** Percent change. null when the previous value is 0 and the current one is not (undefined growth). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
export function compareValues(current: number, previous: number): Comparison {
  const diff = current - previous;
  return { current, previous, diff, pct: pctChange(current, previous), direction: diff > 0 ? "up" : diff < 0 ? "down" : "same" };
}

/** Same calendar boundaries as the Statistics period filter (Monday-based weeks, calendar months). */
export function periodPair(kind: "week" | "month", now: Date = new Date()): { current: DateRange; previous: DateRange } {
  return kind === "week"
    ? { current: resolvePreset("thisWeek", undefined, now), previous: resolvePreset("lastWeek", undefined, now) }
    : { current: resolvePreset("thisMonth", undefined, now), previous: resolvePreset("lastMonth", undefined, now) };
}

/** The last COMPLETED Monday-Sunday week before the week that contains `now`. */
export function lastCompletedWeek(now: Date = new Date()): DateRange {
  return resolvePreset("lastWeek", undefined, now);
}
export function weekBefore(r: DateRange): DateRange {
  const s = addDays(parseYmd(r.from as string), -7);
  return { from: ymd(s), to: ymd(addDays(s, 6)) };
}

/**
 * Weekly report scheduling in LOCAL time. `day` is 0=Sunday..6=Saturday, `time` is "HH:MM".
 * Due once the configured moment of the current week has passed and the report for the previous completed
 * week has not been delivered. weekKey = the Monday of the week being reported.
 */
export function weeklyReportDue(now: Date, day: number, time: string, lastDeliveredKey: string | null): { due: boolean; weekKey: string } {
  const weekKey = lastCompletedWeek(now).from as string;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  const hh = m ? Math.min(23, Number(m[1])) : 9;
  const mm = m ? Math.min(59, Number(m[2])) : 0;
  const monday = startOfWeek(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const at = addDays(monday, (day + 6) % 7); // Monday-based offset of the chosen weekday
  at.setHours(hh, mm, 0, 0);
  return { due: now.getTime() >= at.getTime() && lastDeliveredKey !== weekKey, weekKey };
}
