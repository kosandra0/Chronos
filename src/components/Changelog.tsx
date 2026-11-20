"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { siDiscord, siInstagram, siTelegram } from "simple-icons";
import { APP_VERSION, CHANGELOG, type ChangelogEntry } from "@/lib/changelog";
import { APP_NAME } from "@/lib/settings-shared";
import { Logo3D } from "./Logo3D";
import { Modal } from "./ui";
import { useSettings, useToast } from "./Providers";

function Section({ title, items, tone }: { title: string; items: string[]; tone?: "warn" }) {
  if (!items.length) return null;
  return (
    <section className="cl-section">
      <div className="cl-section-title" data-tone={tone}>{title}<span className="cl-count">{items.length}</span></div>
      <ul className="cl-list">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </section>
  );
}

function VersionDetail({ e }: { e: ChangelogEntry }) {
  return (
    <div className="cl-detail" key={e.version}>
      <div className="cl-head">
        <div>
          <div className="cl-ver">Version {e.version}</div>
          <div className="muted">{e.label} · Released {e.date}</div>
        </div>
        {e.version === APP_VERSION && <span className="badge" style={{ color: "var(--accent)" }}>Current</span>}
      </div>
      <Section title="New features" items={e.features} />
      <Section title="Improvements" items={e.improvements} />
      <Section title="Bug fixes" items={e.fixes} />
      {!e.fixes.length && <div className="cl-empty">No bug fixes in this release.</div>}
      <Section title="Known issues" items={e.knownIssues} tone="warn" />
    </div>
  );
}

/** Version menu on the left, details of the selected version on the right. */
export function ChangelogList() {
  const [sel, setSel] = useState(CHANGELOG[0]?.version);
  const entry = CHANGELOG.find((c) => c.version === sel) ?? CHANGELOG[0];
  return (
    <div className="cl-layout">
      <nav className="cl-menu" aria-label="Versions">
        {CHANGELOG.map((c) => (
          <button key={c.version} className={`cl-item ${c.version === entry.version ? "on" : ""}`} onClick={() => setSel(c.version)} aria-current={c.version === entry.version}>
            <span className="cl-item-top"><b>v{c.version}</b>{c.version === APP_VERSION && <span className="cl-cur">Current</span>}</span>
            <span className="cl-item-sub">{c.label}</span>
            <span className="cl-item-date">{c.date}</span>
          </button>
        ))}
      </nav>
      <VersionDetail e={entry} />
    </div>
  );
}

export function ChangelogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Update Logs" width={900}>
      <ChangelogList />
    </Modal>
  );
}

type Brand = { title: string; path: string; hex: string };
function BrandGlyph({ brand }: { brand: Brand }) {
  const isIg = brand.title === "Instagram";
  return (
    <span className="brand-tile" style={{ background: isIg ? "linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)" : `#${brand.hex}` }}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="#fff" aria-hidden><path d={brand.path} /></svg>
    </span>
  );
}

function Contact({ brand, label, handle, extra, href, copy }: { brand: Brand; label: string; handle: string; extra?: string; href?: string; copy?: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  return (
    <div className="contact">
      <BrandGlyph brand={brand} />
      <div className="contact-body">
        <div className="contact-label">{label}</div>
        <div className="contact-handle">{handle}{extra && <span className="muted"> {extra}</span>}</div>
      </div>
      {href && (
        <a className="btn btn-sm contact-btn" href={href} target="_blank" rel="noreferrer" aria-label={`Open ${label}`}>
          <ExternalLink size={14} /> Open
        </a>
      )}
      {copy && (
        <button
          className="btn btn-sm contact-btn"
          aria-label={`Copy ${label} username`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(copy);
              setDone(true);
              toast({ title: "Copied", body: `${label} username copied to clipboard.` });
              setTimeout(() => setDone(false), 1800);
            } catch {
              toast({ title: "Could not copy", body: copy });
            }
          }}
        >
          {done ? <Check size={14} /> : <Copy size={14} />} {done ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

export function AboutPanel() {
  const { settings } = useSettings();
  return (
    <div>
      <div className="about-hero">
        <Logo3D size={64} variant={settings.logo} />
        <div>
          <div className="about-name">{APP_NAME}</div>
          <div className="muted">Version {APP_VERSION} · Windows desktop build</div>
        </div>
      </div>
      <p className="muted" style={{ lineHeight: 1.65, marginTop: 0 }}>
        {APP_NAME} turns computer usage into understandable, searchable, measurable history. It records foreground application time, desktop time and idle periods locally and presents them as statistics, heat maps and timelines. Your data never leaves this PC.
      </p>
      <div className="set-row"><div className="t">Technology</div><div className="muted about-val">Next.js · React · TypeScript · PostgreSQL (PGlite) · Recharts · Electron · Win32 agent (PowerShell)</div></div>
      <div className="set-row"><div className="t">Copyright</div><div className="muted about-val">© 2026 {APP_NAME}. All rights reserved.</div></div>
      <div className="cl-section-title" style={{ marginTop: 22 }}>Contact the developer</div>
      <div className="contact-grid">
        <Contact brand={siInstagram} label="Instagram" handle="@i.have.lost.it.all" href="https://www.instagram.com/i.have.lost.it.all/" />
        <Contact brand={siTelegram} label="Telegram" handle="@i_am_the_last_passenger" href="https://t.me/i_am_the_last_passenger" />
        <Contact brand={siDiscord} label="Discord" handle="3.11.17" extra="(Display name: Last Wayferer)" copy="3.11.17" />
      </div>
    </div>
  );
}
