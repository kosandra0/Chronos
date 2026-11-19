// Precise duration helpers. All inputs are integer milliseconds; nothing is rounded up.

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function splitMs(msIn: number) {
  const ms = Math.max(0, Math.floor(msIn || 0));
  const totalSeconds = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    milliseconds: ms % 1000,
    totalHours: Math.floor(totalSeconds / 3600),
  };
}

/** HH:MM:SS where hours may exceed 24 (floored, never rounded). */
export function formatHMS(ms: number): string {
  const p = splitMs(ms);
  return `${pad(p.totalHours)}:${pad(p.minutes)}:${pad(p.seconds)}`;
}

/** 05h 32m 18s */
export function formatHMSLabel(ms: number): string {
  const p = splitMs(ms);
  return `${pad(p.totalHours)}h ${pad(p.minutes)}m ${pad(p.seconds)}s`;
}

/** Compact: "2h 15m", "14m 03s", "42s", "850 ms" */
export function formatShort(ms: number): string {
  const p = splitMs(ms);
  if (p.totalHours > 0) return `${p.totalHours}h ${pad(p.minutes)}m`;
  if (p.minutes > 0) return `${p.minutes}m ${pad(p.seconds)}s`;
  if (p.seconds > 0) return `${p.seconds}s`;
  return ms > 0 ? `${p.milliseconds} ms` : "0s";
}

/** 1 day, 4 hours, 32 minutes, 18 seconds, 425 milliseconds */
export function formatDetailed(ms: number): string {
  const p = splitMs(ms);
  const units: [number, string][] = [
    [p.days, "day"],
    [p.hours, "hour"],
    [p.minutes, "minute"],
    [p.seconds, "second"],
    [p.milliseconds, "millisecond"],
  ];
  let first = units.findIndex(([v]) => v > 0);
  if (first < 0) first = 3;
  return units
    .slice(first)
    .map(([v, n]) => `${v} ${n}${v === 1 ? "" : "s"}`)
    .join(", ");
}

export function formatPct(part: number, whole: number): string {
  if (!whole) return "0%";
  const v = (part / whole) * 100;
  return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}%`;
}

export function fmtTime(iso: string | Date, withSeconds = true): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...(withSeconds ? { second: "2-digit" } : {}) });
}

export function fmtDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(iso: string | Date): string {
  return `${fmtDate(iso)}, ${fmtTime(iso)}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${u[i]}`;
}
