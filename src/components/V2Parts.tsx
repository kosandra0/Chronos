"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Card, ErrorBox, Skeleton, useFetch } from "@/components/ui";
import { formatHMS, formatShort } from "@/lib/time";
import { Odometer } from "@/components/AnimText";
import { RangePicker, useRangeState } from "@/components/RangePicker";

export type Cmp = { current: number; previous: number; diff: number; pct: number | null; direction: "up" | "down" | "same" };

/** A duration like "1h 17m" whose digits slide up as it appears and whenever it changes. */
export function Tm({ ms }: { ms: number }) {
  return <Odometer text={formatShort(ms)} />;
}
/** Plain text with sliding digits (numbers inside slide up; other characters stay put). */
export const Sl = ({ text }: { text: string }) => <Odometer text={text} />;

export function ProgressBar({ pct, color = "var(--accent)", height = 10, label }: { pct: number; color?: string; height?: number; label?: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label} style={{ height, borderRadius: 999, background: "var(--hover)", overflow: "hidden" }}>
      <div style={{ width: `${v}%`, height: "100%", background: color, borderRadius: 999, transition: "width .5s ease" }} />
    </div>
  );
}

/** Signed time difference with an arrow. `lowerIsBetter` flips the colour (less screen time = good). */
export function Delta({ c, lowerIsBetter = true, style }: { c: Cmp; lowerIsBetter?: boolean; style?: CSSProperties }) {
  const good = c.direction === "same" ? null : (c.direction === "down") === lowerIsBetter;
  const color = good === null ? "var(--text3)" : good ? "#6fcf97" : "#e5646f";
  const Icon = c.direction === "up" ? ArrowUpRight : c.direction === "down" ? ArrowDownRight : Minus;
  const sign = c.diff > 0 ? "+" : c.diff < 0 ? "-" : "";
  const pct = c.pct === null ? "new" : `${c.pct >= 0 ? "+" : "-"}${Math.abs(c.pct).toFixed(c.pct === 0 ? 0 : 1)}%`;
  return (
    <span className="num" style={{ color, display: "inline-flex", alignItems: "center", gap: 4, ...style }} title={`${formatHMS(c.previous)} → ${formatHMS(c.current)}`}>
      <Icon size={14} />
      <Odometer text={`${sign}${formatShort(Math.abs(c.diff))}`} /> <span style={{ opacity: 0.85 }}>(<Odometer text={pct} />)</span>
    </span>
  );
}

export function Stat({ label, value, sub, right }: { label: string; value: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <Card hover>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: "1.4rem" }}>{typeof value === "string" ? <Odometer text={value} /> : value}</div>
      {sub && <div className="stat-sub">{typeof sub === "string" ? <Odometer text={sub} /> : sub}</div>}
      {right}
    </Card>
  );
}

type CompareResult = {
  kind: "week" | "month";
  current: { from: string; to: string };
  previous: { from: string; to: string };
  total: Cmp;
  productive: Cmp;
  distracting: Cmp;
  apps: ({ id: string; name: string } & Cmp)[];
  categories: ({ category: string } & Cmp)[];
};

/** Compare this week with last week, or this month with last month. Calendar boundaries come from the shared period code. */
export function CompareView({ kind, compact = false }: { kind: "week" | "month"; compact?: boolean }) {
  const { data, error, reload } = useFetch<CompareResult>(`/api/v2/compare?kind=${kind}`, { refreshMs: 5000 });
  const label = kind === "week" ? ["This week", "Last week"] : ["This month", "Last month"];
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Skeleton h={160} />;
  return (
    <div className="flex flex-col gap-4" data-testid="compare-view">
      <div className="grid g3">
        <Card>
          <div className="stat-label">Total screen time</div>
          <div className="stat-value" style={{ fontSize: "1.3rem" }}><Tm ms={data.total.current} /></div>
          <div className="muted" style={{ fontSize: "0.85rem" }}>{label[0]} ({data.current.from} → {data.current.to})</div>
          <div className="muted" style={{ fontSize: "0.85rem", marginTop: 6 }}>{label[1]}: <Tm ms={data.total.previous} /></div>
          <div style={{ marginTop: 8 }} data-testid="compare-total"><Delta c={data.total} /></div>
        </Card>
        <Card>
          <div className="stat-label">Productive time</div>
          <div className="stat-value" style={{ fontSize: "1.3rem" }}><Tm ms={data.productive.current} /></div>
          <div className="muted" style={{ fontSize: "0.85rem" }}>{label[1]}: <Tm ms={data.productive.previous} /></div>
          <div style={{ marginTop: 8 }}><Delta c={data.productive} lowerIsBetter={false} /></div>
        </Card>
        <Card>
          <div className="stat-label">Distracting time</div>
          <div className="stat-value" style={{ fontSize: "1.3rem" }}><Tm ms={data.distracting.current} /></div>
          <div className="muted" style={{ fontSize: "0.85rem" }}>{label[1]}: <Tm ms={data.distracting.previous} /></div>
          <div style={{ marginTop: 8 }}><Delta c={data.distracting} /></div>
        </Card>
      </div>
      <div className={compact ? "" : "grid g2"} style={compact ? { display: "grid", gap: 16 } : undefined}>
        <Card title="Application changes">
          {data.apps.length === 0 ? <div className="muted">No application activity in either period.</div> : data.apps.slice(0, compact ? 6 : 10).map((a) => (
            <div key={a.id} className="set-row" style={{ padding: "8px 0" }}>
              <div style={{ fontWeight: 600 }}>{a.name}</div>
              <Delta c={a} />
            </div>
          ))}
        </Card>
        <Card title="Category changes">
          {data.categories.length === 0 ? <div className="muted">No category activity in either period.</div> : data.categories.map((c) => (
            <div key={c.category} className="set-row" style={{ padding: "8px 0" }}>
              <div style={{ fontWeight: 600 }}>{c.category}</div>
              <Delta c={c} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

export { RangePicker, useRangeState };
