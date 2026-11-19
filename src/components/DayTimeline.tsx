"use client";

import { useMemo, useState } from "react";
import type { SessionRow } from "@/lib/stats";
import { formatDetailed, formatShort } from "@/lib/time";
import { Empty, Skeleton, catColor, useFetch, ErrorBox } from "./ui";
import { Clock } from "lucide-react";

type Resp = { dayStart: string; dayEnd: string; sessions: SessionRow[] };

const hh = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

export function sessionColor(s: SessionRow) {
  return s.type === "app" ? catColor(s.category) : catColor(s.type === "desktop" ? "Desktop" : s.type === "idle" ? "Idle" : "Locked");
}

export function preciseTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

export function DayTimeline({
  date,
  zoom = 24,
  startHour = 0,
  selectedId,
  onSelect,
  height = 54,
  refreshMs,
  showList = false,
  maxItems,
}: {
  date: string;
  zoom?: number;
  startHour?: number;
  selectedId?: string | null;
  onSelect?: (s: SessionRow) => void;
  height?: number;
  refreshMs?: number;
  showList?: boolean;
  maxItems?: number;
}) {
  const { data, error, loading, reload } = useFetch<Resp>(`/api/timeline?date=${date}`, { refreshMs });
  const [hover, setHover] = useState<{ s: SessionRow; pct: number } | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const ds = Date.parse(data.dayStart);
    const winStart = ds + startHour * 3600_000;
    const winEnd = Math.min(winStart + zoom * 3600_000, Date.parse(data.dayEnd));
    const span = winEnd - winStart;
    const blocks = data.sessions
      .map((s) => {
        const a = Math.max(Date.parse(s.start), winStart);
        const b = Math.min(Date.parse(s.end), winEnd);
        return { s, a, b };
      })
      .filter((x) => x.b > x.a)
      .map((x) => ({ s: x.s, left: ((x.a - winStart) / span) * 100, width: ((x.b - x.a) / span) * 100 }));
    const step = zoom <= 1 ? 10 * 60_000 : zoom <= 3 ? 30 * 60_000 : zoom <= 6 ? 3600_000 : zoom <= 12 ? 2 * 3600_000 : 3 * 3600_000;
    const ticks: { pct: number; label: string }[] = [];
    for (let t = Math.ceil(winStart / step) * step; t <= winEnd; t += step) ticks.push({ pct: ((t - winStart) / span) * 100, label: hh(new Date(t)) });
    return { blocks, ticks };
  }, [data, zoom, startHour]);

  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton h={height + 28} />;
  if (!data || !view) return null;
  if (!data.sessions.length)
    return <Empty icon={<Clock size={20} />} title="No activity recorded for this day" text="Sessions will appear here as soon as Chronos records them." />;

  const cats = [...new Set(data.sessions.map((s) => (s.type === "app" ? s.category : s.type === "desktop" ? "Desktop" : s.type === "idle" ? "Idle" : "Locked")))];
  const listItems = maxItems ? data.sessions.slice(-maxItems) : data.sessions;

  return (
    <div>
      <div style={{ position: "relative" }}>
        <div className="tl-track" style={{ height }}>
          {view.blocks.map(({ s, left, width }) => (
            <button
              key={s.id}
              className={`tl-block ${selectedId === s.id ? "sel" : ""}`}
              style={{ left: `${left}%`, width: `${width}%`, background: sessionColor(s) }}
              onMouseEnter={() => setHover({ s, pct: left + width / 2 })}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover({ s, pct: left + width / 2 })}
              onBlur={() => setHover(null)}
              onClick={() => onSelect?.(s)}
              disabled={!onSelect}
              aria-label={`${s.name} ${preciseTime(s.start)} to ${preciseTime(s.end)}`}
            />
          ))}
        </div>
        {hover && (
          <div className="chart-tip" style={{ position: "absolute", bottom: height + 8, left: `${Math.min(88, Math.max(12, hover.pct))}%`, transform: "translateX(-50%)", zIndex: 10, pointerEvents: "none", whiteSpace: "nowrap" }}>
            <div style={{ fontWeight: 600 }}>{hover.s.name}</div>
            <div className="muted num">
              {preciseTime(hover.s.start)} – {preciseTime(hover.s.end)}
            </div>
            <div className="num">{formatDetailed(hover.s.durationMs)}</div>
          </div>
        )}
      </div>
      <div className="tl-axis">
        {view.ticks.map((t) => (
          <span key={t.pct} style={{ left: `${t.pct}%` }}>
            {t.label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-3" style={{ marginTop: 6 }}>
        {cats.map((c) => (
          <span key={c} className="muted flex items-center gap-2" style={{ fontSize: "0.82rem" }}>
            <span className="dot" style={{ background: catColor(c) }} />
            {c}
          </span>
        ))}
      </div>
      {showList && (
        <div style={{ marginTop: 18 }}>
          {listItems.map((s) => (
            <button key={s.id} className="list-row w-full" style={{ background: selectedId === s.id ? "var(--hover)" : "transparent", border: 0, borderBottom: "1px solid var(--border)", textAlign: "left" }} onClick={() => onSelect?.(s)}>
              <span className="num muted" style={{ width: 54 }}>
                {hh(new Date(s.start))}
              </span>
              <span style={{ width: 28, height: 4, borderRadius: 4, background: sessionColor(s), flex: "none" }} />
              <span style={{ flex: 1, minWidth: 0 }} className="truncate">
                {s.name}
              </span>
              <span className="muted num">{formatShort(s.durationMs)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
