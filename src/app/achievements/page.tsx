"use client";

import { useEffect } from "react";
import { Award, BarChart3, CalendarDays, Check, Clock, Lock } from "lucide-react";
import { Card, ErrorBox, PageHeader, Skeleton, Switch, useFetch } from "@/components/ui";
import { useSettings } from "@/components/Providers";
import { LevelPanel } from "@/components/LevelPanel";
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
      <div style={{ marginBottom: "var(--gap)" }}>
        <LevelPanel
          variant="full"
          level={l}
          xp={data.xp}
          facts={[
            { icon: <BarChart3 size={17} />, text: `${data.stats.sessions.toLocaleString()} sessions · ${data.stats.apps} apps` },
            { icon: <CalendarDays size={17} />, text: `${data.stats.usageDays} usage days · ${data.stats.streak}-day best streak` },
            { icon: <Clock size={17} />, text: `${formatShort(data.stats.totalMs)} active recorded` },
          ]}
          footer={
            <div className="set-row">
              <div><div className="t">Gamification notifications</div><div className="d">Show a quiet toast when an achievement unlocks or you reach a new level.</div></div>
              <Switch on={settings.gamificationNotify} onChange={(v) => update({ gamificationNotify: v })} label="Gamification notifications" />
            </div>
          }
        />
      </div>
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
