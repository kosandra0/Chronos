export type ThemeSchedule = { enabled: boolean; dayTheme: string; nightTheme: string; dayStart: string; nightStart: string };

export function parseHM(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

/** Which slot is active at `minutes` since local midnight. Also correct when the day slot crosses midnight (dayStart > nightStart). */
export function activeSlot(dayStart: number, nightStart: number, minutes: number): "day" | "night" {
  if (dayStart === nightStart) return "day";
  if (dayStart < nightStart) return minutes >= dayStart && minutes < nightStart ? "day" : "night";
  return minutes >= dayStart || minutes < nightStart ? "day" : "night";
}

/** The theme id the schedule selects, or null when scheduling is off or invalid (the manual theme then stays). */
export function scheduledTheme(s: ThemeSchedule, now: Date): string | null {
  if (!s.enabled) return null;
  const d = parseHM(s.dayStart);
  const n = parseHM(s.nightStart);
  if (d === null || n === null || !s.dayTheme || !s.nightTheme) return null;
  return activeSlot(d, n, now.getHours() * 60 + now.getMinutes()) === "day" ? s.dayTheme : s.nightTheme;
}
