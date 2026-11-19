"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Activity, AppWindow, Clock3, Lightbulb, Monitor, Moon, Plug, Sparkles, Timer } from "lucide-react";
import { useLive, useLiveTotals, useSettings } from "@/components/Providers";
import { RollingTime } from "@/components/Rolling";
import { Card, Empty, ErrorBox, PageHeader, Skeleton, AppIcon, CategoryBadge, paletteAt, useFetch } from "@/components/ui";
import { DonutChart, MsBars, type Slice } from "@/components/Charts";
import { DayTimeline, sessionColor } from "@/components/DayTimeline";
import { CATEGORY_COLORS } from "@/lib/identify";
import { formatDetailed, formatHMSLabel, formatPct, formatShort, fmtTime } from "@/lib/time";
import { ymd } from "@/lib/ranges";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Stat({ icon, label, children, sub }: { icon: React.ReactNode; label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card hover>
      <div className="stat-label">
        {icon}
        {label}
      </div>
      <div className="stat-value">{children}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </Card>
  );
}

type SelfResp = { tracked: boolean; periods?: Record<string, number>; sessions?: number; avgMs?: number | null; longestMs?: number | null };

export default function OverviewPage() {
  const { error, reload } = useLive();
  const lt = useLiveTotals();
  const { settings } = useSettings();
  const today = ymd(new Date());
  const self = useFetch<SelfResp>(`/api/self?today=${today}`, { refreshMs: 15000 });
  const snapshot = lt?.data;
  const stamp = snapshot?.serverNow;

  const donut = useMemo<Slice[]>(() => {
    if (!snapshot) return [];
    const t = snapshot.today;
    const top = t.apps.slice(0, 6).map((a, i) => ({ name: a.name, ms: a.ms, color: paletteAt(i) }));
    const rest = t.apps.slice(6).reduce((n, a) => n + a.ms, 0);
    if (rest > 0) top.push({ name: "Other apps", ms: rest, color: CATEGORY_COLORS.Other });
    if (t.totals.desktop > 0) top.push({ name: "Desktop", ms: t.totals.desktop, color: CATEGORY_COLORS.Desktop });
    return top;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);
  const hours = useMemo(() => snapshot?.today.byHour.map((h) => ({ label: String(h.hour).padStart(2, "0"), value: h.total })) ?? [], [snapshot, stamp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !lt) return <div className="page"><ErrorBox message={`Cannot reach the Chronos engine: ${error}`} onRetry={reload} /></div>;
  if (!lt) {
    return (
      <div className="page">
        <Skeleton h={34} w={280} />
        <div className="grid g4" style={{ marginTop: 24 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={120} />)}
        </div>
      </div>
    );
  }

  const { data, totals, apps } = lt;
  const t = data.today;
  const top = apps[0];
  const cur = data.current;
  const hasToday = t.sessions.count > 0;
  const statusDot = data.status === "tracking" ? "live" : data.status === "paused" ? "off" : "warn";
  const statusLabel = data.status === "tracking" ? "Monitoring active" : data.status === "paused" ? "Monitoring paused" : "Waiting for monitor";

  return (
    <div className="page">
      <PageHeader
        title={`${greeting()}`}
        subtitle={new Date().toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        actions={
          <>
            <span className="badge"><span className={`dot ${statusDot}`} />{statusLabel}</span>
            {cur && (
              <span className="badge" title={cur.limited ? "Process details are limited by Windows permissions" : undefined}>
                <Monitor size={13} />
                {cur.name}
                {cur.limited ? " · limited" : ""}
              </span>
            )}
            <span className="badge"><Plug size={13} />{data.agent.active ? "Windows agent connected" : "Self-tracking only"}</span>
          </>
        }
      />

      {!data.agent.active && (
        <div className="notice" style={{ marginBottom: 16 }}>
          The native Windows monitoring agent is not connected, so Chronos can only record its own usage while this window is focused. Download and start the agent from{" "}
          <Link href="/settings?tab=monitoring" style={{ color: "var(--accent)", fontWeight: 600 }}>Settings → Monitoring</Link> to record every foreground application.
        </div>
      )}

      <div className="grid g4">
        <Card className="span2" hover style={{ position: "relative", overflow: "hidden" }}>
          <div className="stat-label">
            <Clock3 size={14} /> Total screen time
            {data.status === "tracking" && <span className="dot live" title="Live" />}
          </div>
          <div title={formatDetailed(totals.screen)}>
            <RollingTime ms={totals.screen} style={{ fontSize: "3.2rem", fontWeight: 600, letterSpacing: "-0.02em" }} />
          </div>
          <div className="stat-sub">Today · {settings.idleInTotal ? "includes idle time" : "active time only (idle excluded)"}</div>
        </Card>
        <Stat icon={<Activity size={14} />} label="Active usage" sub={`${formatPct(totals.active, Math.max(1, totals.active + totals.idle))} of tracked time`}>
          <span title={formatDetailed(totals.active)}><RollingTime ms={totals.active} style={{ fontSize: "1.7rem" }} /></span>
        </Stat>
        {settings.showIdle ? (
          <Stat icon={<Moon size={14} />} label="Idle time" sub={`${t.idle.count} idle session${t.idle.count === 1 ? "" : "s"}${t.idle.longestMs ? ` · longest ${formatShort(t.idle.longestMs)}` : ""}`}>
            <span title={formatDetailed(totals.idle)}><RollingTime ms={totals.idle} style={{ fontSize: "1.7rem" }} /></span>
          </Stat>
        ) : (
          <Stat icon={<Timer size={14} />} label="Longest session" sub={t.sessions.longest?.app ?? "no sessions yet"}>
            {t.sessions.longest ? formatShort(t.sessions.longest.ms) : "—"}
          </Stat>
        )}
        <Stat icon={<AppWindow size={14} />} label="Applications used" sub="unique foreground apps today">
          {t.uniqueApps}
        </Stat>
        <Stat icon={<Activity size={14} />} label="Sessions" sub={t.sessions.avgMs ? `avg ${formatShort(t.sessions.avgMs)} per session` : "no sessions yet"}>
          {t.sessions.count}
        </Stat>
        <Stat icon={<Timer size={14} />} label="Desktop usage" sub="not counted as an application">
          <RollingTime ms={totals.desktop} style={{ fontSize: "1.7rem" }} />
        </Stat>
        <Card hover>
          <div className="stat-label"><Sparkles size={14} /> Most used application</div>
          {top ? (
            <div className="flex items-center gap-3">
              <AppIcon name={top.name} size={38} />
              <div className="min-w-0">
                <div className="truncate" style={{ fontWeight: 600 }}>{top.name}</div>
                <div className="muted num" style={{ fontSize: "0.88rem" }}>{formatHMSLabel(top.ms)} · {formatPct(top.ms, totals.active)}</div>
              </div>
            </div>
          ) : (
            <div className="muted">No application used yet today.</div>
          )}
        </Card>
      </div>

      <div className="grid g3" style={{ marginTop: "var(--gap)" }}>
        <Card title="Application distribution">
          {donut.length ? (
            <>
              <DonutChart data={donut} total={t.totals.active} label="active today" />
              <div className="flex flex-col gap-2" style={{ marginTop: 10 }}>
                {donut.slice(0, 5).map((d) => (
                  <div key={d.name} className="flex items-center gap-2" style={{ fontSize: "0.9rem" }}>
                    <span className="dot" style={{ background: d.color }} />
                    <span className="truncate" style={{ flex: 1 }}>{d.name}</span>
                    <span className="muted num">{formatPct(d.ms, t.totals.active)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <Empty title="No activity recorded yet" text="Your application distribution will appear here once Chronos records foreground usage." />
          )}
        </Card>
        <Card title="Usage by hour" className="span2">
          {t.totals.screen > 0 ? <MsBars data={hours} height={250} /> : <Empty title="No hourly data yet" text="Hourly usage is generated from today's recorded sessions." />}
        </Card>
      </div>

      <Card title="Activity timeline · today" style={{ marginTop: "var(--gap)" }} right={<Link href="/timeline" className="muted" style={{ textTransform: "none", letterSpacing: 0 }}>Open timeline →</Link>}>
        <DayTimeline date={today} refreshMs={10000} />
      </Card>

      <div className="grid g3" style={{ marginTop: "var(--gap)" }}>
        <Card title="Recent activity" className="span2">
          {data.recent.length ? (
            data.recent.map((s) => (
              <div key={s.id} className="list-row">
                <AppIcon name={s.name} size={30} special={s.type === "app" ? undefined : (s.type as "desktop" | "idle" | "locked")} />
                <div className="min-w-0" style={{ flex: 1 }}>
                  <div className="truncate" style={{ fontWeight: 550 }}>{s.name}</div>
                  <div className="muted num" style={{ fontSize: "0.82rem" }}>{fmtTime(s.start)} – {s.open ? "now" : fmtTime(s.end)}</div>
                </div>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: sessionColor(s) }} />
                <CategoryBadge category={s.category} />
                <span className="num" style={{ width: 70, textAlign: "right" }}>{formatShort(s.durationMs)}</span>
              </div>
            ))
          ) : (
            <Empty title="No activity recorded yet" text="Your application history will appear here." />
          )}
        </Card>
        <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
          <Card title="Usage insights">
            {t.insights.length ? (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }} className="flex flex-col gap-3">
                {t.insights.map((i) => (
                  <li key={i} className="flex gap-2" style={{ lineHeight: 1.45 }}>
                    <Lightbulb size={15} style={{ color: "var(--accent)", flex: "none", marginTop: 3 }} />
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Not enough data to generate insights" text={hasToday ? "Insights appear after about a minute of recorded activity." : "Insights are generated from your real activity today."} icon={<Lightbulb size={20} />} />
            )}
          </Card>
          <Card title="Chronos usage">
            {self.data?.tracked && self.data.periods ? (
              <div className="flex flex-col gap-2" style={{ fontSize: "0.92rem" }}>
                {([["Today", self.data.periods.today], ["This week", self.data.periods.week], ["This month", self.data.periods.month], ["Lifetime", self.data.periods.lifetime]] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="muted">{k}</span><span className="num">{formatShort(v)}</span></div>
                ))}
                <div className="flex justify-between"><span className="muted">Sessions</span><span className="num">{self.data.sessions}</span></div>
                <div className="flex justify-between"><span className="muted">Average / longest</span><span className="num">{self.data.avgMs ? formatShort(self.data.avgMs) : "—"} / {self.data.longestMs ? formatShort(self.data.longestMs) : "—"}</span></div>
              </div>
            ) : (
              <div className="muted" style={{ lineHeight: 1.5 }}>Chronos records its own foreground time separately, under “Chronos”. It will appear after the first focused session.</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
