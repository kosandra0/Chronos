"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ScanSearch, ZoomIn } from "lucide-react";
import { DayTimeline } from "@/components/DayTimeline";
import { SessionDetail } from "@/components/SessionDetail";
import { Card, Modal, PageHeader, Seg } from "@/components/ui";
import { addDays, parseYmd, ymd } from "@/lib/ranges";
import type { SessionRow } from "@/lib/stats";

export default function TimelinePage() {
  const today = ymd(new Date());
  const [date, setDate] = useState(today);
  const [zoom, setZoom] = useState("24");
  const [start, setStart] = useState(8);
  const [sel, setSel] = useState<SessionRow | null>(null);
  const [inspect, setInspect] = useState(false);
  const z = Number(zoom);
  const maxStart = 24 - z;
  const startHour = Math.min(start, maxStart);
  const shift = (n: number) => { setDate(ymd(addDays(parseYmd(date), n))); setSel(null); };

  return (
    <div className="page">
      <PageHeader
        title="Activity Timeline"
        subtitle="How you moved between applications. Built directly from recorded sessions."
        actions={
          <>
            <button className="btn btn-sm" aria-label="Previous day" onClick={() => shift(-1)}><ChevronLeft size={14} /></button>
            <input className="input" type="date" value={date} max={today} onChange={(e) => e.target.value && (setDate(e.target.value), setSel(null))} aria-label="Select date" />
            <button className="btn btn-sm" aria-label="Next day" disabled={date >= today} onClick={() => shift(1)}><ChevronRight size={14} /></button>
            {date !== today && <button className="btn btn-sm" onClick={() => setDate(today)}>Today</button>}
            <div style={{ flexBasis: "100%", display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-primary" disabled={!sel} onClick={() => setInspect(true)} title={sel ? "Open the details of the selected session" : "Select a block or a row first"}>
                <ScanSearch size={15} /> {sel ? `Inspect · ${sel.name}` : "Inspect session"}
              </button>
            </div>
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-4" style={{ marginBottom: 18 }}>
          <span className="muted flex items-center gap-2"><ZoomIn size={15} /> Zoom</span>
          <Seg value={zoom} onChange={setZoom} options={[{ id: "24", label: "24 h" }, { id: "12", label: "12 h" }, { id: "6", label: "6 h" }, { id: "3", label: "3 h" }, { id: "1", label: "1 h" }]} />
          {z < 24 && (
            <label className="flex items-center gap-3 muted" style={{ fontSize: "0.88rem", flex: "1 1 220px" }}>
              Window start
              <input type="range" min={0} max={maxStart} step={z <= 3 ? 0.5 : 1} value={startHour} onChange={(e) => setStart(Number(e.target.value))} style={{ flex: 1 }} aria-label="Window start hour" />
              <span className="num" style={{ width: 90 }}>{String(Math.floor(startHour)).padStart(2, "0")}:{startHour % 1 ? "30" : "00"} – {String(Math.floor(startHour + z)).padStart(2, "0")}:{(startHour + z) % 1 ? "30" : "00"}</span>
            </label>
          )}
        </div>
        <DayTimeline date={date} zoom={z} startHour={startHour} height={72} selectedId={sel?.id} onSelect={setSel} refreshMs={date === today ? 1000 : undefined} showList />
      </Card>
      <Modal open={inspect && !!sel} onClose={() => setInspect(false)} title="Inspect session" width={720}>
        {sel && <SessionDetail s={sel} />}
      </Modal>
    </div>
  );
}
