"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Archive, Bell, Cpu, Database, Download, FileUp, Info, Monitor, Palette, Settings2, ShieldCheck, Upload } from "lucide-react";
import { useLive, useSettings, useToast } from "@/components/Providers";
import { Card, Empty, ErrorBox, Modal, PageHeader, Seg, SettingRow, Skeleton, Switch, useFetch } from "@/components/ui";
import { AboutPanel, ChangelogModal } from "@/components/Changelog";
import { NAV, type ChronosSettings, type PerfMode } from "@/lib/settings-shared";
import { fmtBytes, fmtDateTime, formatShort } from "@/lib/time";

type Tab = "general" | "monitoring" | "appearance" | "performance" | "data" | "backups" | "notifications" | "importexport" | "about";
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "general", label: "General", icon: <Settings2 size={16} /> },
  { id: "monitoring", label: "Monitoring", icon: <Monitor size={16} /> },
  { id: "appearance", label: "Appearance", icon: <Palette size={16} /> },
  { id: "performance", label: "Performance", icon: <Cpu size={16} /> },
  { id: "data", label: "Data & Storage", icon: <Database size={16} /> },
  { id: "backups", label: "Backups", icon: <Archive size={16} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={16} /> },
  { id: "importexport", label: "Import / Export", icon: <FileUp size={16} /> },
  { id: "about", label: "About", icon: <Info size={16} /> },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, []);
  return (
    <div className="page">
      <PageHeader title="Settings" subtitle="Everything Chronos records and how it looks." />
      <div className="set-layout">
        <nav className="flex flex-col gap-1" aria-label="Settings sections">
          {TABS.map((t) => (
            <button key={t.id} className={`nav-item ${tab === t.id ? "active" : ""}`} style={{ height: 38 }} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div style={{ minWidth: 0 }}>
          {tab === "general" && <General />}
          {tab === "monitoring" && <Monitoring />}
          {tab === "appearance" && <Appearance />}
          {tab === "performance" && <Performance />}
          {tab === "data" && <DataStorage />}
          {tab === "backups" && <Backups />}
          {tab === "notifications" && <Notifications />}
          {tab === "importexport" && <ImportExport />}
          {tab === "about" && <About />}
        </div>
      </div>
    </div>
  );
}

function Tog({ k, title, desc }: { k: keyof ChronosSettings; title: string; desc?: ReactNode }) {
  const { settings, update } = useSettings();
  return (
    <SettingRow title={title} desc={desc}>
      <Switch on={settings[k] as boolean} onChange={(v) => update({ [k]: v })} label={title} />
    </SettingRow>
  );
}

function General() {
  const { settings, update } = useSettings();
  return (
    <Card title="General">
      <SettingRow title="Default landing page" desc="Page opened when you start Chronos in a new browser session.">
        <select className="select" value={settings.landing} onChange={(e) => update({ landing: e.target.value })}>
          {NAV.map((n) => <option key={n.href} value={n.href}>{n.label}</option>)}
        </select>
      </SettingRow>
      <SettingRow title="Time zone" desc="Used to place sessions on calendar days and hours. Detected from your browser.">
        <span className="badge">{settings.timezone || "detecting…"}</span>
      </SettingRow>
      <SettingRow title="Desktop shell options" desc="Launch at Windows startup, start minimized, minimize/close to tray and confirm-before-exit belong to a native desktop shell (Tauri). This build is a web application plus a Windows monitoring agent, so these options are not available and are intentionally not shown as controls.">
        <span className="badge">Not in this build</span>
      </SettingRow>
    </Card>
  );
}

function Monitoring() {
  const { settings, update } = useSettings();
  const { data } = useLive();
  const [thr, setThr] = useState(String(settings.idleThresholdMin));
  useEffect(() => setThr(String(settings.idleThresholdMin)), [settings.idleThresholdMin]);
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      <Card title="Windows monitoring agent">
        <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 12 }}>
          <span className="badge"><span className={`dot ${data?.agent.active ? "live" : "warn"}`} />{data?.agent.active ? "Connected" : "Not connected"}</span>
          {data?.agent.lastSeen && <span className="muted">last heartbeat {fmtDateTime(data.agent.lastSeen)}</span>}
          <a className="btn btn-primary btn-sm" href="/api/agent/script"><Download size={14} /> Download chronos-agent.ps1</a>
        </div>
        <div className="notice" style={{ lineHeight: 1.6 }}>
          Run on the Windows PC (no administrator rights needed):
          <pre className="mono" style={{ margin: "8px 0", whiteSpace: "pre-wrap" }}>powershell -ExecutionPolicy Bypass -File .\chronos-agent.ps1 -Server {origin}</pre>
          The agent uses GetForegroundWindow, GetWindowThreadProcessId, QueryFullProcessImageNameW, GetLastInputInfo and related Win32 APIs. It also lives in the project at <span className="mono">agent/chronos-agent.ps1</span>. If it stops, Chronos closes the open session at the last heartbeat and never invents activity.
        </div>
      </Card>
      <Card title="Monitoring">
        <Tog k="monitoringEnabled" title="Enable monitoring" desc="Pause or resume all recording. Existing history is never affected." />
        <Tog k="idleEnabled" title="Idle detection" desc="Classify inactivity as Idle instead of application time." />
        <SettingRow title="Idle threshold" desc="Inactivity shorter than this stays with the foreground application; idle starts when the threshold is reached (e.g. 20 min in Chrome with 15 min untouched at a 5 min threshold → Chrome keeps the first 5, the remaining 10 min are Idle).">
          <div className="flex items-center gap-2">
            <input className="input" type="number" min={1} max={240} style={{ width: 80 }} value={thr} onChange={(e) => setThr(e.target.value)} onBlur={() => { const n = Math.min(240, Math.max(1, Math.round(Number(thr) || 5))); setThr(String(n)); if (n !== settings.idleThresholdMin) update({ idleThresholdMin: n }); }} aria-label="Idle threshold in minutes" />
            <span className="muted">minutes</span>
          </div>
        </SettingRow>
        <Tog k="idleInTotal" title="Include idle time in total screen time" desc="Off by default: Total screen time then means active time (applications + desktop)." />
        <Tog k="showIdle" title="Show idle time on the Overview" desc="Display preference only." />
        <Tog k="desktopTracking" title="Desktop tracking" desc="Record time spent on the Windows desktop / taskbar separately from applications." />
        <Tog k="trackSelf" title="Track Chronos itself" desc="Record Chronos' own foreground time under “Chronos”." />
        <Tog k="trackTitles" title="Record window titles" desc="Off by default because titles can contain private information. When on, the title at the start of each application session is stored." />
      </Card>
      <Card title="Privacy">
        <div className="flex items-start gap-3" style={{ lineHeight: 1.6 }}>
          <ShieldCheck size={20} style={{ color: "var(--accent)", flex: "none", marginTop: 2 }} />
          <div className="muted">
            <b style={{ color: "var(--text)" }}>Recorded:</b> application name, executable name/path, activity type (application, desktop, idle, locked), start/end time, elevation status, and window title only if enabled above.<br />
            <b style={{ color: "var(--text)" }}>Never recorded:</b> keystrokes, clipboard, screenshots, microphone, webcam, passwords or page contents. Data stays in your local database; Chronos sends nothing to external servers. Chronos never elevates privileges or bypasses process protection — inaccessible processes are recorded as “limited”.
          </div>
        </div>
      </Card>
    </div>
  );
}

