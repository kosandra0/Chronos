"use client";

import { useEffect, useState } from "react";
import { fireEvent } from "@/lib/events";
import { Skeleton, useFetch } from "./ui";
import { useSettings } from "./Providers";
import { LevelPanel } from "./LevelPanel";

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

/** Compact level and XP summary shown at the top of the Overview (shares its design with the Achievements card). */
export function LevelCard() {
  const { data } = useFetch<Prog>("/api/achievements", { refreshMs: 20000 });
  if (!data) return <Skeleton h={118} />;
  const unlocked = data.achievements.filter((a) => a.unlockedAt).length;
  return <LevelPanel variant="compact" level={data.level} xp={data.xp} achievements={{ unlocked, total: data.achievements.length }} />;
}
