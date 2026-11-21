"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Minus, Square, Copy, X } from "lucide-react";
import { useDesktop } from "@/lib/desktop";
import { APP_NAME, NAV } from "@/lib/settings-shared";
import { useSettings } from "./Providers";
import { WatchTowerMark } from "./Logo3D";

const DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;

function ResizeHandles() {
  const desk = useDesktop();
  if (!desk) return null;
  return (
    <>
      {DIRS.map((d) => (
        <div
          key={d}
          className={`rz rz-${d}`}
          onPointerDown={(e) => {
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            desk.resizeStart(d);
          }}
          onPointerUp={() => desk.resizeEnd()}
          onPointerCancel={() => desk.resizeEnd()}
        />
      ))}
    </>
  );
}

/**
 * Custom window chrome for the frameless, rounded WatchTower window. Five selectable styles.
 * Renders nothing in a plain browser.
 */
export function TitleBar() {
  const desk = useDesktop();
  const { settings } = useSettings();
  const pathname = usePathname();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!desk) return;
    void desk.isMaximized().then(setMaximized);
    return desk.onMaximized(setMaximized);
  }, [desk]);

  if (!desk) return null;
  const item = [...NAV].reverse().find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)));
  const title = item?.label ?? "Overview";
  const style = settings.titleBar;

  const Min = <button className="tb-btn tb-min" aria-label="Minimize" onClick={() => desk.minimize()}><Minus size={14} /></button>;
  const Max = <button className="tb-btn tb-max" aria-label={maximized ? "Restore" : "Maximize"} onClick={() => desk.toggleMaximize()}>{maximized ? <Copy size={12} /> : <Square size={12} />}</button>;
  const Close = <button className="tb-btn tb-close" aria-label="Close" onClick={() => desk.close()}><X size={15} /></button>;

  let bar: React.ReactNode;
  if (style === "mac") {
    bar = (
      <div className="tb tb-mac">
        <div className="tb-lights">
          <button className="light red" aria-label="Close" onClick={() => desk.close()}><X size={9} strokeWidth={3} /></button>
          <button className="light yellow" aria-label="Minimize" onClick={() => desk.minimize()}><Minus size={9} strokeWidth={3} /></button>
          <button className="light green" aria-label={maximized ? "Restore" : "Maximize"} onClick={() => desk.toggleMaximize()}><Square size={7} strokeWidth={3} /></button>
        </div>
        <div className="tb-title center">{APP_NAME} <span className="faint">·</span> {title}</div>
        <div style={{ width: 62 }} />
      </div>
    );
  } else if (style === "minimal") {
    bar = (
      <div className="tb tb-minimal">
        <div className="tb-title faint">{APP_NAME}</div>
        <div className="tb-dots">
          <button className="dot-btn" aria-label="Minimize" onClick={() => desk.minimize()} />
          <button className="dot-btn" aria-label={maximized ? "Restore" : "Maximize"} onClick={() => desk.toggleMaximize()} />
          <button className="dot-btn close" aria-label="Close" onClick={() => desk.close()} />
        </div>
      </div>
    );
  } else if (style === "floating") {
    bar = (
      <div className="tb tb-floating">
        <div className="tb-drag" />
        <div className="tb-pill">{Min}{Max}{Close}</div>
      </div>
    );
  } else if (style === "classic") {
    bar = (
      <div className="tb tb-classic">
        <div className="tb-left"><WatchTowerMark size={18} variant={settings.logo} /></div>
        <div className="tb-title center">{APP_NAME} <span className="faint">·</span> {title}</div>
        <div className="tb-soft">{Min}{Max}{Close}</div>
      </div>
    );
  } else {
    bar = (
      <div className="tb tb-windows">
        <div className="tb-title"><WatchTowerMark size={16} variant={settings.logo} /> <span>{APP_NAME}</span> <span className="faint">·</span> <span className="faint">{title}</span></div>
        <div className="tb-ctrls">{Min}{Max}{Close}</div>
      </div>
    );
  }
  return (
    <>
      {bar}
      {!maximized && <ResizeHandles />}
    </>
  );
}
