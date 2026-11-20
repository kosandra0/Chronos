"use client";

import { AppWindow, BarChart3, History, LayoutDashboard, List, Pause, Play, Power, Settings, Trophy } from "lucide-react";
import { useLive, useLiveTotals, useSettings } from "@/components/Providers";
import { RollingTime } from "@/components/Rolling";
import { Logo3D } from "@/components/Logo3D";
import { getDesktop } from "@/lib/desktop";
import { APP_NAME } from "@/lib/settings-shared";

const LINKS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/statistics", label: "Statistics", icon: BarChart3 },
  { href: "/applications", label: "Applications", icon: AppWindow },
  { href: "/sessions", label: "Sessions", icon: List },
  { href: "/timeline", label: "Timeline", icon: History },
  { href: "/achievements", label: "Achievements", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Small rounded quick panel shown from the system tray icon. */
export default function TrayPanel() {
  const lt = useLiveTotals();
  const { data } = useLive();
  const { settings, update } = useSettings();
  const desk = getDesktop();
  const cur = data?.current;
  const paused = data?.status === "paused";
  return (
    <div className="tray-card">
      <div className="tray-head">
        <Logo3D size={34} variant={settings.logo} />
        <div>
          <div style={{ fontWeight: 650, letterSpacing: "0.1em" }}>{APP_NAME}</div>
          <div className="faint" style={{ fontSize: "0.78rem" }}>
            <span className={`dot ${paused ? "off" : data?.status === "tracking" ? "live" : "warn"}`} style={{ marginRight: 6 }} />
            {paused ? "Monitoring paused" : data?.status === "tracking" ? "Monitoring active" : "Waiting for monitor"}
          </div>
        </div>
      </div>
      <div className="tray-time">
        <div className="faint" style={{ fontSize: "0.7rem", letterSpacing: "0.1em" }}>TODAY</div>
        {lt ? <RollingTime ms={lt.totals.screen} style={{ fontSize: "2.1rem", fontWeight: 600 }} /> : <span className="muted">…</span>}
        <div className="muted truncate" style={{ fontSize: "0.82rem", marginTop: 4 }}>{cur ? `Now: ${cur.name}` : "No activity yet"}</div>
      </div>
      <div className="tray-links">
        {LINKS.map((l) => (
          <button key={l.href} className="tray-link" onClick={() => desk?.openMain(l.href)}>
            <l.icon size={15} /> {l.label}
          </button>
        ))}
      </div>
      <div className="tray-actions">
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => desk?.openMain("/")}>Open {APP_NAME}</button>
        <button className="btn" aria-label={paused ? "Resume monitoring" : "Pause monitoring"} title={paused ? "Resume monitoring" : "Pause monitoring"} onClick={() => update({ monitoringEnabled: !settings.monitoringEnabled })}>
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button className="btn" aria-label="Quit" title="Quit WatchTower" onClick={() => desk?.quit()}><Power size={15} /></button>
      </div>
    </div>
  );
}
