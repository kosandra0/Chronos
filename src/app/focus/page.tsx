"use client";

import { useEffect, useState } from "react";
import { Pause, Play, SkipForward, Square, Timer } from "lucide-react";
import { Card, ErrorBox, PageHeader, SettingRow, Switch, useFetch } from "@/components/ui";
import { ProgressBar, Sl, Tm } from "@/components/V2Parts";
import { Odometer } from "@/components/AnimText";
import { formatShort } from "@/lib/time";
import type { FocusConfig, FocusState } from "@/lib/v2/focus";

type Snap = { config: FocusConfig; state: FocusState; remainingMs: number; phaseLabel: string; now: number };
const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const LABEL = { focus: "Focus", short: "Short break", long: "Long break" } as const;

function NumField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>
      {label}
      <input className="input" type="number" min={min} max={max} value={value} style={{ width: 110 }} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </label>
  );
}

export default function FocusPage() {
  const { data, error, reload } = useFetch<Snap>("/api/v2/focus", { refreshMs: 1000 });
  const [draft, setDraft] = useState<FocusConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data && !draft) setDraft(data.config);
  }, [data, draft]);

  const act = async (action: string, config?: FocusConfig) => {
    setBusy(true);
    try {
      const r = await fetch("/api/v2/focus", { method: "POST", body: JSON.stringify({ action, config }) });
      const j = (await r.json()) as Snap;
      if (config && r.ok) {
        setDraft(j.config);
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      }
    } finally {
      setBusy(false);
      reload();
    }
  };

  const s = data?.state;
  const total = s && s.status !== "idle" ? s.phaseMs : 0;
  const pct = total ? ((total - (data?.remainingMs ?? 0)) / total) * 100 : 0;
  const status = s?.status ?? "idle";
  const phase = s?.phase ?? "focus";
  const R = 92, C = 2 * Math.PI * R;

  return (
    <div className="page">
      <PageHeader title="Focus" subtitle="Work in calm blocks with gentle break reminders. The timer survives restarts and sleep without skipping ahead." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="grid g2" style={{ alignItems: "start" }}>
        <Card>
          <div className="flex flex-col items-center gap-4" style={{ padding: "8px 0 4px" }}>
            <div style={{ position: "relative", width: 220, height: 220 }}>
              <svg width="220" height="220" viewBox="0 0 220 220" aria-hidden>
                <circle cx="110" cy="110" r={R} fill="none" stroke="var(--hover)" strokeWidth="10" />
                <circle cx="110" cy="110" r={R} fill="none" stroke={phase === "focus" ? "var(--accent)" : "#8bb174"} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform="rotate(-90 110 110)" style={{ transition: "stroke-dashoffset .9s linear" }} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div className="stat-label">{status === "idle" ? `Ready: ${LABEL[phase]}` : status === "paused" ? `${LABEL[phase]} (paused)` : LABEL[phase]}</div>
                <div className="num" data-testid="focus-remaining" style={{ fontSize: "2.6rem", fontWeight: 650 }}><Odometer text={status === "idle" ? mmss((data?.config ? (phase === "focus" ? data.config.focusMin : phase === "short" ? data.config.shortMin : data.config.longMin) : 25) * 60000) : mmss(data?.remainingMs ?? 0)} /></div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {status === "idle" && <button className="btn btn-primary" disabled={busy} onClick={() => act("start")}><Play size={15} /> Start {LABEL[phase].toLowerCase()}</button>}
              {status === "running" && <button className="btn" disabled={busy} onClick={() => act("pause")}><Pause size={15} /> Pause</button>}
              {status === "paused" && <button className="btn btn-primary" disabled={busy} onClick={() => act("resume")}><Play size={15} /> Resume</button>}
              {status !== "idle" && <button className="btn" disabled={busy} onClick={() => act("skip")}><SkipForward size={15} /> Skip</button>}
              {status !== "idle" && <button className="btn" disabled={busy} onClick={() => act("stop")}><Square size={15} /> Stop</button>}
            </div>
            <div className="muted" style={{ fontSize: "0.88rem" }}>
              <Timer size={13} style={{ display: "inline", marginRight: 6 }} />
              Completed today: <Tm ms={s ? s.focusMsToday : 0} /> focused · <Sl text={String(s?.completedFocus ?? 0)} /> block{(s?.completedFocus ?? 0) === 1 ? "" : "s"} in this cycle
            </div>
            {total > 0 && <div style={{ width: "100%" }}><ProgressBar pct={pct} label="Block progress" /></div>}
          </div>
        </Card>
        <Card title="Timer settings" right={saved ? <span className="muted" style={{ fontSize: "0.85rem" }}>Saved</span> : undefined}>
          {draft && (
            <>
              <div className="flex flex-wrap gap-4" style={{ marginBottom: 10 }}>
                <NumField label="Focus (min)" value={draft.focusMin} min={1} max={180} onChange={(n) => setDraft({ ...draft, focusMin: n })} />
                <NumField label="Short break (min)" value={draft.shortMin} min={1} max={60} onChange={(n) => setDraft({ ...draft, shortMin: n })} />
                <NumField label="Long break (min)" value={draft.longMin} min={1} max={120} onChange={(n) => setDraft({ ...draft, longMin: n })} />
                <NumField label="Long break every" value={draft.longEvery} min={2} max={10} onChange={(n) => setDraft({ ...draft, longEvery: n })} />
              </div>
              <SettingRow title="Start the next interval automatically" desc="After a focus block a break begins, and after a break a new focus block."><Switch on={draft.auto} onChange={(v) => setDraft({ ...draft, auto: v })} label="Automatic transitions" /></SettingRow>
              <SettingRow title="Notify when an interval ends" desc="One quiet desktop notification at the end of each block or break."><Switch on={draft.notifyPhaseEnd} onChange={(v) => setDraft({ ...draft, notifyPhaseEnd: v })} label="Interval notifications" /></SettingRow>
              <SettingRow title="Eye-rest and stretch reminders" desc="Gentle reminders while you focus. Never more than one per interval, and none in the last minute."><Switch on={draft.reminders} onChange={(v) => setDraft({ ...draft, reminders: v })} label="Reminders" /></SettingRow>
              {draft.reminders && <div style={{ padding: "8px 0" }}><NumField label="Remind every (min)" value={draft.reminderEveryMin} min={5} max={120} onChange={(n) => setDraft({ ...draft, reminderEveryMin: n })} /></div>}
              <div style={{ marginTop: 12 }}><button className="btn btn-primary" disabled={busy} onClick={() => act("config", draft)}>Save settings</button></div>
              <div className="muted" style={{ fontSize: "0.8rem", marginTop: 10 }}>Values outside the allowed range are adjusted automatically (focus 1–180, short 1–60, long 1–120 minutes). Changes apply to the next interval.</div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
