"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { RangePicker, useRangeState } from "@/components/RangePicker";
import { Card, CategoryBadge, Empty, ErrorBox, PageHeader, Seg, Skeleton, AppIcon, catColor, paletteAt, useFetch } from "@/components/ui";
import { DonutChart, MsBars } from "@/components/Charts";
import { rangeQuery } from "@/lib/ranges";
import { usePersisted } from "@/lib/persist";
import { formatDetailed, formatHMS, formatPct, formatShort, fmtDate } from "@/lib/time";
import type { StatsResult } from "@/lib/stats";
import { AnimText, Ms } from "@/components/AnimText";
import { HeatmapView } from "@/components/HeatmapView";

function S({ label, value, sub, title }: { label: string; value: string; sub?: string; title?: string }) {
  return (
    <Card hover>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: "1.4rem" }} title={title}><AnimText value={value} /></div>
      {sub && <div className="stat-sub"><AnimText value={sub} /></div>}
    </Card>
  );
}
const dash = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatHMS(n));

export default function StatisticsPage() {
  const [rs, setRs] = useRangeState("thisWeek", "stats.range");
  const [tab, setTab] = usePersisted<"overview" | "heatmap">("stats.tab", "overview");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "heatmap") setTab("heatmap");
  }, []);
  // Live: figures re-fetch every second while this tab is visible and slide to their new values.
  const { data, error, loading, reload } = useFetch<StatsResult>(tab === "overview" ? `/api/stats?${rangeQuery(rs.range)}` : null, { refreshMs: 1000 });

  useEffect(() => {
    if (rs.preset === "thisWeek") fetch("/api/achievements", { method: "POST", body: JSON.stringify({ event: "review_weekly" }) }).catch(() => {});
  }, [rs.preset]);

  const daily = useMemo(() => data?.byDay.map((d) => ({ label: d.day.slice(5), value: d.total })) ?? [], [data]);
  const hourly = useMemo(() => data?.byHour.map((h) => ({ label: String(h.hour).padStart(2, "0"), value: h.total })) ?? [], [data]);
  const donut = useMemo(() => {
    if (!data) return [];
    const top = data.apps.slice(0, 8).map((a, i) => ({ name: a.name, ms: a.ms, color: paletteAt(i) }));
    const rest = data.apps.slice(8).reduce((n, a) => n + a.ms, 0);
    if (rest) top.push({ name: "Other apps", ms: rest, color: "#7d8794" });
    if (data.totals.desktop) top.push({ name: "Desktop", ms: data.totals.desktop, color: "#9bb0a4" });
    return top;
  }, [data]);

  const a = data?.averages;
  const empty = data && data.totals.screen === 0 && data.totals.idle === 0 && data.sessions.count === 0;

  return (
    <div className="page">
      <PageHeader
        title="Statistics"
        subtitle="Every figure is calculated from your recorded sessions and updates live."
        actions={<Seg<"overview" | "heatmap"> value={tab} onChange={setTab} options={[{ id: "overview", label: "Overview" }, { id: "heatmap", label: "Heat Map" }]} />}
      />
      {tab === "heatmap" && <HeatmapView />}
      {tab === "overview" && (<>
      <RangePicker state={rs} onChange={setRs} />
      <div style={{ height: 20 }} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && (
        <div className="grid g4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} h={96} />)}</div>
      )}
      {data && empty && (
        <Card>
          <Empty icon={<BarChart3 size={20} />} title="No activity recorded in this period" text="Select a different date range to explore your usage, or wait for WatchTower to record more activity." />
        </Card>
      )}
      {data && !empty && (
        <>
          <div className="grid g4">
            <S label="Total screen time" value={formatHMS(data.totals.screen)} sub="of tracked foreground time" />
            <S label="Total active time" value={formatHMS(data.totals.active)} sub="applications + desktop" title={formatDetailed(data.totals.active)} />
            <S label="Total idle time" value={formatHMS(data.totals.idle)} sub={data.idleInTotal ? "included in screen time" : "excluded from screen time"} title={formatDetailed(data.totals.idle)} />
            <S label="Total desktop time" value={formatHMS(data.totals.desktop)} sub="Windows desktop & taskbar" title={formatDetailed(data.totals.desktop)} />
            <S label="Average daily usage" value={dash(a?.perUsageDay)} sub={`per usage day · ${a?.usageDays ?? 0} day(s) with activity`} />
            <S label="Daily average (calendar)" value={dash(a?.perCalendarDay)} sub={`per calendar day · ${a?.calendarDays ?? 0} day(s) elapsed, empty days count as zero`} />
            <S label="Weekly usage average" value={dash(a?.perWeek)} sub={`total ÷ (${a?.calendarDays ?? 0} calendar days ÷ 7)`} />
            <S label="Monthly usage average" value={dash(a?.perMonth)} sub={`total ÷ (${a?.calendarDays ?? 0} calendar days ÷ 30.44)`} />
            <S label="Average session" value={dash(data.sessions.avgMs)} sub={`across ${data.sessions.activeCount} active session(s)`} />
            <S label="Longest session" value={dash(data.sessions.longest?.ms)} sub={data.sessions.longest ? `${data.sessions.longest.app} · ${fmtDate(data.sessions.longest.start)}` : undefined} />
            <S label="Shortest session" value={dash(data.sessions.shortestMs)} sub="active sessions" />
            <S label="Total sessions" value={String(data.sessions.count)} sub="incl. desktop and idle" />
            <S label="Most used application" value={data.mostUsed?.name ?? "—"} sub={data.mostUsed ? `${formatShort(data.mostUsed.ms)} · ${formatPct(data.mostUsed.ms, data.totals.active)}` : undefined} />
            <S label="Least used application" value={data.leastUsed?.name ?? "—"} sub={data.leastUsed ? formatShort(data.leastUsed.ms) : undefined} />
            <S label="Unique applications" value={String(data.uniqueApps)} />
            <S label="Total usage days" value={String(a?.usageDays ?? 0)} sub={`of ${a?.calendarDays ?? 0} calendar day(s)`} />
            <S label="Highest usage day" value={data.highestDay ? formatHMS(data.highestDay.ms) : "—"} sub={data.highestDay ? fmtDate(data.highestDay.day + "T12:00:00") : undefined} />
            <S label="Lowest usage day" value={data.lowestDay ? formatHMS(data.lowestDay.ms) : "—"} sub={data.lowestDay ? `${fmtDate(data.lowestDay.day + "T12:00:00")} (days with activity only)` : undefined} />
            <S label="Application switching" value={data.sessions.switchesPerHour === null ? "—" : `${data.sessions.switchesPerHour.toFixed(1)} / hour`} sub={`${data.sessions.switches} switches while active`} />
            <S label="Idle sessions" value={String(data.idle.count)} sub={`longest ${dash(data.idle.longestMs || null)} · avg ${dash(data.idle.avgMs)}`} />
          </div>

          <div className="grid g3" style={{ marginTop: "var(--gap)" }}>
            <Card title="Application distribution">
              <DonutChart data={donut} total={data.totals.active} label="active time" />
            </Card>
            <Card title="Daily usage" className="span2">
              {daily.length ? <MsBars data={daily} height={260} /> : <Empty title="No daily data" />}
            </Card>
            <Card title="Hourly usage distribution" className="span3">
              <MsBars data={hourly} height={220} />
            </Card>
          </div>

          <div className="grid g2" style={{ marginTop: "var(--gap)" }}>
            <Card title="Category breakdown">
              {data.categories.map((c) => (
                <div key={c.category} style={{ marginBottom: 12 }}>
                  <div className="flex justify-between" style={{ fontSize: "0.9rem", marginBottom: 5 }}>
                    <span className="flex items-center gap-2"><span className="dot" style={{ background: catColor(c.category) }} />{c.category}</span>
                    <span className="muted num">{formatShort(c.ms)} · {formatPct(c.ms, data.totals.active)}</span>
                  </div>
                  <div className="progress"><i style={{ width: `${(c.ms / Math.max(1, data.totals.active)) * 100}%`, background: catColor(c.category) }} /></div>
                </div>
              ))}
              {!data.categories.length && <Empty title="No categories yet" />}
            </Card>
            <Card title="Idle summary">
              <div className="grid g2" style={{ gap: 12 }}>
                <div><div className="muted" style={{ fontSize: "0.82rem" }}>Total idle</div><div className="stat-value" style={{ fontSize: "1.3rem" }}>{formatShort(data.idle.totalMs)}</div></div>
                <div><div className="muted" style={{ fontSize: "0.82rem" }}>Idle sessions</div><div className="stat-value" style={{ fontSize: "1.3rem" }}>{data.idle.count}</div></div>
                <div><div className="muted" style={{ fontSize: "0.82rem" }}>Longest idle</div><div className="stat-value" style={{ fontSize: "1.3rem" }}>{dash(data.idle.longestMs || null)}</div></div>
                <div><div className="muted" style={{ fontSize: "0.82rem" }}>Average idle</div><div className="stat-value" style={{ fontSize: "1.3rem" }}>{dash(data.idle.avgMs)}</div></div>
              </div>
              <div style={{ marginTop: 14 }}>
                {data.idle.byDay.length ? <MsBars data={data.idle.byDay.map((d) => ({ label: d.day.slice(5), value: d.ms }))} height={120} /> : <div className="muted">No idle periods in this range.</div>}
              </div>
            </Card>
          </div>

          <Card title="Application ranking" style={{ marginTop: "var(--gap)" }}>
            {data.apps.length ? (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>#</th><th>Application</th><th>Category</th><th style={{ textAlign: "right" }}>Time</th><th style={{ width: 220 }}>Share of active</th></tr></thead>
                  <tbody>
                    {data.apps.slice(0, 25).map((x, i) => (
                      <tr key={x.id}>
                        <td className="muted">{i + 1}</td>
                        <td><Link href={`/applications/${x.id}`} className="flex items-center gap-3"><AppIcon name={x.name} size={26} /><span><span style={{ fontWeight: 550 }}>{x.name}</span> <span className="faint mono">{x.exe}</span></span></Link></td>
                        <td><CategoryBadge category={x.category} /></td>
                        <td className="num" style={{ textAlign: "right" }} title={formatDetailed(x.ms)}><Ms ms={x.ms} /></td>
                        <td><div className="flex items-center gap-2"><div className="progress" style={{ flex: 1 }}><i style={{ width: `${x.pct * 100}%` }} /></div><span className="muted num" style={{ width: 44, textAlign: "right" }}>{formatPct(x.ms, data.totals.active)}</span></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty title="No applications in this period" text="Your application history will appear here." />}
          </Card>
        </>
      )}
      </>)}
    </div>
  );
}
