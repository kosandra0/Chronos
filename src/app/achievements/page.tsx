"use client";

import { useEffect } from "react";
import { Award, Check, Lock } from "lucide-react";
import { Card, ErrorBox, PageHeader, Skeleton, Switch, useFetch } from "@/components/ui";
import { useSettings } from "@/components/Providers";
import { fmtDateTime, formatShort } from "@/lib/time";

type Prog = {
  level: { level: number; name: string; xp: number; currentFloor: number; nextAt: number; progress: number; toNext: number };
  xp: number;
  achievements: { id: string; title: string; description: string; xp: number; unlockedAt: string | null }[];
  stats: { sessions: number; apps: number; usageDays: number; streak: number; totalMs: number };
};

export default function AchievementsPage() {
  const { data, error, reload } = useFetch<Prog>("/api/achievements", { refreshMs: 30000 });
  const { settings, update } = useSettings();
  useEffect(() => { reload(); }, [reload]);

  if (error && !data) return <div className="page"><ErrorBox message={error} onRetry={reload} /></div>;
  if (!data) return <div className="page"><Skeleton h={180} /></div>;
  const unlocked = data.achievements.filter((a) => a.unlockedAt).sort((a, b) => (b.unlockedAt! > a.unlockedAt! ? 1 : -1));
  const locked = data.achievements.filter((a) => !a.unlockedAt);
  const l = data.level;

  return (
    <div className="page">
      <PageHeader title="Achievements" subtitle="Quiet milestones for understanding your habits. XP is finite — leaving the computer running earns nothing." />
      <Card style={{ marginBottom: "var(--gap)" }}>
        <div className="flex flex-wrap items-center gap-6">
          <div key={l.level} className="unlock" style={{ width: 84, height: 84, borderRadius: 24, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--accent) 16%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 50%, transparent)" }}>
            <div style={{ textAlign: "center" }}>
              <div className="faint" style={{ fontSize: "0.65rem", letterSpacing: "0.12em" }}>LEVEL</div>
              <div className="num" style={{ fontSize: "2rem", fontWeight: 650, lineHeight: 1, color: "var(--accent)" }}>{l.level}</div>
            </div>
          </div>
          <div style={{ flex: "1 1 280px" }}>
            <div style={{ fontSize: "1.35rem", fontWeight: 650 }}>{l.name}</div>
            <div className="muted num" style={{ margin: "4px 0 12px" }}>{data.xp} XP total · {l.toNext} XP to level {l.level + 1}</div>
            <div className="progress"><i style={{ width: `${Math.round(l.progress * 100)}%` }} /></div>
            <div className="flex justify-between faint num" style={{ fontSize: "0.78rem", marginTop: 6 }}><span>{l.currentFloor} XP</span><span>{l.nextAt} XP</span></div>
          </div>
          <div className="muted" style={{ fontSize: "0.88rem", lineHeight: 1.7 }}>
            <div>{data.stats.sessions} sessions · {data.stats.apps} apps</div>
            <div>{data.stats.usageDays} usage days · {data.stats.streak}-day best streak</div>
            <div>{formatShort(data.stats.totalMs)} active recorded</div>
          </div>
        </div>
        <div className="set-row" style={{ marginTop: 14, borderTop: "1px solid var(--border)", borderBottom: 0 }}>
          <div><div className="t">Gamification notifications</div><div className="d">Show a quiet toast when an achievement unlocks or you reach a new level.</div></div>
          <Switch on={settings.gamificationNotify} onChange={(v) => update({ gamificationNotify: v })} label="Gamification notifications" />
        </div>
      </Card>
      <div className="grid g2">
        <Card title={`Recent achievements · ${unlocked.length}`}>
          {unlocked.length ? unlocked.map((a) => (
            <div key={a.id} className="list-row">
              <div className="t-ico" style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }}><Award size={17} /></div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{a.title}</div><div className="muted" style={{ fontSize: "0.85rem" }}>{a.description}</div><div className="faint" style={{ fontSize: "0.78rem" }}>{fmtDateTime(a.unlockedAt!)}</div></div>
              <span className="badge" style={{ color: "var(--accent)" }}><Check size={12} /> +{a.xp} XP</span>
            </div>
          )) : <div className="muted" style={{ padding: "12px 0" }}>No achievements yet. Your first one unlocks after your first recorded session.</div>}
        </Card>
        <Card title={`Still to unlock · ${locked.length}`}>
          {locked.length ? locked.map((a) => (
            <div key={a.id} className="list-row" style={{ opacity: 0.8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--hover)", color: "var(--text3)" }}><Lock size={15} /></div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{a.title}</div><div className="muted" style={{ fontSize: "0.85rem" }}>{a.description}</div></div>
              <span className="badge">+{a.xp} XP</span>
            </div>
          )) : <div className="muted">Everything unlocked — well done.</div>}
        </Card>
      </div>
    </div>
  );
}
