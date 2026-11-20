"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatShort } from "@/lib/time";
import { ChartTip } from "./ui";
import { useEffect, useState } from "react";
import { Ms } from "./AnimText";
import { useSettings } from "./Providers";

export type Slice = { name: string; ms: number; color: string };

export function DonutChart({ data, total, label, height = 220 }: { data: Slice[]; total: number; label: string; height?: number }) {
  const { motion } = useSettings();
  // Animate the sweep once on appearance; afterwards values update live without re-animating every second.
  const [first, setFirst] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setFirst(false), 1300);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ position: "relative", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="ms" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={data.length > 1 ? 2 : 0} stroke="none" isAnimationActive={motion.charts && first} animationDuration={700} cornerRadius={4}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTip fmt={(n) => formatShort(n)} />} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", textAlign: "center" }}>
        <div>
          <div className="num" style={{ fontSize: "1.35rem", fontWeight: 600 }}>
            <Ms ms={total} />
          </div>
          <div className="muted" style={{ fontSize: "0.78rem" }}>
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}

export type BarPoint = { label: string; value: number };

export function MsBars({ data, height = 200, interval = 0 }: { data: BarPoint[]; height?: number; interval?: number | "preserveStartEnd" }) {
  const { motion } = useSettings();
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fill: "var(--text2)", fontSize: 11 }} tickLine={false} axisLine={false} interval={interval} />
          <YAxis tick={{ fill: "var(--text2)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 3600000 ? `${Math.round(v / 3600000)}h` : `${Math.round(v / 60000)}m`)} width={44} />
          <Tooltip cursor={{ fill: "var(--hover)" }} content={<ChartTip fmt={(n) => formatShort(n)} />} />
          <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} isAnimationActive={motion.charts} animationDuration={600} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MsArea({ data, height = 200 }: { data: BarPoint[]; height?: number }) {
  const { motion } = useSettings();
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fill: "var(--text2)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={32} />
          <YAxis tick={{ fill: "var(--text2)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 3600000 ? `${Math.round(v / 3600000)}h` : `${Math.round(v / 60000)}m`)} width={44} />
          <Tooltip content={<ChartTip fmt={(n) => formatShort(n)} />} />
          <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="url(#areaFill)" isAnimationActive={motion.charts} animationDuration={600} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
