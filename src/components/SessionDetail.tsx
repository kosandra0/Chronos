"use client";

import type { SessionRow } from "@/lib/stats";
import { formatDetailed, fmtDate } from "@/lib/time";
import { AppIcon, CategoryBadge } from "./ui";
import { preciseTime } from "./DayTimeline";

const REASONS: Record<string, string> = {
  "monitor-unavailable": "Monitor stopped reporting (session closed at last heartbeat)",
  "system-suspended": "Computer suspended",
  "agent-stopped": "Monitoring agent stopped",
  "monitoring-paused": "Monitoring paused",
  "chronos-unfocused": "Chronos window lost focus",
  "chronos-closed": "Chronos window closed",
  imported: "Imported record",
};

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
    ["Recorded by", s.source === "ui" ? "Chronos UI (self tracking)" : s.source],
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
