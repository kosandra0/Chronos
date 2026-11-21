"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Eye, Pencil, RefreshCw, Trash2, Upload } from "lucide-react";
import { useSettings } from "@/components/Providers";
import { SettingRow, Switch, useFetch } from "@/components/ui";
import { ProgressBar } from "@/components/V2Parts";
import { Select } from "@/components/Select";
import { THEMES, customThemeVars } from "@/lib/settings-shared";
import { APP_VERSION } from "@/lib/changelog";
import { getDesktop, type UpdateInfo } from "@/lib/desktop";
import { fmtBytes } from "@/lib/time";
import type { Gradient } from "@/lib/v2/themepack";

const CUSTOM_VARS = ["--bg", "--bg2", "--card", "--elev", "--text", "--text2", "--text3", "--accent", "--accent-ink", "--border", "--border-strong", "--shadow", "--glass", "--hover", "--heat0", "--custom-gradient"];

// ------------------------------------------------------------------ automatic theme scheduling
export function ThemeSchedule() {
  const { settings, update } = useSettings();
  return (
    <div className="set-block" data-testid="theme-schedule">
      <div className="t">Automatic theme schedule</div>
      <div className="d">Switch between a daytime and a night-time theme by your computer&apos;s clock. Turn it off to keep the theme you picked manually. A custom gradient you have set up is never changed.</div>
      <SettingRow title="Schedule themes automatically"><Switch on={settings.themeScheduleEnabled} onChange={(v) => update({ themeScheduleEnabled: v })} label="Automatic theme schedule" /></SettingRow>
      <div className="flex flex-wrap items-end gap-4" style={{ opacity: settings.themeScheduleEnabled ? 1 : 0.55, paddingTop: 8 }}>
        <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>Daytime theme
          <Select className="select" value={settings.themeDay} onChange={(e) => update({ themeDay: e.target.value })} aria-label="Daytime theme">{THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}<option value="custom">Custom Gradient</option></Select>
        </label>
        <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>Starts at
          <input className="input" type="time" value={settings.themeDayStart} onChange={(e) => e.target.value && update({ themeDayStart: e.target.value })} aria-label="Daytime start" />
        </label>
        <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>Night-time theme
          <Select className="select" value={settings.themeNight} onChange={(e) => update({ themeNight: e.target.value })} aria-label="Night-time theme">{THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}<option value="custom">Custom Gradient</option></Select>
        </label>
        <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>Starts at
          <input className="input" type="time" value={settings.themeNightStart} onChange={(e) => e.target.value && update({ themeNightStart: e.target.value })} aria-label="Night start" />
        </label>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ theme packs (saved gradient presets)
type Preset = Gradient & { id: string };
const blank = (s: { customColor1: string; customColor2: string; customColor3: string; customThree: boolean; customAngle: number; customAccent: string }): Gradient => ({ name: "", color1: s.customColor1, color2: s.customColor2, color3: s.customThree ? s.customColor3 : null, angle: s.customAngle, accent: s.customAccent });
const css = (g: Gradient) => `linear-gradient(${g.angle}deg, ${g.color1}, ${g.color3 ?? g.color2})`;
const toVars = (g: Gradient) => customThemeVars({ customColor1: g.color1, customColor2: g.color2, customColor3: g.color3 ?? g.color2, customThree: g.color3 !== null, customAngle: g.angle, customAccent: g.accent });

export function ThemePacks() {
  const { settings, update } = useSettings();
  const { data, reload } = useFetch<{ gradients: Preset[] }>("/api/v2/gradients");
  const [form, setForm] = useState<(Gradient & { id?: string }) | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [incoming, setIncoming] = useState<{ content: string; added: string[]; renamed: { from: string; to: string }[] } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const restore = useRef<Record<string, string> | null>(null);
  useEffect(() => () => { clearTimeout(timer.current); }, []);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined as unknown as ReturnType<typeof setTimeout>);

  const list = data?.gradients ?? [];
  const apply = (g: Gradient) => update({ theme: "custom", customColor1: g.color1, customColor2: g.color2, customColor3: g.color3 ?? settings.customColor3, customThree: g.color3 !== null, customAngle: g.angle, customAccent: g.accent });
  const preview = (g: Gradient) => {
    const d = document.documentElement;
    if (!restore.current) restore.current = Object.fromEntries(CUSTOM_VARS.map((n) => [n, d.style.getPropertyValue(n)]));
    for (const [n, v] of Object.entries(toVars(g))) if (n !== "--scheme") d.style.setProperty(n, v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      for (const n of CUSTOM_VARS) restore.current && (restore.current[n] ? d.style.setProperty(n, restore.current[n]) : d.style.removeProperty(n));
      restore.current = null;
    }, 4000);
  };
  const save = async () => {
    if (!form) return;
    setMsg(null);
    const r = await fetch("/api/v2/gradients", { method: "POST", body: JSON.stringify({ gradient: form }) });
    const j = await r.json();
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? "Could not save the preset." });
    setForm(null);
    reload();
  };
  const del = async (p: Preset) => {
    await fetch(`/api/v2/gradients?id=${p.id}`, { method: "DELETE" });
    setPicked((x) => x.filter((i) => i !== p.id));
    reload();
  };
  const readFile = async (f: File | undefined) => {
    if (!f) return;
    setMsg(null);
    const content = await f.text();
    const r = await fetch("/api/v2/gradients", { method: "POST", body: JSON.stringify({ action: "preview", content }) });
    const j = await r.json();
    if (!r.ok) return setMsg({ ok: false, text: `Not imported: ${j.error}` });
    setIncoming({ content, added: j.added, renamed: j.renamed });
    if (file.current) file.current.value = "";
  };
  const confirmImport = async () => {
    if (!incoming) return;
    const r = await fetch("/api/v2/gradients", { method: "POST", body: JSON.stringify({ action: "import", content: incoming.content }) });
    const j = await r.json();
    setMsg(r.ok ? { ok: true, text: `Imported ${j.added.length} preset${j.added.length === 1 ? "" : "s"}${j.renamed.length ? ` (${j.renamed.length} renamed to avoid overwriting yours)` : ""}.` } : { ok: false, text: j.error });
    setIncoming(null);
    reload();
  };
  const num = (k: "color1" | "color2" | "accent", label: string) => form && (
    <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>{label}<input type="color" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} aria-label={label} style={{ width: 52, height: 32, border: "none", background: "none" }} /></label>
  );

  return (
    <div className="set-block" data-testid="theme-packs">
      <div className="t">Theme packs</div>
      <div className="d">Save your own gradients, preview them, and share them as a pack file. Imported packs are checked carefully and never overwrite your presets.</div>
      <div className="flex flex-wrap gap-2" style={{ margin: "10px 0" }}>
        <button className="btn btn-sm" onClick={() => { setMsg(null); setForm({ ...blank(settings), name: "" }); }}>Save current gradient as preset</button>
        <a className="btn btn-sm" href={`/api/v2/gradients?export=1${picked.length ? `&ids=${picked.join(",")}` : ""}`} download style={{ display: "inline-flex", gap: 6 }}><Download size={14} /> {picked.length ? `Export ${picked.length} selected` : "Export complete pack"}</a>
        <button className="btn btn-sm" onClick={() => file.current?.click()}><Upload size={14} /> Import pack</button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => readFile(e.target.files?.[0])} aria-label="Import theme pack file" />
      </div>
      {msg && <div role="status" style={{ color: msg.ok ? "#6fcf97" : "#e5646f", fontSize: "0.9rem", margin: "6px 0" }}>{msg.text}</div>}
      {incoming && (
        <div className="card" style={{ padding: 12, margin: "8px 0" }}>
          <div style={{ fontWeight: 600 }}>Import {incoming.added.length} preset{incoming.added.length === 1 ? "" : "s"}?</div>
          <div className="muted" style={{ fontSize: "0.85rem", margin: "4px 0 8px" }}>{incoming.added.join(", ")}{incoming.renamed.length ? ` · ${incoming.renamed.length} will be renamed because the name exists already` : ""}</div>
          <div className="flex gap-2"><button className="btn btn-primary btn-sm" onClick={confirmImport}>Import</button><button className="btn btn-sm" onClick={() => setIncoming(null)}>Cancel</button></div>
        </div>
      )}
      {form && (
        <div className="card" style={{ padding: 12, margin: "8px 0" }}>
          <div className="grad-preview" style={{ background: css(form), height: 56, borderRadius: 12, marginBottom: 10 }} aria-hidden />
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>Name<input className="input" value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Preset name" /></label>
            {num("color1", "First")}{num("color2", "Second")}
            <label className="flex items-center gap-2 muted" style={{ fontSize: "0.85rem" }}><input type="checkbox" checked={form.color3 !== null} onChange={(e) => setForm({ ...form, color3: e.target.checked ? "#3f6f6a" : null })} /> Third colour</label>
            {form.color3 !== null && <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>Third<input type="color" value={form.color3} onChange={(e) => setForm({ ...form, color3: e.target.value })} aria-label="Third colour" style={{ width: 52, height: 32, border: "none", background: "none" }} /></label>}
            {num("accent", "Accent")}
            <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>Direction {form.angle}°<input type="range" min={0} max={359} value={form.angle} onChange={(e) => setForm({ ...form, angle: Number(e.target.value) })} aria-label="Direction" /></label>
          </div>
          <div className="flex gap-2" style={{ marginTop: 10 }}><button className="btn btn-primary btn-sm" onClick={save}>{form.id ? "Update preset" : "Save preset"}</button><button className="btn btn-sm" onClick={() => preview(form)}>Preview</button><button className="btn btn-sm" onClick={() => setForm(null)}>Cancel</button></div>
        </div>
      )}
      <div className="logo-grid" style={{ marginTop: 8 }}>
        {list.length === 0 && <div className="muted" style={{ fontSize: "0.9rem" }}>No saved presets yet.</div>}
        {list.map((p) => (
          <div key={p.id} className="logo-tile" style={{ textAlign: "left", cursor: "default" }}>
            <label className="flex items-center gap-2" style={{ fontSize: "0.8rem" }}><input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, p.id] : x.filter((i) => i !== p.id)))} aria-label={`Select ${p.name}`} /> Select</label>
            <div style={{ height: 44, borderRadius: 10, background: css(p), margin: "6px 0", boxShadow: `inset 0 0 0 2px ${p.accent}55` }} />
            <div className="theme-name">{p.name}</div>
            <div className="flex gap-1" style={{ marginTop: 6 }}>
              <button className="btn btn-sm" onClick={() => apply(p)}>Apply</button>
              <button className="btn btn-sm" aria-label={`Preview ${p.name}`} onClick={() => preview(p)}><Eye size={13} /></button>
              <button className="btn btn-sm" aria-label={`Edit ${p.name}`} onClick={() => { setMsg(null); setForm({ ...p }); }}><Pencil size={13} /></button>
              <button className="btn btn-sm" aria-label={`Delete ${p.name}`} onClick={() => del(p)}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ updates
