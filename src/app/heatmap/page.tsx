"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Grid3x3 } from "lucide-react";
import { Card, Empty, ErrorBox, PageHeader, Seg, Skeleton, useFetch } from "@/components/ui";
import { addDays, parseYmd, startOfWeek, ymd } from "@/lib/ranges";
import { formatDetailed, formatShort } from "@/lib/time";
import type { StatsResult } from "@/lib/stats";

type Cell = { day: string; hour: number; active: number; idle: number; desktop: number };
type Resp = { idleInTotal: boolean; cells: Cell[] };
type View = "year" | "month" | "week" | "hour";
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEVELS = ["No activity", "Low", "Moderate", "High", "Very high"];

function levelOf(v: number, q: number[]) {
  if (v <= 0) return 0;
  if (v <= q[0]) return 1;
  if (v <= q[1]) return 2;
  if (v <= q[2]) return 3;
  return 4;
}
function quantiles(vals: number[]) {
  const s = vals.filter((v) => v > 0).sort((a, b) => a - b);
  if (!s.length) return [0, 0, 0];
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return [at(0.25), at(0.5), at(0.75)];
}

export default function HeatmapPage() {
  const now = new Date();
  const [view, setView] = useState<View>("year");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [hourDays, setHourDays] = useState(90);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/achievements", { method: "POST", body: JSON.stringify({ event: "explore_heatmap" }) }).catch(() => {});
  }, []);

  const range = useMemo(() => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (view === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
    if (view === "month") return { from: ymd(new Date(month.y, month.m, 1)), to: ymd(new Date(month.y, month.m + 1, 0)) };
    if (view === "week") return { from: ymd(addDays(startOfWeek(today), -77)), to: ymd(today) };
    return { from: ymd(addDays(today, -(hourDays - 1))), to: ymd(today) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, year, month, hourDays]);

  const { data, error, loading, reload } = useFetch<Resp>(`/api/heatmap?from=${range.from}&to=${range.to}`);
  const dayStats = useFetch<StatsResult>(selected ? `/api/stats?from=${selected}&to=${selected}` : null);

  const days = useMemo(() => {
    const m = new Map<string, { total: number; active: number; idle: number; desktop: number }>();
    if (!data) return m;
    for (const c of data.cells) {
      const d = m.get(c.day) ?? { total: 0, active: 0, idle: 0, desktop: 0 };
      d.active += c.active;
      d.idle += c.idle;
      d.desktop += c.desktop;
      d.total = d.active + (data.idleInTotal ? d.idle : 0);
      m.set(c.day, d);
    }
    return m;
  }, [data]);
  const q = useMemo(() => quantiles([...days.values()].map((d) => d.total)), [days]);
  const hasData = days.size > 0;
  const todayKey = ymd(now);

  const dayCell = (key: string, size?: number) => {
    const d = days.get(key);
    const lvl = levelOf(d?.total ?? 0, q);
    return (
      <button
        key={key}
        className={`heat-cell h${lvl} ${selected === key ? "sel" : ""} ${key > todayKey ? "future" : ""}`}
        style={size ? { width: size, height: size } : undefined}
        title={`${key}: ${d ? formatShort(d.total) : "no activity"}`}
        aria-label={`${key}: ${d ? formatShort(d.total) : "no activity"}`}
        onClick={() => setSelected(key)}
      />
    );
  };

  // ---- Year grid
  const yearGrid = useMemo(() => {
    const jan1 = new Date(year, 0, 1);
    const start = startOfWeek(jan1);
    const end = new Date(year, 11, 31);
    const weeks = Math.ceil(((end.getTime() - start.getTime()) / 86400000 + 1) / 7);
    const cols: { key: string; inYear: boolean }[][] = [];
    const labels: { w: number; label: string }[] = [];
    let lastM = -1;
    for (let w = 0; w < weeks; w++) {
      const col: { key: string; inYear: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const dt = addDays(start, w * 7 + d);
        col.push({ key: ymd(dt), inYear: dt.getFullYear() === year });
        if (d === 0 && dt.getFullYear() === year && dt.getMonth() !== lastM) {
          lastM = dt.getMonth();
          labels.push({ w, label: dt.toLocaleDateString([], { month: "short" }) });
        }
      }
      cols.push(col);
    }
    return { cols, labels };
  }, [year]);

  // ---- Weekly & hourly aggregates
  const weekly = useMemo(() => {
    const t = Array(7).fill(0) as number[];
    const n = Array(7).fill(0) as number[];
    for (const [k, v] of days) {
      const wd = (parseYmd(k).getDay() + 6) % 7;
      t[wd] += v.total;
      if (v.total > 0) n[wd]++;
    }
    return WD.map((label, i) => ({ label, total: t[i], days: n[i], avg: n[i] ? t[i] / n[i] : 0 }));
  }, [days]);
  const matrix = useMemo(() => {
    const m = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    if (data) for (const c of data.cells) m[(parseYmd(c.day).getDay() + 6) % 7][c.hour] += c.active + (data.idleInTotal ? c.idle : 0);
    return m;
  }, [data]);
  const hourTotals = useMemo(() => Array.from({ length: 24 }, (_, h) => matrix.reduce((n, r) => n + r[h], 0)), [matrix]);
  const mq = useMemo(() => quantiles(matrix.flat()), [matrix]);
  const hq = useMemo(() => quantiles(hourTotals), [hourTotals]);
  const wq = useMemo(() => quantiles(weekly.map((w) => w.avg)), [weekly]);

  // ---- Monthly calendar
  const monthCells = useMemo(() => {
    const first = new Date(month.y, month.m, 1);
    const lead = (first.getDay() + 6) % 7;
    const count = new Date(month.y, month.m + 1, 0).getDate();
    return { lead, count };
  }, [month]);

  const sel = selected ? days.get(selected) : null;
  const ds = dayStats.data;

  return (
    <div className="page">
      <PageHeader
        title="Heat Map"
        subtitle="Color intensity reflects recorded usage. Select any cell for details."
        actions={<Seg<View> value={view} onChange={(v) => { setView(v); setSelected(null); }} options={[{ id: "year", label: "Yearly" }, { id: "month", label: "Monthly" }, { id: "week", label: "Weekly" }, { id: "hour", label: "Hourly" }]} />}
      />
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="grid g3">
        <Card className="span2" title={view === "year" ? `Activity in ${year}` : view === "month" ? new Date(month.y, month.m, 1).toLocaleDateString([], { month: "long", year: "numeric" }) : view === "week" ? "Weekday pattern · last 12 weeks" : `Hour-of-day pattern · last ${hourDays} days`}
          right={
            view === "year" ? (
              <span className="flex gap-1"><button className="btn btn-sm" aria-label="Previous year" onClick={() => setYear(year - 1)}><ChevronLeft size={14} /></button><button className="btn btn-sm" aria-label="Next year" disabled={year >= now.getFullYear()} onClick={() => setYear(year + 1)}><ChevronRight size={14} /></button></span>
            ) : view === "month" ? (
              <span className="flex gap-1"><button className="btn btn-sm" aria-label="Previous month" onClick={() => setMonth(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}><ChevronLeft size={14} /></button><button className="btn btn-sm" aria-label="Next month" disabled={month.y === now.getFullYear() && month.m >= now.getMonth()} onClick={() => setMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}><ChevronRight size={14} /></button></span>
            ) : view === "hour" ? (
              <select className="select" style={{ height: 30 }} value={hourDays} onChange={(e) => setHourDays(Number(e.target.value))} aria-label="Range">
                <option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>365 days</option>
              </select>
            ) : null
          }
        >
          {loading && !data ? <Skeleton h={160} /> : (
            <>
              {view === "year" && (
                <div style={{ overflowX: "auto", paddingBottom: 6 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div className="faint" style={{ display: "grid", gridTemplateRows: "repeat(7, 14px)", gap: 4, fontSize: "0.72rem", paddingTop: 20, lineHeight: "14px" }}>
                      {WD.map((w, i) => <span key={w} style={{ visibility: i % 2 === 0 ? "visible" : "hidden" }}>{w}</span>)}
                    </div>
                    <div>
                      <div style={{ position: "relative", height: 16, marginBottom: 4 }}>
                        {yearGrid.labels.map((l) => <span key={l.label} className="faint" style={{ position: "absolute", left: l.w * 18, fontSize: "0.72rem" }}>{l.label}</span>)}
                      </div>
                      <div style={{ display: "grid", gridAutoFlow: "column", gridTemplateRows: "repeat(7, 14px)", gap: 4 }}>
                        {yearGrid.cols.flat().map((c) => (c.inYear ? dayCell(c.key) : <span key={c.key} style={{ width: 14, height: 14 }} />))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {view === "month" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
                    {WD.map((w) => <div key={w} className="faint" style={{ textAlign: "center", fontSize: "0.78rem" }}>{w}</div>)}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                    {Array.from({ length: monthCells.lead }).map((_, i) => <span key={`b${i}`} />)}
                    {Array.from({ length: monthCells.count }).map((_, i) => {
                      const key = ymd(new Date(month.y, month.m, i + 1));
                      const d = days.get(key);
                      const lvl = levelOf(d?.total ?? 0, q);
                      return (
                        <button key={key} className={`h${lvl} ${key > todayKey ? "future" : ""}`} onClick={() => setSelected(key)} title={`${key}: ${d ? formatShort(d.total) : "no activity"}`}
                          style={{ aspectRatio: "1.25", borderRadius: 10, border: 0, outline: selected === key ? "2px solid var(--text)" : "none", opacity: key > todayKey ? 0.3 : 1, padding: 6, textAlign: "left", display: "flex", flexDirection: "column", justifyContent: "space-between", color: lvl >= 3 ? "var(--accent-ink)" : "var(--text)" }}>
                          <span style={{ fontSize: "0.8rem", opacity: 0.8 }}>{i + 1}</span>
                          <span className="num" style={{ fontSize: "0.78rem", fontWeight: 600 }}>{d && d.total ? formatShort(d.total) : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {view === "week" && (
                <div className="flex flex-col gap-3">
                  {weekly.map((w) => (
                    <div key={w.label} className="flex items-center gap-3">
                      <span style={{ width: 36 }} className="muted">{w.label}</span>
                      <div className={`h${levelOf(w.avg, wq)}`} style={{ height: 30, borderRadius: 8, width: `${Math.max(4, (w.avg / Math.max(1, ...weekly.map((x) => x.avg))) * 100)}%`, minWidth: 8 }} title={`${w.label}: average ${formatShort(w.avg)} over ${w.days} day(s)`} />
                      <span className="num muted" style={{ fontSize: "0.88rem" }}>{w.days ? `avg ${formatShort(w.avg)} · ${w.days} day${w.days === 1 ? "" : "s"}` : "no activity"}</span>
                    </div>
                  ))}
                  <div className="faint" style={{ fontSize: "0.8rem" }}>Average per weekday that had recorded activity (days without activity are not counted as zero).</div>
                </div>
              )}
              {view === "hour" && (
                <div style={{ overflowX: "auto" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "36px repeat(24, minmax(16px, 1fr))", gap: 3, minWidth: 560 }}>
                    <span />
                    {Array.from({ length: 24 }).map((_, h) => <span key={h} className="faint" style={{ fontSize: "0.68rem", textAlign: "center" }}>{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>)}
                    {matrix.map((row, wd) => (
                      <Fragment key={`r${wd}`}>
                        <span key={`l${wd}`} className="muted" style={{ fontSize: "0.78rem", alignSelf: "center" }}>{WD[wd]}</span>
                        {row.map((v, h) => <div key={`${wd}-${h}`} className={`h${levelOf(v, mq)}`} title={`${WD[wd]} ${String(h).padStart(2, "0")}:00 — ${v ? formatShort(v) : "no activity"}`} style={{ height: 24, borderRadius: 4 }} />)}
                      </Fragment>
                    ))}
                    <span className="muted" style={{ fontSize: "0.78rem", alignSelf: "center" }}>All</span>
                    {hourTotals.map((v, h) => <div key={`t${h}`} className={`h${levelOf(v, hq)}`} title={`${String(h).padStart(2, "0")}:00 — ${v ? formatShort(v) : "no activity"}`} style={{ height: 24, borderRadius: 4, marginTop: 4 }} />)}
                  </div>
                </div>
              )}
              {!hasData && !loading && <div className="muted" style={{ marginTop: 14 }}>No activity recorded in this period — cells stay empty until real usage is recorded.</div>}
              <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 16 }}>
                {LEVELS.map((l, i) => (
                  <span key={l} className="muted flex items-center gap-2" style={{ fontSize: "0.8rem" }}>
                    <span className={`heat-cell h${i}`} style={{ display: "inline-block", pointerEvents: "none" }} />{l}
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card title="Selected day">
          {!selected ? (
            <Empty icon={<Grid3x3 size={20} />} title="Select a day" text={view === "year" || view === "month" ? "Choose a cell to see that day's totals, most used application and session count." : "Day details are available in the Yearly and Monthly views."} />
          ) : (
            <div className="flex flex-col gap-3">
              <div style={{ fontWeight: 650, fontSize: "1.05rem" }}>{parseYmd(selected).toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
              {dayStats.loading && !ds ? <Skeleton h={120} /> : ds && ds.totals.screen + ds.totals.idle > 0 ? (
                <>
                  {([["Total screen time", ds.totals.screen], ["Active time", ds.totals.active], ["Idle time", ds.totals.idle], ["Desktop time", ds.totals.desktop]] as const).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span className="muted">{k}</span><span className="num" title={formatDetailed(v)}>{formatShort(v)}</span></div>
                  ))}
                  <div className="flex justify-between"><span className="muted">Most used</span><span>{ds.mostUsed ? `${ds.mostUsed.name} (${formatShort(ds.mostUsed.ms)})` : "—"}</span></div>
                  <div className="flex justify-between"><span className="muted">Sessions</span><span className="num">{ds.sessions.count}</span></div>
                </>
              ) : <div className="muted">No activity recorded on this day.</div>}
              {sel && !ds && null}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