const ACCENTS: ChronosSettings["accent"][] = ["teal", "sage", "blue", "violet", "amber"];
const ACCENT_HEX: Record<string, string> = { teal: "#4fb3a5", sage: "#93b58c", blue: "#6c9fe0", violet: "#a094dc", amber: "#d9b56a" };

function Appearance() {
  const { settings, update } = useSettings();
  return (
    <Card title="Appearance">
      <SettingRow title="Theme"><Seg value={settings.theme} onChange={(v) => update({ theme: v })} options={[{ id: "dark", label: "Dark" }, { id: "light", label: "Light" }, { id: "system", label: "System" }]} /></SettingRow>
      <SettingRow title="Accent color"><div className="flex gap-2">{ACCENTS.map((a) => <button key={a} className={`swatch ${settings.accent === a ? "on" : ""}`} style={{ background: ACCENT_HEX[a] }} aria-label={a} title={a} onClick={() => update({ accent: a })} />)}</div></SettingRow>
      <SettingRow title="Font family">
        <select className="select" value={settings.font} onChange={(e) => update({ font: e.target.value as ChronosSettings["font"] })}>
          <option value="inter">Inter</option><option value="segoe">Segoe UI</option><option value="system">System UI</option><option value="mono">Monospace</option>
        </select>
      </SettingRow>
      <SettingRow title="Font size" desc={`${settings.fontSize}px`}><input type="range" min={12} max={18} value={settings.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} aria-label="Font size" /></SettingRow>
      <SettingRow title="UI density"><Seg value={settings.density} onChange={(v) => update({ density: v })} options={[{ id: "comfortable", label: "Comfortable" }, { id: "compact", label: "Compact" }]} /></SettingRow>
      <SettingRow title="Rounded corners" desc={`${settings.radius}px`}><input type="range" min={4} max={24} value={settings.radius} onChange={(e) => update({ radius: Number(e.target.value) })} aria-label="Corner radius" /></SettingRow>
      <Tog k="sidebarCollapsed" title="Collapsed sidebar" desc="Show only icons (with tooltips) in the navigation." />
      <Tog k="animations" title="Animations" desc="Master switch for page transitions, sliding digits and chart animations. Reduced-motion from Windows is always respected." />
      <Tog k="transparency" title="Glass transparency" desc="Soft translucent surfaces. Disabled automatically in Performance mode." />
    </Card>
  );
}

