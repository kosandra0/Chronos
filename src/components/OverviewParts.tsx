"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { fireEvent } from "@/lib/events";
import { Card, Skeleton, useFetch } from "./ui";
import { useSettings } from "./Providers";
import { Odometer } from "./AnimText";

/** The blank dash after the greeting: type your name and it is saved. */
export function NameField() {
  const { settings, update } = useSettings();
  const [v, setV] = useState(settings.userName);
  useEffect(() => setV(settings.userName), [settings.userName]);
  const commit = () => {
    const t = v.trim();
    if (t !== settings.userName) {
      void update({ userName: t });
      if (t) fireEvent("set_name");
    }
  };
  return (
    <input
      className="name-input"
      value={v}
      maxLength={40}
      placeholder="your name"
      aria-label="Your name"
      size={Math.max(9, v.length + 1)}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

type Prog = {
  level: { level: number; name: string; toNext: number; progress: number; currentFloor: number; nextAt: number };
  xp: number;
  achievements: { id: string; unlockedAt: string | null }[];
};

/** Compact level and XP summary shown at the top of the Overview. */
export function LevelCard() {
  const { data } = useFetch<Prog>("/api/achievements", { refreshMs: 20000 });
  if (!data) return <Skeleton h={118} />;
  const l = data.level;
  const unlocked = data.achievements.filter((a) => a.unlockedAt).length;
  return (
    <Card hover>
      <div className="lvl">
        <div className="lvl-badge" key={l.level}>
          <span className="faint" style={{ fontSize: "0.6rem", letterSpacing: "0.12em" }}>LEVEL</span>
          <Odometer text={String(l.level)} className="lvl-num" />
        </div>
        <div className="lvl-main">
          <div className="lvl-name"><Trophy size={15} style={{ color: "var(--accent)" }} /> {l.name}</div>
          <div className="muted lvl-xp"><Odometer text={`${data.xp} XP`} /> · <Odometer text={`${l.toNext}`} /> XP to level {l.level + 1}</div>
          <div className="progress" style={{ marginTop: 10 }}><i style={{ width: `${Math.max(2, l.progress * 100)}%` }} /></div>
          <div className="lvl-foot faint"><span>{l.currentFloor} XP</span><span><Odometer text={`${unlocked}`} /> / {data.achievements.length} achievements</span><span>{l.nextAt} XP</span></div>
        </div>
      </div>
    </Card>
  );
}
