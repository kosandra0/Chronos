# Chronos — Windows Usage Intelligence

Chronos is packaged as a Windows desktop application. Open the installed app or the portable `.exe`; the desktop host starts the local application server and the Windows monitoring agent automatically.

## Windows executable build

See [BUILD-WINDOWS.md](BUILD-WINDOWS.md) for the recommended GitHub Actions workflow and local Windows build steps. The build produces:

- **Chronos Setup** — a per-user Windows installer that creates Start Menu and Desktop shortcuts.
- **Chronos Portable** — one standalone Windows `.exe` that can be double-clicked without installing the app.

Neither package requires a `.bat` launcher, a separately installed Node.js runtime, or a PostgreSQL service.

## Desktop architecture

| Part | Technology | Purpose |
| --- | --- | --- |
| Desktop host | Electron 45 | Opens the Windows desktop window and manages child processes |
| User interface | Next.js 16, React 19, TypeScript, Recharts, Framer Motion, Lucide | Overview, statistics, heat map, applications, sessions, timeline, achievements and settings |
| Local web server | Next.js standalone output | Serves the UI and the local API on loopback only |
| Database | PGlite + Drizzle ORM | Embedded PostgreSQL-compatible database; no external database service |
| Windows monitor | PowerShell + Win32 P/Invoke | Detects foreground app, desktop, idle/locked state and reports sessions locally |

The local server binds to `127.0.0.1` on an automatically selected available port. It is not exposed to the local network.

## Tracking behavior

- The Windows agent polls locally every 500 ms and sends transitions plus a 5-second heartbeat.
- Foreground detection uses `GetForegroundWindow`, `GetWindowThreadProcessId`, `OpenProcess` and `QueryFullProcessImageNameW`.
- Desktop shell, idle periods, secure desktop/lock state and supported UWP-hosted apps are classified separately.
- If a process cannot be inspected due to Windows permissions, the app records the best available process identity and marks detection as limited. It does not bypass Windows protections.
- Background processes do not add to foreground screen-time totals.
- The agent is started when Chronos opens and stopped when Chronos exits. Keep Chronos open (or minimized) for continuous monitoring.
- The app does not capture keystrokes, clipboard contents, screenshots, audio, video, passwords or browser page contents. Window-title collection is optional and disabled by default.

## Data and backups

Chronos stores its persistent database and backups under:

`%APPDATA%\Chronos\`

Expected subdirectories:

- `database\` — embedded PGlite database
- `backups\` — automatic and manual JSON backups

The database is created automatically on first launch. Timestamps are stored as UTC `timestamptz`; durations are 64-bit integer milliseconds. Daily statistics are derived from session records so they can be rebuilt.

Export formats: JSON, Markdown and TXT. Only Chronos JSON exports can be imported as structured records. Markdown and TXT are human-readable reports and are not database backups.

## First launch and validation

1. Double-click the installed Chronos shortcut or `Chronos-Portable-*.exe`.
2. Allow Chronos to run if Windows prompts about the downloaded executable. Unsigned builds may display a SmartScreen warning.
3. Wait for the dashboard to open; the local database initializes automatically.
4. Switch between Notepad, PowerShell, browser windows and the desktop. Confirm the current app and session list change.
5. Leave the computer idle beyond the configured threshold and confirm Idle is recorded separately.
6. Close and reopen Chronos, then confirm the historical sessions remain.

## Known limitations

- The Windows monitoring agent was authored using documented Win32 APIs but has not been exercised on the user's target Windows installation in this build environment. Verify foreground detection, desktop detection, elevated-process limitations, idle transitions and lock/resume behavior on the target PC.
- UAC secure desktop, protected processes, Windows sign-in screens, disconnected sessions and other OS-protected surfaces may not expose normal foreground-process metadata. Chronos reports detection limitations rather than bypassing OS security.
- The monitor runs while Chronos is open. A Windows service / always-on startup component is not included in this packaging pass.
- The desktop package is not code-signed. Windows SmartScreen may show an unfamiliar-app warning until the binary is signed and its reputation is established.
