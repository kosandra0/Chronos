// Add future releases at the TOP of this array. No release history is invented:
// this is the initial development version.

export type ChangelogEntry = {
  version: string;
  date: string;
  label: string;
  features: string[];
  improvements: string[];
  fixes: string[];
  knownIssues: string[];
};

export const APP_VERSION = "0.1.0-dev";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.1.0-dev",
    date: "2026-11-19",
    label: "Initial development version",
    features: [
      "Transition-based session engine with heartbeats, crash recovery and single-open-session guarantee",
      "Windows foreground monitor agent (PowerShell + Win32 APIs): foreground app, desktop shell, idle, lock state, elevation limits",
      "Chronos self-usage tracking (UI focus based, deduplicated against the agent)",
      "Overview, Statistics, Heat Map, Applications, Sessions, Timeline and Achievements pages",
      "JSON / Markdown / TXT export, validated JSON import with preview, merge and replace",
      "Automatic and manual backups with atomic writes, verification, history and restore",
      "Dark and light themes, accent colors, performance modes and reduced-motion support",
    ],
    improvements: [
      "Hour-exact slicing keeps midnight boundaries correct in all statistics",
      "Averages state their denominators (usage days vs calendar days)",
    ],
    fixes: [],
    knownIssues: [
      "This development build includes an Electron Windows desktop host and embedded PGlite database, but the Windows installer still requires a Windows build runner.",
      "The monitoring agent has not yet been exercised on the target Windows PC; validate process detection, idle transitions, and sleep/resume behavior before relying on long-term records.",
      "Monitoring runs while Chronos is open; a separate always-on Windows service is not included.",
      "UAC secure desktops and protected processes may limit the process metadata Windows exposes.",
      "Daylight-saving transition days may be off by up to one hour in hourly slices.",
    ],
  },
];
