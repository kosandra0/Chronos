"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, ErrorBox, PageHeader, Seg, Skeleton, useFetch } from "@/components/ui";
import { CompareView, Delta, ProgressBar, Sl, Stat, Tm, type Cmp } from "@/components/V2Parts";
import { Select } from "@/components/Select";
import { useSettings } from "@/components/Providers";
import { addDays, parseYmd, ymd } from "@/lib/ranges";
import { formatShort } from "@/lib/time";

type Report = {
  range: { from: string; to: string };
  totalMs: number; previousTotalMs: number; comparison: Cmp;
  productive: { ms: number; comparison: Cmp }; distracting: { ms: number; comparison: Cmp };
  neutralMs: number; score: number | null; previousScore: number | null;
  topApps: { id: string; name: string; ms: number }[]; topCategories: { category: string; ms: number }[];
  byDay: { day: string; ms: number }[];
};
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function ReportsPage() {
  const [tab, setTab] = useState<"weekly" | "week" | "month">("weekly");
  const [week, setWeek] = useState<string>("");
  useEffect(() => {
    const w = new URLSearchParams(window.location.search).get("week");
    if (w) setWeek(w);
  }, []);
  const { data, error, loading, reload } = useFetch<Report>(tab === "weekly" ? `/api/v2/reports${week ? `?week=${week}` : ""}` : null);
  const { settings, update } = useSettings();
  const shift = (n: number) => {
    if (!data) return;
    setWeek(ymd(addDays(parseYmd(data.range.from), n * 7)));
  };
  const max = Math.max(1, ...(data?.byDay.map((d) => d.ms) ?? [1]));

  return (
    <div className="page">
      <PageHeader title="Reports" subtitle="A weekly summary of completed weeks, and quick comparisons between periods." actions={<Seg<"weekly" | "week" | "month"> value={tab} onChange={setTab} options={[{ id: "weekly", label: "Weekly report" }, { id: "week", label: "This vs last week" }, { id: "month", label: "This vs last month" }]} />} />
      {tab === "week" && <CompareView kind="week" />}
      {tab === "month" && <CompareView kind="month" />}
      {tab === "weekly" && (
        <>
          {error && <ErrorBox message={error} onRetry={reload} />}
          {loading && !data ? <Skeleton h={220} /> : data && (
            <div className="flex flex-col gap-4" data-testid="weekly-report">
              <div className="flex items-center gap-3">
                <button className="btn btn-sm" aria-label="Previous week" onClick={() => shift(-1)}><ChevronLeft size={15} /></button>
                <div className="num" style={{ fontWeight: 600 }} data-testid="report-range">{data.range.from} → {data.range.to}</div>
                <button className="btn btn-sm" aria-label="Next week" onClick={() => shift(1)}><ChevronRight size={15} /></button>
                <span className="muted" style={{ fontSize: "0.85rem" }}>Only completed weeks are reported.</span>
              </div>
              <div className="grid g4">
                <Stat label="Total screen time" value={formatShort(data.totalMs)} right={<div style={{ marginTop: 6 }}><Delta c={data.comparison} /></div>} sub={`Previous week: ${formatShort(data.previousTotalMs)}`} />
                <Stat label="Productive" value={formatShort(data.productive.ms)} right={<div style={{ marginTop: 6 }}><Delta c={data.productive.comparison} lowerIsBetter={false} /></div>} />
                <Stat label="Distracting" value={formatShort(data.distracting.ms)} right={<div style={{ marginTop: 6 }}><Delta c={data.distracting.comparison} /></div>} />
                <Stat label="Productivity score" value={data.score === null ? "Unavailable" : `${data.score.toFixed(0)}%`} sub={data.previousScore === null ? "Previous week: unavailable" : `Previous week: ${data.previousScore.toFixed(0)}%`} />
              </div>
              <div className="grid g2" style={{ alignItems: "start" }}>
                <Card title="Daily distribution">
                  {data.byDay.map((d) => (
                    <div key={d.day} className="flex items-center gap-3" style={{ padding: "5px 0" }}>
                      <div className="muted num" style={{ width: 88, fontSize: "0.85rem" }}>{DAYS[parseYmd(d.day).getDay()].slice(0, 3)} {d.day.slice(5)}</div>
                      <div style={{ flex: 1 }}><ProgressBar pct={(d.ms / max) * 100} height={8} label={d.day} /></div>
                      <div className="num" style={{ width: 70, textAlign: "right", fontSize: "0.88rem" }}><Tm ms={d.ms} /></div>
                    </div>
                  ))}
                </Card>
                <div className="flex flex-col gap-4">
                  <Card title="Most-used applications">{data.topApps.length ? data.topApps.map((a) => <div key={a.id} className="set-row" style={{ padding: "7px 0" }}><div style={{ fontWeight: 600 }}>{a.name}</div><div className="num"><Tm ms={a.ms} /></div></div>) : <div className="muted">No activity that week.</div>}</Card>
                  <Card title="Most-used categories">{data.topCategories.length ? data.topCategories.map((c) => <div key={c.category} className="set-row" style={{ padding: "7px 0" }}><div style={{ fontWeight: 600 }}>{c.category}</div><div className="num"><Tm ms={c.ms} /></div></div>) : <div className="muted">No activity that week.</div>}</Card>
                </div>
              </div>
            </div>
          )}
          <div style={{ height: 16 }} />
          <Card title="Weekly notification">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.weeklyReportEnabled} onChange={(e) => update({ weeklyReportEnabled: e.target.checked })} aria-label="Enable weekly report" /> Send a desktop notification once a week</label>
              <Select className="select" value={String(settings.weeklyReportDay)} onChange={(e) => update({ weeklyReportDay: Number(e.target.value) })} aria-label="Weekly report day">
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </Select>
              <input className="input" type="time" value={settings.weeklyReportTime} onChange={(e) => e.target.value && update({ weeklyReportTime: e.target.value })} aria-label="Weekly report time" />
            </div>
            <div className="muted" style={{ fontSize: "0.82rem", marginTop: 8 }}>Uses your local clock and covers the last completed Monday–Sunday week. Each week is reported once.</div>
          </Card>
        </>
      )}
    </div>
  );
}
