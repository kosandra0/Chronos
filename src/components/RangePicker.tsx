"use client";

import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { PRESETS, describeRange, isValidYmd, resolvePreset, ymd, type DateRange, type Preset } from "@/lib/ranges";

export type RangeState = { preset: Preset; range: DateRange };

export function useRangeState(initial: Preset = "today") {
  const [state, setState] = useState<RangeState>(() => ({ preset: initial, range: resolvePreset(initial) }));
  return [state, setState] as const;
}

export function RangePicker({ state, onChange }: { state: RangeState; onChange: (s: RangeState) => void }) {
  const today = useMemo(() => ymd(new Date()), []);
  const [from, setFrom] = useState(state.range.from ?? today);
  const [to, setTo] = useState(state.range.to ?? today);
  const invalid = !isValidYmd(from) || !isValidYmd(to) || from > to;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="seg">
          {PRESETS.map((p) => (
            <button key={p.id} className={state.preset === p.id ? "on" : ""} onClick={() => onChange({ preset: p.id, range: p.id === "custom" ? { from, to } : resolvePreset(p.id) })}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="muted flex items-center gap-2" style={{ fontSize: "0.9rem" }}>
          <CalendarRange size={15} />
          {describeRange(state.range)}
        </span>
      </div>
      {state.preset === "custom" && (
        <div className="card flex flex-wrap items-end gap-3" style={{ padding: 14 }}>
          <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>
            Start date
            <input className="input" type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>
            End date
            <input className="input" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={invalid} onClick={() => onChange({ preset: "custom", range: { from, to } })}>
            Apply
          </button>
          <button
            className="btn"
            onClick={() => {
              setFrom(today);
              setTo(today);
              onChange({ preset: "today", range: resolvePreset("today") });
            }}
          >
            Reset
          </button>
          {invalid && <span style={{ color: "#e5646f", fontSize: "0.88rem" }}>Choose a valid range where the start is not after the end.</span>}
        </div>
      )}
    </div>
  );
}
