"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, List, Search } from "lucide-react";
import { AppIcon, Card, CategoryBadge, Empty, ErrorBox, Modal, PageHeader, Skeleton, useDebounced, useFetch } from "@/components/ui";
import { SessionDetail } from "@/components/SessionDetail";
import { CATEGORIES } from "@/lib/identify";
import { formatShort, fmtDate, fmtTime } from "@/lib/time";
import type { SessionRow } from "@/lib/stats";

type Resp = { sessions: SessionRow[]; total: number; page: number; pageSize: number };
const PAGE_SIZE = 25;

export default function SessionsPage() {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appId, setAppId] = useState("");
  const [category, setCategory] = useState("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<SessionRow | null>(null);
  const dq = useDebounced(q);
  const apps = useFetch<{ apps: { id: string; name: string }[] }>("/api/apps?sort=alpha");

  useEffect(() => setPage(1), [dq, from, to, appId, category, type, sort, dir]);

  const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), q: dq, from, to, appId, category, type, sort, dir });
  const { data, error, loading, reload } = useFetch<Resp>(`/api/sessions?${qs}`);
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const th = (key: string, label: string, right = false) => (
    <th className="sortable" style={{ textAlign: right ? "right" : "left" }} onClick={() => (sort === key ? setDir(dir === "asc" ? "desc" : "asc") : (setSort(key), setDir("desc")))} aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <span className="inline-flex items-center gap-1">{label}{sort === key && (dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</span>
    </th>
  );
  const filtered = !!(dq || from || to || appId || category !== "all" || type !== "all");

  return (
    <div className="page">
      <PageHeader title="Session History" subtitle={data ? `${data.total.toLocaleString()} session${data.total === 1 ? "" : "s"}${filtered ? " match your filters" : " recorded"}` : "Every recorded activity transition"} />
      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 16 }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 320 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 10.5, color: "var(--text3)" }} />
          <input className="input" style={{ width: "100%", paddingLeft: 36 }} placeholder="Search sessions" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sessions" />
        </div>
        <label className="flex items-center gap-2 muted" style={{ fontSize: "0.85rem" }}>From <input className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex items-center gap-2 muted" style={{ fontSize: "0.85rem" }}>To <input className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        <select className="select" value={appId} onChange={(e) => setAppId(e.target.value)} aria-label="Application filter">
          <option value="">All applications</option>
          {apps.data?.apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category filter">
          <option value="all">All categories</option>
          {[...CATEGORIES, "Desktop", "Idle"].map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Activity type filter">
          <option value="all">All activity</option><option value="app">Application</option><option value="desktop">Desktop</option><option value="idle">Idle</option><option value="locked">Locked</option>
        </select>
        {filtered && <button className="btn btn-sm" onClick={() => { setQ(""); setFrom(""); setTo(""); setAppId(""); setCategory("all"); setType("all"); }}>Clear filters</button>}
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <Card style={{ padding: 0 }}>
        {loading && !data ? (
          <div style={{ padding: 20 }} className="flex flex-col gap-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={36} />)}</div>
        ) : data && data.sessions.length ? (
          <>
            <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s" }}>
              <table className="tbl">
                <thead><tr>{th("date", "Date")}<th>Start</th><th>End</th>{th("app", "Application")}{th("category", "Category")}{th("duration", "Duration", true)}{th("type", "Activity")}</tr></thead>
                <tbody>
                  {data.sessions.map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => setOpen(s)}>
                      <td className="num">{fmtDate(s.start)}</td>
                      <td className="num muted">{fmtTime(s.start)}</td>
                      <td className="num muted">{s.open ? <span className="badge"><span className="dot live" />running</span> : fmtTime(s.end)}</td>
                      <td><div className="flex items-center gap-2"><AppIcon name={s.name} size={24} special={s.type === "app" ? undefined : (s.type as "desktop" | "idle" | "locked")} /><span style={{ fontWeight: 550 }}>{s.name}</span></div></td>
                      <td><CategoryBadge category={s.category} /></td>
                      <td className="num" style={{ textAlign: "right" }}>{formatShort(s.durationMs)}</td>
                      <td className="muted" style={{ textTransform: "capitalize" }}>{s.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between" style={{ padding: "12px 16px" }}>
              <span className="muted num">Page {page} of {pages.toLocaleString()}</span>
              <div className="flex gap-2">
                <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /> Previous</button>
                <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next <ChevronRight size={14} /></button>
              </div>
            </div>
          </>
        ) : (
          <Empty icon={<List size={20} />} title={filtered ? "No sessions match your filters" : "No activity recorded yet"} text={filtered ? "Adjust or clear the filters to see more sessions." : "Sessions appear here every time your foreground activity changes."} />
        )}
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} title="Session details" width={560}>{open && <SessionDetail s={open} />}</Modal>
    </div>
  );
}
