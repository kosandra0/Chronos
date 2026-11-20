"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppWindow, Search, ShieldAlert } from "lucide-react";
import { AppIcon, Card, CategoryBadge, Empty, ErrorBox, PageHeader, Skeleton, useDebounced, useFetch } from "@/components/ui";
import { CATEGORIES } from "@/lib/identify";
import { usePersisted } from "@/lib/persist";
import { formatDetailed, formatHMS, formatPct, fmtDateTime } from "@/lib/time";
import { Odometer } from "@/components/AnimText";
import { Select } from "@/components/Select";

type AppRow = {
  id: string; name: string; exe: string; path: string | null; category: string; detectionStatus: string; elevated: boolean;
  firstSeen: string; lastSeen: string; total: number; sessions: number; longest: number | null; lastUsed: string | null; pct: number;
};

export default function ApplicationsPage() {
  const router = useRouter();
  // Filters are remembered between menus and restarts.
  const [q, setQ] = usePersisted("apps.q", "");
  const [sort, setSort] = usePersisted("apps.sort", "most");
  const [category, setCategory] = usePersisted("apps.category", "all");
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useFetch<{ apps: AppRow[]; grandTotal: number }>(`/api/apps?q=${encodeURIComponent(dq)}&sort=${sort}&category=${encodeURIComponent(category)}`, { refreshMs: 1000 });

  return (
    <div className="page">
      <PageHeader title="Applications" subtitle="Every foreground application WatchTower has observed — including unknown programs, shown by executable name." />
      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 16 }}>
        <div style={{ position: "relative", flex: "1 1 260px", maxWidth: 420 }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 10.5, color: "var(--text3)" }} />
          <input className="input" style={{ width: "100%", paddingLeft: 36 }} placeholder="Search by name, executable or path" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search applications" />
        </div>
        <Select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="most">Most used</option>
          <option value="least">Least used</option>
          <option value="alpha">Alphabetical</option>
          <option value="recent">Recently used</option>
          <option value="longest">Longest session</option>
          <option value="count">Highest session count</option>
        </Select>
        <Select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        {data && <span className="muted">{data.apps.length} application{data.apps.length === 1 ? "" : "s"}</span>}
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <Card style={{ padding: 0 }}>
        {loading && !data ? (
          <div style={{ padding: 20 }} className="flex flex-col gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={44} />)}</div>
        ) : data && data.apps.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Application</th><th>Category</th><th style={{ textAlign: "right" }}>Total usage</th><th style={{ textAlign: "right" }}>% of usage</th><th style={{ textAlign: "right" }}>Sessions</th><th>Last used</th><th>First observed</th></tr>
              </thead>
              <tbody>
                {data.apps.map((a) => (
                  <tr key={a.id} className="clickable" onClick={() => router.push(`/applications/${a.id}`)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <AppIcon name={a.name} />
                        <div>
                          <div style={{ fontWeight: 600 }} className="flex items-center gap-2">
                            {a.name}
                            {(a.elevated || a.detectionStatus === "limited") && <span title={a.detectionStatus === "limited" ? "Process details limited by Windows permissions (possibly elevated)" : "Runs elevated"}><ShieldAlert size={14} style={{ color: "#e0b25a" }} /></span>}
                          </div>
                          <div className="faint mono" style={{ fontSize: "0.8rem" }}>{a.exe}</div>
                        </div>
                      </div>
                    </td>
                    <td><CategoryBadge category={a.category} /></td>
                    <td className="num" style={{ textAlign: "right" }} title={formatDetailed(a.total)}><Odometer text={formatHMS(a.total)} /></td>
                    <td className="num muted" style={{ textAlign: "right" }}>{formatPct(a.total, data.grandTotal)}</td>
                    <td className="num" style={{ textAlign: "right" }}>{a.sessions}</td>
                    <td className="muted">{a.lastUsed ? fmtDateTime(a.lastUsed) : "—"}</td>
                    <td className="muted">{fmtDateTime(a.firstSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={<AppWindow size={20} />} title={dq || category !== "all" ? "No applications match your filters" : "No applications recorded yet"} text={dq || category !== "all" ? "Try a different search term or category." : "Your application history will appear here once WatchTower observes foreground usage."} />
        )}
      </Card>
    </div>
  );
}
