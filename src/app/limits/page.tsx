"use client";

import { useState } from "react";
import { Gauge, Trash2 } from "lucide-react";
import { AppIcon, Card, Empty, ErrorBox, PageHeader, Skeleton, useFetch } from "@/components/ui";
import { ProgressBar, Sl, Tm } from "@/components/V2Parts";
import { Select } from "@/components/Select";
import { CATEGORIES } from "@/lib/identify";
import { formatShort } from "@/lib/time";
import type { Limit, LimitStatus } from "@/lib/v2/limits";

type Row = Limit & LimitStatus;
const COLOR = { ok: "var(--accent)", warn: "#e0b25a", reached: "#e5646f" } as const;

export default function LimitsPage() {
  const { data, error, loading, reload } = useFetch<{ day: string; limits: Row[] }>("/api/v2/limits", { refreshMs: 5000 });
  const apps = useFetch<{ apps: { id: string; name: string }[] }>("/api/apps?sort=alpha");
  const [kind, setKind] = useState<"app" | "category">("app");
  const [target, setTarget] = useState("");
  const [minutes, setMinutes] = useState(120);
  const [warn, setWarn] = useState(80);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setMsg(null);
    const t = target || (kind === "category" ? CATEGORIES[0] : apps.data?.apps[0]?.id ?? "");
    const r = await fetch("/api/v2/limits", { method: "POST", body: JSON.stringify({ id: editing ?? undefined, kind, target: t, dailyMinutes: minutes, warnPct: warn }) });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error ?? "Could not save the limit.");
    setEditing(null);
    setTarget("");
    reload();
  };
  const remove = async (id: string) => {
    await fetch(`/api/v2/limits?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    reload();
  };
  const edit = (l: Row) => {
    setEditing(l.id); setKind(l.kind); setTarget(l.target); setMinutes(l.dailyMinutes); setWarn(l.warnPct);
  };

  return (
    <div className="page">
      <PageHeader title="Limits" subtitle="Daily time limits for applications and categories. WatchTower only warns you: it never blocks or closes anything." />
      <Card title={editing ? "Edit limit" : "Add a limit"}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>
            Applies to
            <Select className="select" value={kind} onChange={(e) => { setKind(e.target.value as "app" | "category"); setTarget(""); }} aria-label="Limit type">
              <option value="app">An application</option>
              <option value="category">A category</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>
            {kind === "app" ? "Application" : "Category"}
            <Select className="select" value={target || (kind === "category" ? CATEGORIES[0] : apps.data?.apps[0]?.id ?? "")} onChange={(e) => setTarget(e.target.value)} aria-label="Limit target">
              {kind === "category" ? CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>) : (apps.data?.apps ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>
            Daily limit (minutes)
            <input className="input" type="number" min={1} max={1440} value={minutes} style={{ width: 120 }} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Daily limit minutes" />
          </label>
          <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>
            Warn at (%)
            <input className="input" type="number" min={10} max={99} value={warn} style={{ width: 100 }} onChange={(e) => setWarn(Number(e.target.value))} aria-label="Warning threshold percent" />
          </label>
          <button className="btn btn-primary" onClick={save}>{editing ? "Save changes" : "Add limit"}</button>
          {editing && <button className="btn" onClick={() => { setEditing(null); setTarget(""); }}>Cancel</button>}
        </div>
        {msg && <div style={{ color: "#e5646f", marginTop: 10, fontSize: "0.9rem" }} role="alert">{msg}</div>}
        <div className="muted" style={{ fontSize: "0.82rem", marginTop: 10 }}>You get one warning at the threshold and one notice when the limit is reached, once per day. Usage is real recorded foreground time and resets at local midnight.</div>
      </Card>
      <div style={{ height: 16 }} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Skeleton h={120} /> : data && data.limits.length === 0 ? (
        <Card><Empty icon={<Gauge size={20} />} title="No limits yet" text="Add a daily limit above, for example Google Chrome: 120 minutes." /></Card>
      ) : (
        <div className="flex flex-col gap-3" data-testid="limit-list">
          {data?.limits.map((l) => (
            <Card key={l.id}>
              <div className="flex items-center gap-3">
                <AppIcon name={l.targetName} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center justify-between gap-3">
                    <div style={{ fontWeight: 650 }}>{l.targetName} <span className="muted" style={{ fontWeight: 400 }}>· {l.kind === "app" ? "application" : "category"}</span></div>
                    <div className="num muted" style={{ fontSize: "0.9rem" }}><Tm ms={l.usedMs} /> of <Tm ms={l.limitMs} /></div>
                  </div>
                  <div style={{ margin: "8px 0 6px" }}><ProgressBar pct={l.pct} color={COLOR[l.state]} label={`${l.targetName} usage`} /></div>
                  <div className="muted" style={{ fontSize: "0.84rem" }}>
                    <Sl text={l.state === "reached" ? "Limit reached for today." : `${formatShort(l.remainingMs)} left today`} /> · warning at <Sl text={String(l.warnPct)} />%
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => edit(l)}>Edit</button>
                <button className="btn btn-sm" aria-label={`Remove limit for ${l.targetName}`} onClick={() => remove(l.id)}><Trash2 size={14} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
