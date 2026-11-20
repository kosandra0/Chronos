// Date range presets. Ranges are expressed as inclusive local calendar dates (YYYY-MM-DD).

export type Preset =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "lastYear"
  | "all"
  | "custom";

export const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "thisWeek", label: "This Week" },
  { id: "lastWeek", label: "Last Week" },
  { id: "thisMonth", label: "This Month" },
  { id: "lastMonth", label: "Last Month" },
  { id: "thisYear", label: "This Year" },
  { id: "lastYear", label: "Last Year" },
  { id: "all", label: "All Time" },
  { id: "custom", label: "Custom" },
];

export type DateRange = { from: string | null; to: string | null };

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday-based start of week. */
export function startOfWeek(d: Date): Date {
  const dow = (d.getDay() + 6) % 7;
  return addDays(d, -dow);
}

export function isValidYmd(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseYmd(s).getTime());
}

export function resolvePreset(p: Preset, custom?: DateRange, now = new Date()): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (p) {
    case "today":
      return { from: ymd(today), to: ymd(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: ymd(y), to: ymd(y) };
    }
    case "thisWeek": {
      const s = startOfWeek(today);
      return { from: ymd(s), to: ymd(addDays(s, 6)) };
    }
    case "lastWeek": {
      const s = addDays(startOfWeek(today), -7);
      return { from: ymd(s), to: ymd(addDays(s, 6)) };
    }
    case "thisMonth":
      return {
        from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      };
    case "lastMonth":
      return {
        from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case "thisYear":
      return { from: `${today.getFullYear()}-01-01`, to: `${today.getFullYear()}-12-31` };
    case "lastYear":
      return { from: `${today.getFullYear() - 1}-01-01`, to: `${today.getFullYear() - 1}-12-31` };
    case "all":
      return { from: null, to: null };
    case "custom":
      return custom ?? { from: ymd(today), to: ymd(today) };
  }
}

export function rangeQuery(r: DateRange): string {
  const p = new URLSearchParams();
  if (r.from) p.set("from", r.from);
  if (r.to) p.set("to", r.to);
  return p.toString();
}

export function describeRange(r: DateRange): string {
  if (!r.from && !r.to) return "All time";
  if (r.from === r.to) return r.from ?? "";
  return `${r.from ?? "…"} → ${r.to ?? "…"}`;
}
