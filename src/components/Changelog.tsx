"use client";

import { APP_VERSION, CHANGELOG } from "@/lib/changelog";
import { Logo } from "./Shell";
import { Modal } from "./ui";

function Block({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="card-title" style={{ marginBottom: 6 }}>
        {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
        {items.map((i) => (
          <li key={i} className="muted">
            <span style={{ color: "var(--text)" }}>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChangelogList() {
  return (
    <div>
      {CHANGELOG.map((e) => (
        <div key={e.version} style={{ paddingBottom: 18 }}>
          <div className="flex flex-wrap items-center gap-2">
            <span style={{ fontSize: "1.1rem", fontWeight: 650 }}>v{e.version}</span>
            <span className="badge">{e.label}</span>
            <span className="muted">Released {e.date}</span>
            {e.version === APP_VERSION && <span className="badge" style={{ color: "var(--accent)" }}>Current</span>}
          </div>
          <Block title="New features" items={e.features} />
          <Block title="Improvements" items={e.improvements} />
          <Block title="Bug fixes" items={e.fixes.length ? e.fixes : []} />
          {!e.fixes.length && <div className="muted" style={{ marginTop: 14, fontSize: "0.9rem" }}>No bug fixes yet — this is the first development version.</div>}
          <Block title="Known issues" items={e.knownIssues} />
        </div>
      ))}
    </div>
  );
}

export function ChangelogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Update Logs" width={760}>
      <ChangelogList />
    </Modal>
  );
}

export function AboutPanel() {
  return (
    <div>
      <div className="flex items-center gap-4" style={{ marginBottom: 16 }}>
        <Logo size={56} />
        <div>
          <div style={{ fontSize: "1.4rem", fontWeight: 650, letterSpacing: "0.12em" }}>CHRONOS</div>
          <div className="muted">Version {APP_VERSION} · initial development build</div>
        </div>
      </div>
      <p className="muted" style={{ lineHeight: 1.6, marginTop: 0 }}>
        Chronos turns computer usage into understandable, searchable, measurable history. It records foreground application time, desktop time and idle periods locally and presents them as statistics, heat maps and timelines.
      </p>
      <div className="set-row">
        <div className="t">Developer</div>
        <div className="muted">Placeholder — not set</div>
      </div>
      <div className="set-row">
        <div className="t">Technology</div>
        <div className="muted" style={{ textAlign: "right" }}>
          Next.js · React · TypeScript · PostgreSQL (Drizzle) · Recharts · Win32 agent (PowerShell)
        </div>
      </div>
      <div className="set-row">
        <div className="t">Copyright</div>
        <div className="muted">© 2026 Chronos project. All rights reserved.</div>
      </div>
    </div>
  );
}
