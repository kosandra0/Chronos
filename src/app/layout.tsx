import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./fonts";
import "./globals.css";
import "./theme.css";
import "./watchtower.css";
import "./themes-extra.css";
import "./extras.css";
import { Providers } from "@/components/Providers";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "WatchTower · Overview",
  description: "WatchTower — Windows usage intelligence and screen time monitoring.",
};

// Applies cached appearance before first paint (avoids theme flash).
const bootScript = `(function(){try{var s=JSON.parse(localStorage.getItem('chronos.settings')||'{}');var d=document.documentElement;
var t=s.theme||'dark';if(t==='system')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
d.dataset.theme=t;if(t==='custom'){var cv=JSON.parse(localStorage.getItem('chronos.customvars')||'{}');for(var ck in cv){if(ck==='--scheme')d.style.colorScheme=cv[ck];else d.style.setProperty(ck,cv[ck]);}}d.dataset.accent=s.accent||'teal';d.dataset.density=s.density||'comfortable';d.dataset.font=s.font||'inter';
var off=s.animations===false||s.performanceMode==='performance'||matchMedia('(prefers-reduced-motion: reduce)').matches;
d.dataset.motion=off?'off':'on';d.dataset.transparency=(s.transparency!==false&&s.performanceMode!=='performance')?'on':'off';
d.dataset.speed=s.animSpeed||'normal';d.dataset.titlebar=s.titleBar||'windows';if(window.watchtower)d.dataset.desktop='true';d.dataset.shadow=s.shadow||'soft';if(s.fontSize)d.style.setProperty('--fs',s.fontSize+'px');if(typeof s.radius==='number')d.style.setProperty('--radius',s.radius+'px');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-accent="teal" data-motion="on" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
