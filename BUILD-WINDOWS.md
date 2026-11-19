# Build Chronos Windows executables

Chronos is packaged as a Windows desktop application. The end-user does **not** need Node.js, npm, PostgreSQL, or a `.bat` launcher installed.

## What the package contains

- Electron desktop window and local Next.js application server
- Embedded PGlite (PostgreSQL-compatible) database
- Win32 monitoring agent, started and stopped by the desktop host
- Local data and automatic backups under `%APPDATA%\Chronos`

## Recommended: build on GitHub Actions

1. Create a GitHub repository and upload/push this project to its `main` branch.
2. Open the repository's **Actions** tab.
3. Select **Build Chronos for Windows** and choose **Run workflow** (or let the workflow run after pushing to `main`).
4. Open the completed workflow run and download the `Chronos-Windows-x64` artifact.
5. The artifact contains the Windows `.exe` installer and portable `.exe`.

The workflow uses a Windows runner, performs a TypeScript check, builds the standalone Next server, and packages both Windows x64 targets.

## Build locally on Windows

Install Node.js 24 LTS/current and Git. Then open PowerShell in this project directory and run:

```powershell
npm install
npm run typecheck
npm run desktop:package
```

The `.exe` files are written to `release\`.

## End-user launch

- **Installer:** double-click the Chronos setup `.exe`, complete setup, then launch Chronos from the Desktop or Start menu.
- **Portable:** double-click `Chronos-Portable-*.exe`. No `.bat` file or separate database service is required.

Chronos stores its database and backups in the current Windows user's `%APPDATA%\Chronos` directory. The app starts its local server and PowerShell Win32 activity monitor automatically when opened.

## First build caveat

This project was supplied as a Next.js/PostgreSQL web project, not a ready-made Windows desktop app. The desktop host and embedded database were added here. The uploaded build environment is Linux with outbound package-network access disabled, so the Windows package must be compiled on a Windows runner (the included workflow does this). Do not distribute an untested artifact as a production release until it has been run through the monitoring checks on a real Windows PC.
