"use client";

import { useId, type ReactNode } from "react";
import { Trophy } from "lucide-react";
import { Odometer } from "./AnimText";

export type LevelInfo = { level: number; name: string; toNext: number; progress: number; currentFloor: number; nextAt: number };

/** Hexagon crest with a crown and laurels. Everything is drawn from theme variables, so it follows every theme. */
export function LevelBadge({ level, size = 92 }: { level: number; size?: number }) {
  const gid = useId().replace(/:/g, "");
  // seven leaves on each side, following an arc around the hexagon
  const leaves = Array.from({ length: 7 }, (_, i) => {
    const t = i / 6; // 0..1 from bottom to top
    const ang = (118 + t * 112) * (Math.PI / 180);
    return { x: 50 + Math.cos(ang) * 40, y: 56 + Math.sin(ang) * 40, rot: (ang * 180) / Math.PI + 90 };
  });
  return (
    <div className="lvx-badge" key={level} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--accent)" }} />
            <stop offset="1" style={{ stopColor: "color-mix(in srgb, var(--accent) 45%, #b9a2ff)" }} />
          </linearGradient>
        </defs>
        <g className="lvx-laurel" fill={`url(#${gid}-g)`}>
          {leaves.map((l, i) => (
            <g key={i}>
              <ellipse cx={l.x} cy={l.y} rx="2.2" ry="5" transform={`rotate(${l.rot - 90} ${l.x} ${l.y})`} />
              <ellipse cx={100 - l.x} cy={l.y} rx="2.2" ry="5" transform={`rotate(${-(l.rot - 90)} ${100 - l.x} ${l.y})`} />
            </g>
          ))}
        </g>
        <polygon className="lvx-hex" points="50,26 75.98,41 75.98,71 50,86 24.02,71 24.02,41" fill="color-mix(in srgb, var(--accent) 14%, var(--bg2, #10151b))" stroke={`url(#${gid}-g)`} strokeWidth="2.2" strokeLinejoin="round" />
        <polygon points="50,32 70.8,44 70.8,68 50,80 29.2,68 29.2,44" fill="none" stroke="color-mix(in srgb, var(--accent) 22%, transparent)" strokeWidth="0.8" />
        <path className="lvx-crown" d="M38 22 L41 12 L46 18 L50 9 L54 18 L59 12 L62 22 Z" fill={`url(#${gid}-g)`} />
      </svg>
      <div className="lvx-badge-txt">
        <span className="lvx-lvl">LEVEL</span>
        <Odometer text={String(level)} className="lvx-num" />
      </div>
    </div>
  );
}

type Props = {
  variant: "compact" | "full";
  level: LevelInfo;
  xp: number;
  /** Compact only: achievements unlocked / total. */
  achievements?: { unlocked: number; total: number };
  /** Full only: extra facts shown on the right (icon + text). */
  facts?: { icon: ReactNode; text: string }[];
  /** Full only: a row below the card body (the notification switch). */
  footer?: ReactNode;
};

/**
 * One level / XP card used by the Overview (compact) and the Achievements page (full).
 * The data, XP maths and progress are exactly what the pages already computed; only the presentation is shared.
 */
export function LevelPanel({ variant, level: l, xp, achievements, facts, footer }: Props) {
  const full = variant === "full";
  return (
    <section className={`lvx lvx-${variant}`} aria-label={`Level ${l.level}, ${l.name}`} data-testid={`level-panel-${variant}`}>
      <div className="lvx-row">
        <LevelBadge level={l.level} size={full ? 104 : 92} />
        <div className="lvx-div" aria-hidden />
        <div className="lvx-main">
          <div className="lvx-name"><Trophy size={full ? 18 : 16} style={{ color: "var(--accent)" }} /> {l.name}</div>
          <div className="lvx-xp muted">
            <Odometer text={`${xp} XP`} /> {full ? "total" : ""} · <Odometer text={`${l.toNext}`} /> XP to level {l.level + 1}
          </div>
          <div className="lvx-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(l.progress * 100)} aria-label="Progress to the next level">
            <i style={{ width: `${Math.max(2, l.progress * 100)}%` }} />
          </div>
          <div className="lvx-foot faint">
            <span>{l.currentFloor.toLocaleString()} XP</span>
            {!full && achievements && <span><Odometer text={`${achievements.unlocked}`} /> / {achievements.total} achievements</span>}
            <span>{l.nextAt.toLocaleString()} XP</span>
          </div>
        </div>
        {full && facts && (
          <>
            <div className="lvx-div" aria-hidden />
            <ul className="lvx-facts">
              {facts.map((f, i) => (
                <li key={i}><span className="lvx-fi">{f.icon}</span><Odometer text={f.text} style={{ fontSize: "inherit" }} /></li>
              ))}
            </ul>
          </>
        )}
      </div>
      {full && footer && <div className="lvx-footer">{footer}</div>}
    </section>
  );
}