const MODES: { id: PerfMode; title: string; desc: string }[] = [
  { id: "performance", title: "Performance", desc: "No decorative animations or transitions, no chart animation, no transparency effects, slower background refresh (10 s). Tracking accuracy is unchanged — recording runs in the engine, not the UI." },
  { id: "balanced", title: "Balanced", desc: "Moderate animations, smooth number transitions and normal chart rendering. Refreshes every 3 s." },
  { id: "enhanced", title: "Enhanced visual", desc: "Smooth transitions, animated statistics and richer visual effects. Refreshes every 3 s." },
];

function Performance() {
  const { settings, update } = useSettings();
  return (
    <Card title="Performance">
      <div className="flex flex-col gap-3">
        {MODES.map((m) => (
          <button key={m.id} className="card hover" style={{ textAlign: "left", borderColor: settings.performanceMode === m.id ? "var(--accent)" : undefined, background: settings.performanceMode === m.id ? "color-mix(in srgb, var(--accent) 8%, var(--card))" : undefined }} onClick={() => update({ performanceMode: m.id })} aria-pressed={settings.performanceMode === m.id}>
            <div className="flex items-center justify-between"><b>{m.title}</b>{settings.performanceMode === m.id && <span className="badge" style={{ color: "var(--accent)" }}>Active</span>}</div>
            <div className="muted" style={{ marginTop: 6, lineHeight: 1.5, fontSize: "0.9rem" }}>{m.desc}</div>
          </button>
        ))}
      </div>
    </Card>
  );
}

type Storage = { location: string; databaseBytes: number; sessions: number; applications: number; achievements: number; firstSession: string | null; backupDirectory: string; backups: { bytes: number; files: number } };

