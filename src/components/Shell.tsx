"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AppWindow, BarChart3, Grid3x3, History, LayoutDashboard, List, PanelLeftClose, PanelLeftOpen, ScrollText, Settings, Trophy } from "lucide-react";
import { NAV } from "@/lib/settings-shared";
import { APP_VERSION } from "@/lib/changelog";
import { useLive, useSettings } from "./Providers";
import { ChangelogModal } from "./Changelog";

const ICONS = {
  overview: LayoutDashboard,
  statistics: BarChart3,
  heatmap: Grid3x3,
  applications: AppWindow,
  sessions: List,
  timeline: History,
  achievements: Trophy,
  settings: Settings,
} as const;

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="Chronos logo" role="img">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="color-mix(in srgb, var(--accent) 16%, transparent)" stroke="var(--accent)" strokeOpacity="0.5" />
      <circle cx="16" cy="16" r="8.2" fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="38 14" strokeLinecap="round" />
      <path d="M16 11.5V16l3 2" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { settings, ready, update, motion: m } = useSettings();
  const { data, error } = useLive();
  const [logOpen, setLogOpen] = useState(false);
  const collapsed = settings.sidebarCollapsed;

  useEffect(() => {
    const item = [...NAV].reverse().find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));
    document.title = `Chronos · ${item?.label ?? "Overview"}`;
  }, [pathname]);

  // Default landing page (applied once per browser session).
  useEffect(() => {
    if (!ready || pathname !== "/" || settings.landing === "/") return;
    if (sessionStorage.getItem("chronos.landed")) return;
    sessionStorage.setItem("chronos.landed", "1");
    router.replace(settings.landing);
  }, [ready, pathname, settings.landing, router]);

  const status = error && !data ? "off" : data?.status === "tracking" ? "live" : data?.status === "paused" ? "off" : "warn";
  const statusText = error && !data ? "Engine unreachable" : data?.status === "tracking" ? "Monitoring active" : data?.status === "paused" ? "Monitoring paused" : "Waiting for monitor";

  return (
    <div className="shell">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="brand">
          <Logo />
          <span className="brand-name">CHRONOS</span>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map((n) => {
            const Icon = ICONS[n.icon];
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`nav-item ${active ? "active" : ""}`} data-tip={n.label} aria-current={active ? "page" : undefined}>
                <Icon size={18} />
                <span className="label">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div style={{ flex: 1 }} />
        <button className="nav-item" data-tip="Update Logs" onClick={() => setLogOpen(true)}>
          <ScrollText size={18} />
          <span className="label">Update Logs</span>
        </button>
        <button className="nav-item" data-tip={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => update({ sidebarCollapsed: !collapsed })}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          <span className="label">Collapse</span>
        </button>
        <div className="nav-item tip" data-tip={`${statusText} · v${APP_VERSION}`} style={{ cursor: "default", height: "auto", padding: collapsed ? "10px 0" : "10px 12px", marginTop: 6 }}>
          <span className={`dot ${status}`} />
          <span className="label" style={{ fontSize: "0.82rem" }}>
            <span style={{ color: "var(--text)", display: "block" }}>{statusText}</span>
            <span className="faint">v{APP_VERSION}</span>
          </span>
        </div>
      </aside>
      <main className="main">
        <motion.div key={pathname} initial={m.page ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
          {children}
        </motion.div>
      </main>
      <ChangelogModal open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}
