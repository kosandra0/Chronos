"use client";

import type { SessionRow } from "@/lib/stats";
import { formatDetailed, fmtDate } from "@/lib/time";
import { AppIcon, CategoryBadge, useFetch } from "./ui";
import { useState } from "react";
import { Select } from "./Select";
import { preciseTime } from "./DayTimeline";

const REASONS: Record<string, string> = {
  "monitor-unavailable": "Monitor stopped reporting (session closed at last heartbeat)",
  "system-suspended": "Computer suspended",
  "agent-stopped": "Monitoring agent stopped",
  "monitoring-paused": "Monitoring paused",
  "chronos-unfocused": "WatchTower window lost focus",
  "chronos-closed": "WatchTower window closed",
  imported: "Imported record",
};

function ProjectPicker({ id }: { id: string }) {
  const projects = useFetch<{ projects: { id: string; name: string; client: string; archived: boolean }[] }>("/api/v2/projects");
  const current = useFetch<{ projectId: string | null }>(`/api/v2/projects/assign?session=${encodeURIComponent(id)}`);
  const [override, setOverride] = useState<string | null | undefined>(undefined);
  const value = override !== undefined ? override : current.data?.projectId ?? null;
  const choose = async (projectId: string | null) => {
    setOverride(projectId);
    const r = await fetch("/api/v2/projects/assign", { method: "POST", body: JSON.stringify({ sessionIds: [id], projectId }) });
    if (!r.ok) setOverride(undefined);
  };
  const list = (projects.data?.projects ?? []).filter((p) => !p.archived || p.id === value);
  return (
    <div className="set-row" style={{ padding: "9px 0" }} data-testid="session-project">
      <div className="muted" style={{ fontSize: "0.88rem" }}>Project</div>
      <Select className="select" value={value ?? ""} onChange={(e) => choose(e.target.value || null)} aria-label="Project for this session">
        <option value="">No project</option>
        {list.map((p) => <option key={p.id} value={p.id}>{p.name}{p.client ? ` · ${p.client}` : ""}</option>)}
      </Select>
    </div>
  );
}

export function SessionDetail({ s }: { s: SessionRow }) {
  const special = s.type === "app" ? undefined : (s.type as "desktop" | "idle" | "locked");
  const rows: [string, string][] = [
    ["Session ID", s.id],
    ["Date", fmtDate(s.start)],
    ["Start", preciseTime(s.start)],
    ["End", s.open ? `${preciseTime(s.end)} (still running)` : preciseTime(s.end)],
    ["Duration", formatDetailed(s.durationMs)],
    ["Duration (ms)", String(s.durationMs)],
    ["Activity type", s.type],
    ["Termination", s.open ? "Open" : (s.reason ? (REASONS[s.reason] ?? s.reason.replace(/-/g, " ")) : "Unknown")],
    ["Recorded by", s.source === "ui" ? "WatchTower UI (self tracking)" : s.source],
  ];
  if (s.exe) rows.push(["Executable", s.exe]);
  if (s.path) rows.push(["Path", s.path]);
  if (s.type === "app") rows.push(["Detection", s.detection === "limited" ? "Limited — process details restricted by Windows (possibly elevated)" : s.elevated ? "Elevated process" : "Full"]);
  if (s.title) rows.push(["Window title", s.title]);
  return (
    <div>
      <div className="flex items-center gap-3" style={{ marginBottom: 14 }}>
        <AppIcon name={s.name} special={special} />
        <div>
          <div style={{ fontWeight: 650, fontSize: "1.05rem" }}>{s.name}</div>
          <div style={{ marginTop: 4 }}>
            <CategoryBadge category={s.category} />
          </div>
        </div>
      </div>
      {(s.type === "app" || s.type === "desktop") && !s.open && <ProjectPicker id={s.id} />}
      {rows.map(([k, v]) => (
        <div key={k} className="set-row" style={{ padding: "9px 0" }}>
          <div className="muted" style={{ fontSize: "0.88rem" }}>
            {k}
          </div>
          <div className="num" style={{ textAlign: "right", wordBreak: "break-all", maxWidth: 420 }}>
            {v}
          </div>
        </div>
      ))}
    </div>
  );
}