function DataStorage() {
  const toast = useToast();
  const { data, error, reload } = useFetch<Storage>("/api/storage");
  const [checks, setChecks] = useState<{ name: string; problems: number }[] | null>(null);
  const [busy, setBusy] = useState("");
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [before, setBefore] = useState("");
  const [typed, setTyped] = useState("");

  async function act(action: string, extra: object = {}) {
    setBusy(action);
    try {
      const r = await fetch("/api/storage", { method: "POST", body: JSON.stringify({ action, ...extra }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      return j;
    } catch (e) {
      toast({ title: "Operation failed", body: e instanceof Error ? e.message : undefined });
      return null;
    } finally {
      setBusy("");
    }
  }

  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;
  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      <Card title="Storage">
        {!data ? <Skeleton h={120} /> : (
          <>
            <SettingRow title="Database location" desc="All usage data stays in this local database."><span className="mono">{data.location}</span></SettingRow>
            <SettingRow title="Database size"><span className="num">{fmtBytes(data.databaseBytes)}</span></SettingRow>
            <SettingRow title="Records"><span className="num">{data.sessions.toLocaleString()} sessions · {data.applications} applications · {data.achievements} achievements</span></SettingRow>
            <SettingRow title="Oldest record"><span>{data.firstSession ? fmtDateTime(data.firstSession) : "—"}</span></SettingRow>
            <SettingRow title="Backup storage" desc={data.backupDirectory}><span className="num">{data.backups.files} file(s) · {fmtBytes(data.backups.bytes)}</span></SettingRow>
          </>
        )}
      </Card>
      <Card title="Maintenance">
        <SettingRow title="Database integrity check" desc="Checks for invalid, overlapping or inconsistent sessions.">
          <button className="btn" disabled={busy === "integrity"} onClick={async () => { const j = await act("integrity"); if (j) setChecks(j.checks); }}>Run check</button>
        </SettingRow>
        {checks && (
          <div style={{ padding: "6px 0 14px" }}>
            {checks.map((c) => <div key={c.name} className="flex justify-between" style={{ padding: "5px 0", fontSize: "0.92rem" }}><span>{c.name}</span><span style={{ color: c.problems ? "#e0b25a" : "var(--accent)" }}>{c.problems ? `${c.problems} issue(s)` : "OK"}</span></div>)}
            {checks.some((c) => c.name.includes("duration") && c.problems) && <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={async () => { const j = await act("repair-durations"); if (j) { toast({ title: `Repaired ${j.repaired} duration(s)` }); const k = await act("integrity"); if (k) setChecks(k.checks); } }}>Repair durations from timestamps</button>}
          </div>
        )}
        <SettingRow title="Clear cache" desc="Clears in-memory caches and leftover temporary backup files. History is untouched."><button className="btn" disabled={busy === "clear-cache"} onClick={async () => { const j = await act("clear-cache"); if (j) { toast({ title: "Cache cleared", body: `${j.removedTempFiles} temporary file(s) removed.` }); reload(); } }}>Clear cache</button></SettingRow>
        <SettingRow title="Retention" desc="Chronos keeps your complete history indefinitely. Records are only ever deleted by you, after an explicit confirmation and an automatic safety backup."><button className="btn btn-danger" onClick={() => setPurgeOpen(true)}>Delete old history…</button></SettingRow>
      </Card>
      <Modal open={purgeOpen} onClose={() => setPurgeOpen(false)} title="Delete old history" width={520}>
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>Sessions that ended before the chosen date will be permanently deleted. A verified backup is created first; if it fails nothing is deleted.</p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.85rem" }}>Delete sessions ending before<input className="input" type="date" value={before} onChange={(e) => setBefore(e.target.value)} /></label>
          <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.85rem" }}>Type DELETE to confirm<input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
          <button className="btn btn-danger" disabled={!before || typed !== "DELETE" || busy === "purge"} onClick={async () => { const j = await act("purge", { before, confirm: true }); if (j) { toast({ title: `Deleted ${j.deleted} session(s)`, body: "A safety backup was created first." }); setPurgeOpen(false); setTyped(""); reload(); } }}>Permanently delete</button>
        </div>
      </Modal>
    </div>
  );
}

type BackupInfo = { directory: string; lastBackupAt: string | null; nextBackupAt: string | null; history: { id: string; filePath: string; createdAt: string; status: string; sizeBytes: number; kind: string; message: string | null }[] };

function Backups() {
  const { settings, update } = useSettings();
  const toast = useToast();
  const { data, error, reload } = useFetch<BackupInfo>("/api/backups", { refreshMs: 30000 });
  const [dir, setDir] = useState(settings.backupDir);
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState<string | null>(null);
  useEffect(() => setDir(settings.backupDir), [settings.backupDir]);

  async function now() {
    setBusy(true);
    try {
      const r = await fetch("/api/backups", { method: "POST" });
      const j = await r.json();
      if (j.status === "ok") { if (settings.notifyBackupOk) toast({ kind: "backup", title: "Backup completed", body: j.message }); }
      else if (settings.notifyBackupFail) toast({ kind: "backup", title: "Backup failed", body: j.message ?? j.error });
      reload();
    } finally { setBusy(false); }
  }
  async function doRestore() {
    if (!restore) return;
    const r = await fetch(`/api/backups/${restore}/restore`, { method: "POST", body: JSON.stringify({ confirm: true }) });
    const j = await r.json();
    setRestore(null);
    if (!r.ok) toast({ title: "Restore failed", body: j.error });
    else { toast({ title: "Backup restored", body: "A safety backup of the previous data was created first." }); reload(); }
  }

  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      <Card title="Automatic backups">
        <Tog k="backupEnabled" title="Automatic backups" desc="Verified JSON backups written atomically (temporary file → rename). Existing backups are never overwritten." />
        <SettingRow title="Frequency">
          <select className="select" value={settings.backupFrequency} onChange={(e) => update({ backupFrequency: e.target.value as ChronosSettings["backupFrequency"] })}>
            <option value="6h">Every 6 hours</option><option value="12h">Every 12 hours</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
          </select>
        </SettingRow>
        <SettingRow title="Backup directory" desc={`Current: ${data?.directory ?? "…"}. Leave empty for the default. The directory must be writable by the Chronos server.`}>
          <div className="flex gap-2"><input className="input" style={{ width: 260 }} placeholder="Default" value={dir} onChange={(e) => setDir(e.target.value)} /><button className="btn" disabled={dir === settings.backupDir} onClick={() => update({ backupDir: dir.trim() }).then(reload)}>Save</button></div>
        </SettingRow>
        <SettingRow title="Last / next backup" desc={settings.backupEnabled ? undefined : "Automatic backups are off."}>
          <span className="num muted">{data?.lastBackupAt ? fmtDateTime(data.lastBackupAt) : "never"} / {settings.backupEnabled && data?.nextBackupAt ? (new Date(data.nextBackupAt) <= new Date() ? "due now" : fmtDateTime(data.nextBackupAt)) : "—"}</span>
        </SettingRow>
        <SettingRow title="Manual backup" desc="Create a verified backup right now."><button className="btn btn-primary" disabled={busy} onClick={now}>{busy ? "Backing up…" : "Back up now"}</button></SettingRow>
      </Card>
      <Card title="Backup history">
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data && data.history.length ? (
          <div className="table-wrap"><table className="tbl"><thead><tr><th>Created</th><th>Kind</th><th>Status</th><th>Size</th><th>File</th><th /></tr></thead><tbody>
            {data.history.map((b) => (
              <tr key={b.id}>
                <td className="num">{fmtDateTime(b.createdAt)}</td><td className="muted">{b.kind}</td>
                <td><span className="badge" title={b.message ?? ""}><span className={`dot ${b.status === "ok" ? "live" : "off"}`} />{b.status === "ok" ? "Verified" : "Failed"}</span></td>
                <td className="num">{b.status === "ok" ? fmtBytes(b.sizeBytes) : "—"}</td>
                <td className="mono muted" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }} title={b.filePath}>{b.status === "ok" ? b.filePath.split(/[\\/]/).pop() : b.message}</td>
                <td>{b.status === "ok" && <button className="btn btn-sm" onClick={() => setRestore(b.id)}>Restore</button>}</td>
              </tr>
            ))}
          </tbody></table></div>
        ) : <Empty icon={<Archive size={20} />} title="No backups yet" text="Your backup history will appear here." />}
      </Card>
      <Modal open={!!restore} onClose={() => setRestore(null)} title="Restore this backup?" width={500}>
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>This replaces all current sessions, applications and achievements with the backup contents. A safety backup of your current data is created first; if that fails, nothing changes.</p>
        <div className="flex gap-2"><button className="btn btn-danger" onClick={doRestore}>Replace data with backup</button><button className="btn" onClick={() => setRestore(null)}>Cancel</button></div>
      </Modal>
    </div>
  );
}

