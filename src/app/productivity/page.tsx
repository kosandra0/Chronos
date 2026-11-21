"use client";

import { Target } from "lucide-react";
import { AppIcon, Card, CategoryBadge, Empty, ErrorBox, PageHeader, Skeleton, useFetch } from "@/components/ui";
import { Delta, ProgressBar, Sl, Stat, Tm, type Cmp } from "@/components/V2Parts";
import { Select } from "@/components/Select";
import { useSettings } from "@/components/Providers";
import { formatShort } from "@/lib/time";
import type { ProdClass } from "@/lib/v2/productivity";

type Summary = {
  productiveMs: number; distractingMs: number; neutralMs: number; score: number | null;
  goal: { hours: number; goalMs: number; pct: number | null; remainingMs: number; met: boolean };
  apps: { id: string; name: string; exe: string; category: string; ms: number; cls: ProdClass; overridden: boolean }[];
};
type Dash = { day: string; current: Summary; previous: Summary; change: { productive: Cmp; distracting: Cmp; score: number | null } };

const CLS: { id: ProdClass; label: string }[] = [{ id: "productive", label: "Productive" }, { id: "neutral", label: "Neutral" }, { id: "distracting", label: "Distracting" }];

export default function ProductivityPage() {
  const { data, error, loading, reload } = useFetch<Dash>("/api/v2/productivity", { refreshMs: 3000 });
  const { settings, update } = useSettings();
  const setClass = async (appId: string, cls: string) => {
    await fetch("/api/v2/productivity", { method: "PUT", body: JSON.stringify({ appId, class: cls === "default" ? null : cls }) });
    reload();
  };
  const c = data?.current;
  const score = c?.score;

  return (
    <div className="page">
      <PageHeader title="Productivity" subtitle="Classify applications as productive, neutral or distracting and track a daily goal. Separate from application categories." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Skeleton h={200} /> : data && c && (
        <>
          <div className="grid g4">
            <Stat label="Productivity score" value={<span data-testid="prod-score"><Sl text={score === null || score === undefined ? "Unavailable" : `${score.toFixed(0)}%`} /></span>} sub={score === null || score === undefined ? "No productive or distracting activity yet today" : data.change.score === null ? "vs yesterday: not available" : `${data.change.score >= 0 ? "+" : ""}${data.change.score.toFixed(0)} pts vs yesterday`} />
            <Stat label="Productive time" value={formatShort(c.productiveMs)} right={<div style={{ marginTop: 6 }}><Delta c={data.change.productive} lowerIsBetter={false} /></div>} />
            <Stat label="Distracting time" value={formatShort(c.distractingMs)} right={<div style={{ marginTop: 6 }}><Delta c={data.change.distracting} /></div>} />
            <Stat label="Neutral time" value={formatShort(c.neutralMs)} sub="not part of the score" />
          </div>
          <div style={{ height: 16 }} />
          <div className="grid g2" style={{ alignItems: "start" }}>
            <Card title="Daily goal">
              <div className="flex items-center justify-between gap-3" style={{ marginBottom: 8 }}>
                <div className="num" style={{ fontSize: "1.3rem", fontWeight: 650 }}><Tm ms={c.productiveMs} /> <span className="muted" style={{ fontSize: "0.9rem", fontWeight: 400 }}>of <Sl text={String(c.goal.hours)} />h productive time</span></div>
                <div className="num muted" data-testid="goal-pct"><Sl text={c.goal.pct === null ? "No goal set" : `${c.goal.pct.toFixed(0)}%`} /></div>
              </div>
              <ProgressBar pct={c.goal.pct ?? 0} color={c.goal.met ? "#6fcf97" : "var(--accent)"} label="Productive goal progress" />
              <div className="muted" style={{ fontSize: "0.85rem", marginTop: 8 }}><Sl text={c.goal.met ? "Goal reached. Nicely done." : c.goal.pct === null ? "Set a goal below." : `${formatShort(c.goal.remainingMs)} to go.`} /></div>
              <div className="flex items-center gap-3" style={{ marginTop: 14 }}>
                <label className="muted" style={{ fontSize: "0.85rem" }}>Goal (hours / day)</label>
                <input className="input" type="number" min={0} max={24} step={0.5} style={{ width: 90 }} value={settings.productivityGoalHours} onChange={(e) => update({ productivityGoalHours: Number(e.target.value) })} aria-label="Daily productive goal in hours" />
              </div>
            </Card>
            <Card title="How the score works">
              <div style={{ lineHeight: 1.6 }}>
                <div className="num" style={{ fontWeight: 600, marginBottom: 6 }}>Score = Productive ÷ (Productive + Distracting) × 100</div>
                <div className="muted" style={{ fontSize: "0.9rem" }}>Neutral time is left out of the calculation. If nothing today is classified as productive or distracting, the score is shown as Unavailable instead of 0%. Defaults come from each application&apos;s category; your own choices below always win and are kept across restarts.</div>
              </div>
            </Card>
          </div>
          <div style={{ height: 16 }} />
          <Card title="Application classification (today)" style={{ padding: 0 }}>
            {c.apps.length === 0 ? <Empty icon={<Target size={20} />} title="No application activity today" text="Applications you use will appear here so you can classify them." /> : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Application</th><th>Category</th><th style={{ textAlign: "right" }}>Today</th><th>Classification</th></tr></thead>
                  <tbody>
                    {c.apps.map((a) => (
                      <tr key={a.id}>
                        <td><div className="flex items-center gap-3"><AppIcon name={a.name} /><div><div style={{ fontWeight: 600 }}>{a.name}</div><div className="faint mono" style={{ fontSize: "0.8rem" }}>{a.exe}</div></div></div></td>
                        <td><CategoryBadge category={a.category} /></td>
                        <td className="num" style={{ textAlign: "right" }}><Tm ms={a.ms} /></td>
                        <td>
                          <Select className="select" value={a.overridden ? a.cls : "default"} onChange={(e) => setClass(a.id, e.target.value)} aria-label={`Classification for ${a.name}`}>
                            <option value="default">Default ({a.overridden ? "overridden" : a.cls})</option>
                            {CLS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