export function UpdatesPanel() {
  const { settings, update: save } = useSettings();
  const desktop = getDesktop();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => desktop?.update.onProgress(setProgress), [desktop]);

  if (!desktop?.update) {
    return <div className="muted" style={{ fontSize: "0.9rem" }}>Updates are available in the desktop app. Installed version: {APP_VERSION}.</div>;
  }
  const check = async () => {
    setBusy(true); setNote(null); setDownloaded(false); setProgress(null);
    try { setInfo(await desktop.update.check()); } finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true); setNote(null); setProgress({ received: 0, total: info?.installer?.size ?? 1 });
    try {
      const r = await desktop.update.download();
      if (r.ok) { setDownloaded(true); setNote("Downloaded and verified (SHA-256)."); } else setNote(`Download failed: ${r.error}`);
    } finally { setBusy(false); }
  };
  const install = async () => {
    const r = await desktop.update.install();
    if (r.declined) setNote("Update postponed. You can install it later.");
    else if (!r.ok) setNote(r.error ?? "Could not start the update.");
  };

  return (
    <div data-testid="updates-panel">
      <div className="set-row"><div className="t">Installed version</div><div className="num">{APP_VERSION}</div></div>
      <SettingRow title="Check for updates automatically" desc="Looks for newer stable releases of the official WatchTower repository about twice a day and tells you. Nothing is downloaded or installed without your action."><Switch on={settings.updateAutoCheck} onChange={(v) => save({ updateAutoCheck: v })} label="Automatic update checks" /></SettingRow>
      <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 10 }}>
        <button className="btn" disabled={busy} onClick={check}><RefreshCw size={14} /> Check for updates</button>
        {info?.status === "none" && <span className="muted">You have the latest version.</span>}
        {info?.status === "error" && <span role="alert" style={{ color: "#e5646f" }}>{info.error}</span>}
      </div>
      {info?.status === "available" && (
        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <div style={{ fontWeight: 650 }}>WatchTower {info.version} is available <span className="muted" style={{ fontWeight: 400 }}>(you have {info.current})</span></div>
          {info.installer && <div className="muted" style={{ fontSize: "0.85rem" }}>{info.installer.name} · {fmtBytes(info.installer.size)}</div>}
          {info.notes && <pre className="muted" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.85rem", maxHeight: 180, overflow: "auto", margin: "8px 0" }}>{info.notes}</pre>}
          {progress && busy && <div style={{ margin: "8px 0" }}><ProgressBar pct={(progress.received / Math.max(1, progress.total)) * 100} label="Download progress" /><div className="muted" style={{ fontSize: "0.8rem", marginTop: 4 }}>{fmtBytes(progress.received)} of {fmtBytes(progress.total)}</div></div>}
          {info.portable ? (
            <div className="muted" style={{ fontSize: "0.85rem" }}>This is the portable build, which cannot replace itself. <button className="btn btn-sm" onClick={() => desktop.update.openPage()}>Open the release page</button></div>
          ) : (
            <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
              {!downloaded && <button className="btn btn-primary" disabled={busy} onClick={download}>Download update</button>}
              {downloaded && <button className="btn btn-primary" onClick={install}>Install and restart</button>}
              <button className="btn" onClick={() => { desktop.update.skip(info.version ?? ""); setInfo({ status: "none", current: info.current }); }}>Skip this version</button>
            </div>
          )}
          {note && <div role="status" className="muted" style={{ fontSize: "0.85rem", marginTop: 8 }}>{note}</div>}
        </div>
      )}
    </div>
  );
}
