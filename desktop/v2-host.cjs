'use strict';
/**
 * WatchTower 2.0 desktop additions, kept out of main.cjs:
 *  - desktop notifications: polls the local server's outbox (focus, limits, weekly report) and shows each item once
 *  - automatic update flow (check -> notify -> user-initiated download with progress -> user-approved install)
 */
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const childProcess = require('node:child_process');
const updater = require('./updater.cjs');

const POLL_MS = 10000;
const AUTO_CHECK_FIRST_MS = 30000;
const AUTO_CHECK_EVERY_MS = 12 * 3600 * 1000;

function localJson(base, route, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(new URL(route, base), { method, timeout: 8000, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end(data);
  });
}

function init({ app, Notification, shell, dialog, ipcMain, getServerUrl, getDataRoot, showMain, quitReally, trusted, sendToMain, log, net, spawn = childProcess.spawn, autoChecks = true }) {
  const updatesDir = () => path.join(getDataRoot(), 'updates');
  const stateFile = () => path.join(getDataRoot(), 'update-state.json');
  const portable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
  let found = null; // last 'available' result
  let skipped = null;
  let downloaded = null; // { version, file }
  let downloading = false;
  let pendingInstall = null;

  try { skipped = JSON.parse(fs.readFileSync(stateFile(), 'utf8')).skippedVersion || null; } catch { /* first run */ }
  const saveState = () => { try { fs.writeFileSync(stateFile(), JSON.stringify({ skippedVersion: skipped })); } catch { /* non-critical */ } };

  // ---------------- notifications
  let polling = false;
  async function poll() {
    const base = getServerUrl();
    if (!base || polling || !Notification.isSupported()) return;
    polling = true;
    try {
      const { notes } = await localJson(base, '/api/v2/outbox');
      const done = [];
      for (const n of Array.isArray(notes) ? notes : []) {
        if (!n || typeof n.id !== 'string' || typeof n.title !== 'string') continue;
        const note = new Notification({ title: String(n.title).slice(0, 80), body: String(n.body || '').slice(0, 240), silent: true });
        const route = typeof n.route === 'string' && n.route.startsWith('/') ? n.route : '/';
        note.on('click', () => showMain(route));
        note.show();
        done.push(n.id);
        log('INFO', `notification shown: ${n.title}`);
      }
      if (done.length) await localJson(base, '/api/v2/outbox', 'POST', { ids: done });
    } catch { /* server busy or shutting down: try again next time */ } finally { polling = false; }
  }
  const pollTimer = autoChecks ? setInterval(poll, POLL_MS) : null;
  if (pollTimer) pollTimer.unref();

  // ---------------- updates
  async function check({ auto = false } = {}) {
    const result = await updater.checkForUpdate({ currentVersion: app.getVersion(), net });
    if (result.status === 'available') {
      found = result;
      if (auto && skipped === result.version) return { ...result, status: 'none', skipped: true };
      if (auto && Notification.isSupported()) {
        const n = new Notification({ title: `WatchTower ${result.version} is available`, body: 'Open Settings > About to download it.', silent: true });
        n.on('click', () => showMain('/settings?tab=about'));
        n.show();
      }
    }
    return { ...result, portable };
  }

  const guard = (fn) => async (event, ...args) => {
    if (!trusted(event)) return { status: 'error', error: 'Untrusted caller.' };
    return fn(...args);
  };
  ipcMain.handle('wt:update-check', guard(async () => check()));
  ipcMain.handle('wt:update-download', guard(async () => {
    if (!found || found.status !== 'available') return { ok: false, error: 'Check for updates first.' };
    if (portable) return { ok: false, error: 'The portable build cannot update itself. Use the release page.' };
    if (downloading) return { ok: false, error: 'A download is already running.' };
    if (downloaded && downloaded.version === found.version && fs.existsSync(downloaded.file)) return { ok: true, cached: true, version: found.version };
    downloading = true;
    try {
      let last = 0;
      const r = await updater.downloadUpdate({ update: found, dir: updatesDir(), net, onProgress: (p) => { const now = Date.now(); if (now - last > 250 || p.received === p.total) { last = now; sendToMain('wt:update-progress', p); } } });
      if (r.ok) { downloaded = { version: found.version, file: r.file }; log('INFO', `update ${found.version} downloaded and verified (${r.cached ? 'cached' : 'new'})`); }
      else log('WARN', `update download failed: ${r.error}`);
      return { ...r, version: found.version };
    } finally { downloading = false; }
  }));
  ipcMain.handle('wt:update-install', guard(async () => {
    if (!downloaded || !fs.existsSync(downloaded.file)) return { ok: false, error: 'Nothing has been downloaded.' };
    const cmd = updater.buildInstallCommand(downloaded.file, updatesDir());
    const choice = await dialog.showMessageBox({ type: 'question', buttons: ['Install and restart', 'Not now'], defaultId: 0, cancelId: 1, title: 'Install WatchTower update', message: `Install WatchTower ${downloaded.version}?`, detail: 'WatchTower will close, the update will be installed, and WatchTower will start again. Your data and settings are kept.' });
    if (choice.response !== 0) return { ok: false, declined: true };
    pendingInstall = cmd;
    log('INFO', `installing update ${downloaded.version}`);
    quitReally();
    return { ok: true };
  }));
  ipcMain.handle('wt:update-skip', guard(async (version) => { if (updater.parseVersion(version)) { skipped = String(version).replace(/^v/, ''); saveState(); } return { ok: true }; }));
  ipcMain.handle('wt:update-page', guard(async () => { shell.openExternal(updater.RELEASES_PAGE); return { ok: true }; }));

  // The installer starts only after WatchTower has fully shut down (database closed, files unlocked).
  app.once('quit', () => {
    if (!pendingInstall) return;
    try {
      const child = spawn(pendingInstall.file, pendingInstall.args, { detached: true, stdio: 'ignore', windowsHide: false });
      child.unref();
    } catch (error) { log('ERROR', `could not start the installer: ${error.message}`); }
  });

  // automatic checks (can be turned off in Settings); only notify, never download or install on their own
  const autoEnabled = async () => { try { return (await localJson(getServerUrl(), '/api/settings')).updateAutoCheck !== false; } catch { return false; } };
  const auto = async () => { if (await autoEnabled()) await check({ auto: true }).catch(() => {}); };
  if (autoChecks) {
    const t1 = setTimeout(auto, AUTO_CHECK_FIRST_MS); t1.unref();
    const t2 = setInterval(auto, AUTO_CHECK_EVERY_MS); t2.unref();
    void poll();
  }
  return { poll, check };
}

module.exports = { init };