function Notifications() {
  return (
    <Card title="Notifications">
      <div className="notice" style={{ marginBottom: 8 }}>Notifications appear as in-app toasts while Chronos is open. Each type can be controlled independently.</div>
      <Tog k="notifyMonitoring" title="Monitoring started / stopped" />
      <Tog k="notifyDaily" title="Daily summary" desc="Shown once per day when Chronos opens, if yesterday has recorded activity." />
      <Tog k="notifyWeekly" title="Weekly summary" desc="Shown on Mondays when Chronos opens." />
      <Tog k="notifyAchievement" title="Achievement unlocked" />
      <Tog k="gamificationNotify" title="Gamification notifications" desc="Level-ups and achievement animations." />
      <Tog k="notifyBackupOk" title="Backup completed" />
      <Tog k="notifyBackupFail" title="Backup failed" />
    </Card>
  );
}

type Preview = {
  ok: boolean; kind?: string; error?: string; errors?: string[]; warnings?: string[]; applied?: boolean;
  summary?: { applications: number; sessions: number; newSessions: number; duplicateSessions: number; newApplications: number; from: string | null; to: string | null; schemaVersion: number; exportedAt: string; existingSessions: number };
  result?: { insertedSessions: number; skippedSessions: number; newApplications: number };
};

function ImportExport() {
  const toast = useToast();
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [res, setRes] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  async function post(mode: "preview" | "merge" | "replace", f = file) {
    if (!f) return null;
    setBusy(true);
    try {
      const r = await fetch("/api/import", { method: "POST", body: JSON.stringify({ filename: f.name, content: f.content, mode }) });
      const j = (await r.json()) as Preview;
      setRes(j);
      return j;
    } catch {
      setRes({ ok: false, error: "The import request failed." });
      return null;
    } finally { setBusy(false); }
  }
  async function pick(files: FileList | null) {
    const f = files?.[0];
    setRes(null); setFile(null);
    if (!f) return;
    if (!/\.(json|md|txt)$/i.test(f.name)) {
      setRes({ ok: false, kind: "unsupported", error: "Unsupported file format. Chronos supports JSON, Markdown (.md), and Text (.txt) files only." });
      return;
    }
    const content = await f.text();
    const nf = { name: f.name, content };
    setFile(nf);
    await post("preview", nf);
  }
  async function apply(mode: "merge" | "replace") {
    const j = await post(mode);
    setConfirmReplace(false);
    if (j?.applied) { toast({ title: mode === "merge" ? "Records merged" : "Data replaced", body: `${j.result?.insertedSessions ?? 0} session(s) imported.` }); setFile(null); }
  }
  const s = res?.summary;

  return (
    <div className="flex flex-col" style={{ gap: "var(--gap)" }}>
      <Card title="Export">
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>JSON is the complete, importable format (schema <span className="mono">chronos-export</span> v1: applications, sessions, daily and historical statistics, settings, categories, gamification progress and backup metadata). Markdown and text are readable reports.</p>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-primary" href="/api/export?format=json"><Download size={15} /> JSON (.json)</a>
          <a className="btn" href="/api/export?format=md"><Download size={15} /> Markdown (.md)</a>
          <a className="btn" href="/api/export?format=txt"><Download size={15} /> Plain text (.txt)</a>
        </div>
      </Card>
      <Card title="Import">
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>Accepted file types: <b>.json</b>, <b>.md</b>, <b>.txt</b>. Only Chronos JSON exports/backups can be imported as records; Markdown and text files are reports. Every file is validated and previewed before anything changes.</p>
        <label className="btn" style={{ cursor: "pointer" }}><Upload size={15} /> Choose file…<input type="file" accept=".json,.md,.txt" style={{ display: "none" }} onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} /></label>
        {file && <span className="muted" style={{ marginLeft: 12 }}>{file.name}</span>}
        <div style={{ marginTop: 16 }}>
          {busy && !res && <Skeleton h={60} />}
          {res && !res.ok && res.kind === "unsupported" && <div className="notice warn">{res.error}</div>}
          {res && !res.ok && res.kind === "report" && <div className="notice warn" style={{ lineHeight: 1.6 }}>{res.error}</div>}
          {res && !res.ok && res.kind === "invalid" && <div className="err"><b>This file was rejected and nothing was changed.</b><ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{res.errors?.map((e) => <li key={e}>{e}</li>)}</ul></div>}
          {res && !res.ok && !res.kind && <ErrorBox message={res.error ?? "Import failed"} />}
          {res?.ok && !res.applied && s && (
            <div>
              <div className="card" style={{ background: "var(--bg)" }}>
                <div className="card-title">Import preview</div>
                <div className="grid g2" style={{ gap: 8, fontSize: "0.92rem" }}>
                  <span className="muted">Schema version</span><span className="num">{s.schemaVersion}</span>
                  <span className="muted">Exported</span><span>{fmtDateTime(s.exportedAt)}</span>
                  <span className="muted">Applications in file</span><span className="num">{s.applications} ({s.newApplications} new)</span>
                  <span className="muted">Sessions in file</span><span className="num">{s.sessions.toLocaleString()}</span>
                  <span className="muted">New sessions</span><span className="num">{s.newSessions.toLocaleString()}</span>
                  <span className="muted">Duplicate session IDs</span><span className="num">{s.duplicateSessions.toLocaleString()} (skipped on merge)</span>
                  <span className="muted">Covers</span><span>{s.from ? `${fmtDateTime(s.from)} → ${fmtDateTime(s.to!)}` : "—"}</span>
                  <span className="muted">Sessions currently stored</span><span className="num">{s.existingSessions.toLocaleString()}</span>
                </div>
                {res.warnings?.map((w) => <div key={w} className="faint" style={{ marginTop: 8, fontSize: "0.85rem" }}>⚠ {w}</div>)}
              </div>
              <div className="flex flex-wrap gap-2" style={{ marginTop: 14 }}>
                <button className="btn btn-primary" disabled={busy} onClick={() => apply("merge")}>Merge records</button>
                <button className="btn btn-danger" disabled={busy} onClick={() => setConfirmReplace(true)}>Replace existing records…</button>
                <button className="btn" onClick={() => { setFile(null); setRes(null); }}>Cancel</button>
              </div>
            </div>
          )}
          {res?.ok && res.applied && <div className="notice">Import complete: {res.result?.insertedSessions} session(s) added, {res.result?.skippedSessions} skipped as duplicates, {res.result?.newApplications} new application(s).</div>}
        </div>
      </Card>
      <Modal open={confirmReplace} onClose={() => setConfirmReplace(false)} title="Replace all existing records?" width={500}>
        <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>All current sessions, applications and achievements will be replaced by the file contents. Chronos first writes a verified backup of your current data and aborts if that fails.</p>
        <div className="flex gap-2"><button className="btn btn-danger" disabled={busy} onClick={() => apply("replace")}>Back up and replace</button><button className="btn" onClick={() => setConfirmReplace(false)}>Cancel</button></div>
      </Modal>
    </div>
  );
}

function About() {
  const [open, setOpen] = useState(false);
  return (
    <Card title="About">
      <AboutPanel />
      <div style={{ marginTop: 16 }}><button className="btn" onClick={() => setOpen(true)}>View update logs</button></div>
      <ChangelogModal open={open} onClose={() => setOpen(false)} />
      <div className="faint" style={{ marginTop: 14, fontSize: "0.8rem" }}></div>
    </Card>
  );
}
