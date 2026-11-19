import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Chronos · Overview",
  description: "Chronos — Windows usage intelligence and screen time monitoring.",
};

// Applies cached appearance before first paint (avoids theme flash).
const bootScript = `(function(){try{var s=JSON.parse(localStorage.getItem('chronos.settings')||'{}');var d=document.documentElement;
var t=s.theme||'dark';if(t==='system')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
d.dataset.theme=t;d.dataset.accent=s.accent||'teal';d.dataset.density=s.density||'comfortable';d.dataset.font=s.font||'inter';
var off=s.animations===false||s.performanceMode==='performance'||matchMedia('(prefers-reduced-motion: reduce)').matches;
d.dataset.motion=off?'off':'on';d.dataset.transparency=(s.transparency!==false&&s.performanceMode!=='performance')?'on':'off';
if(s.fontSize)d.style.setProperty('--fs',s.fontSize+'px');if(s.radius)d.style.setProperty('--radius',s.radius+'px');}catch(e){}})();`;

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
