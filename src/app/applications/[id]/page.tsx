"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { AppIcon, Card, CategoryBadge, Empty, ErrorBox, PageHeader, Skeleton, useFetch } from "@/components/ui";
import { MsArea, MsBars } from "@/components/Charts";
import { RangePicker, useRangeState } from "@/components/RangePicker";
import { SessionDetail } from "@/components/SessionDetail";
import { Modal } from "@/components/ui";
import { CATEGORIES } from "@/lib/identify";
import { rangeQuery, ymd } from "@/lib/ranges";
import { formatDetailed, formatShort, fmtDateTime, fmtTime } from "@/lib/time";
import type { SessionRow } from "@/lib/stats";
import { Select } from "@/components/Select";

type Detail = {
  app: { id: string; name: string; exe: string; path: string | null; category: string; categoryOverridden: boolean; detectionStatus: string; elevated: boolean; firstSeen: string; lastSeen: string };
  periods: Record<string, number>;
  lifetimeSessions: { count: number; avgMs: number | null; longest: { ms: number; start: string } | null; shortestMs: number | null };
  selected: { byDay: { day: string; total: number }[]; byHour: { hour: number; total: number }[] };
  lifetimeByDay: { day: string; total: number }[];
  recent: SessionRow[];
};

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [rs, setRs] = useRangeState("thisMonth");
  const [open, setOpen] = useState<SessionRow | null>(null);
  const today = ymd(new Date());
  const { data, error, loading, reload } = useFetch<Detail>(`/api/apps/${id}?today=${today}&${rangeQuery(rs.range)}`);

  useEffect(() => {
    fetch("/api/achievements", { method: "POST", body: JSON.stringify({ event: "explore_apps" }) }).catch(() => {});
  }, []);

  const daily = useMemo(() => data?.selected.byDay.map((d) => ({ label: d.day.slice(5), value: d.total })) ?? [], [data]);
  const hourly = useMemo(() => data?.selected.byHour.map((h) => ({ label: String(h.hour).padStart(2, "0"), value: h.total })) ?? [], [data]);
  const history = useMemo(() => data?.lifetimeByDay.map((d) => ({ label: d.day, value: d.total })) ?? [], [data]);

  async function setCategory(category: string) {
    await fetch(`/api/apps/${id}`, { method: "PATCH", body: JSON.stringify({ category }) });
    reload();
  }

  if (error && !data) return <div className="page"><Link href="/applications" className="btn btn-sm"><ArrowLeft size={14} /> Applications</Link><div style={{ height: 16 }} /><ErrorBox message={error} onRetry={reload} /></div>;
  if (!data) return <div className="page"><Skeleton h={40} w={300} /><div style={{ height: 20 }} /><div className="grid g4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={90} />)}</div></div>;

  const { app, periods, lifetimeSessions: ls } = data;
  const stat = (label: string, v: number | null, sub?: string, text?: string) => (
    <Card hover>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: "1.4rem" }} title={v ? formatDetailed(v) : undefined}>{text ?? (v === null ? "—" : formatShort(v))}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </Card>
  );

  return (
    <div className="page">
      <Link href="/applications" className="btn btn-sm" style={{ marginBottom: 16 }}><ArrowLeft size={14} /> Applications</Link>
      <PageHeader
        title={app.name}
        subtitle={<span className="mono">{app.exe}{app.path ? ` · ${app.path}` : ""}</span>}
        actions={
          <>
            <CategoryBadge category={app.category} />
            <Select className="select" value={app.category} onChange={(e) => setCategory(e.target.value)} aria-label="Change category">
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </>
        }
      />
      <div className="flex items-center gap-3" style={{ marginBottom: 18 }}>
        <AppIcon name={app.name} size={44} />
        <div className="muted" style={{ lineHeight: 1.5 }}>
          First observed {fmtDateTime(app.firstSeen)} · last seen {fmtDateTime(app.lastSeen)}
          {(app.elevated || app.detectionStatus === "limited") && (
            <div className="flex items-center gap-2" style={{ color: "#e0b25a" }}><ShieldAlert size={14} />{app.detectionStatus === "limited" ? "Detection limited: Windows restricted access to this process (it may be elevated)." : "Runs with elevated privileges."}</div>
          )}
        </div>
      </div>

      <div className="grid g4">
        {stat("Lifetime usage", periods.lifetime)}
        {stat("Today", periods.today)}
        {stat("Yesterday", periods.yesterday)}
        {stat("This week", periods.week)}
        {stat("This month", periods.month)}
        {stat("This year", periods.year)}
        {stat("Sessions", null, "recorded in total", String(ls.count))}
        {stat("Average session", ls.avgMs)}
        {stat("Longest session", ls.longest?.ms ?? null, ls.longest ? fmtDateTime(ls.longest.start) : undefined)}
        {stat("Shortest session", ls.shortestMs)}
      </div>

      <div style={{ height: 22 }} />
      <Card title="Custom date range" right={<span className="num" style={{ textTransform: "none", letterSpacing: 0 }}>{formatShort(periods.custom)} in range</span>}>
        <RangePicker state={rs} onChange={setRs} />
        <div className="grid g2" style={{ marginTop: 18 }}>
          <div>
            <div className="muted" style={{ marginBottom: 6, fontSize: "0.85rem" }}>Daily usage</div>
            {daily.length ? <MsBars data={daily} height={220} /> : <Empty title="No usage in this range" />}
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6, fontSize: "0.85rem" }}>Hourly usage</div>
            {data.selected.byHour.some((h) => h.total) ? <MsBars data={hourly} height={220} /> : <Empty title="No usage in this range" />}
          </div>
        </div>
      </Card>

      <div className="grid g3" style={{ marginTop: "var(--gap)" }}>
        <Card title="Historical timeline" className="span2">
          {history.length ? <MsArea data={history} height={230} /> : <Empty title="No history yet" text="Daily usage across the whole lifetime of this application appears here." />}
        </Card>
        <Card title="Recent sessions">
          {data.recent.length ? data.recent.map((s) => (
            <button key={s.id} className="list-row w-full" style={{ background: "transparent", border: 0, borderBottom: "1px solid var(--border)", textAlign: "left" }} onClick={() => setOpen(s)}>
              <div style={{ flex: 1 }}>
                <div className="num" style={{ fontSize: "0.9rem" }}>{fmtDateTime(s.start)}</div>
                <div className="muted num" style={{ fontSize: "0.8rem" }}>until {s.open ? "now" : fmtTime(s.end)}</div>
              </div>
              <span className="num">{formatShort(s.durationMs)}</span>
            </button>
          )) : <Empty title="No sessions" />}
        </Card>
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title="Session details" width={560}>{open && <SessionDetail s={open} />}</Modal>
    </div>
  );
}
