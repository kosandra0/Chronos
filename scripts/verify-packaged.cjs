'use strict';
/**
 * End-to-end check of a PACKAGED Chronos executable on Windows.
 *
 *   node scripts/verify-packaged.cjs [path-to-exe]
 *
 * Default exe: release/win-unpacked/WatchTower.exe. Pass the portable exe to test that target.
 * Everything runs against an isolated temporary data directory (WATCHTOWER_DATA_DIR), never the user's
 * real %APPDATA%\Chronos, and the temp directory is removed at the end (only that exact path).
 *
 * Checks: launch without a startup error, structured health, database, PowerShell agent heartbeat,
 * real foreground tracking, window title, single-instance behaviour, clean shutdown with no orphaned
 * processes, and persistence of records across a relaunch.
 */
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const exe = path.resolve(process.argv[2] || path.join(__dirname, '..', 'release', 'win-unpacked', 'WatchTower.exe'));
const results = [];
let failed = false;

function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retries transient socket resets (reported, never hidden) so a busy machine does not cause false failures.
async function get(url, body) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await getOnce(url, body); } catch (error) {
      lastError = error;
      if (!/ECONNRESET|socket hang up|timeout/.test(String(error && error.message))) throw error;
      console.log(`  (retry ${attempt}/3 for ${url}: ${error.message})`);
      await sleep(1000);
    }
  }
  throw lastError;
}

function getOnce(url, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(url, {
      method: body ? 'POST' : 'GET',
      timeout: 8000,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end(data);
  });
}

function killTree(pid) {
  // Kills only the process we launched and its children (server utility process, PowerShell agent).
  try { execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readLog(dataDir) {
  try { return fs.readFileSync(path.join(dataDir, 'logs', 'watchtower-startup.log'), 'utf8'); } catch { return ''; }
}

async function waitFor(fn, timeoutMs, stepMs = 400) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(stepMs);
  }
  return null;
}

function launch(dataDir) {
  const child = spawn(exe, [], {
    env: { ...process.env, WATCHTOWER_DATA_DIR: dataDir },
    stdio: 'ignore',
    windowsHide: false,
  });
  child.exited = false;
  child.on('exit', (code) => { child.exited = true; child.exitCode = code; });
  return child;
}

async function waitReady(dataDir, since = 0) {
  return waitFor(() => {
    const log = readLog(dataDir).slice(since);
    const failure = /STARTUP FAILED category=(\S+) message=(.*)/.exec(log);
    if (failure) return { failure: `${failure[1]}: ${failure[2]}` };
    const ready = /WatchTower dashboard ready url=(\S+) port=(\d+) serverPid=(\d+) agentPid=(\d+) monitoring=(\S+)/.exec(log);
    if (ready) return { url: ready[1], port: Number(ready[2]), serverPid: Number(ready[3]), agentPid: Number(ready[4]), monitoring: ready[5] };
    return null;
  }, 360000); // portable builds extract ~200 MB on every cold start, which can take minutes on a busy PC
}

// For the portable target the launched process is a stub that unpacks and starts the real app;
// the app logs its own PID, which is the one to close.
function appPidFromLog(dataDir, fallback) {
  const all = [...readLog(dataDir).matchAll(/single-instance lock acquired pid=(\d+)/g)];
  return all.length ? Number(all[all.length - 1][1]) : fallback;
}

function mainWindowHandle(pid) {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-Process -Id ' + pid + ').MainWindowHandle.ToInt64()'], { encoding: 'utf8', timeout: 15000 }).trim();
  } catch { return '0'; }
}

function mainWindowTitle(pid) {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).MainWindowTitle`], { encoding: 'utf8', timeout: 15000 }).trim();
  } catch { return ''; }
}

async function closeGracefully(child, info, dataDir) {
  // taskkill without /F asks the app's windows to close (WM_CLOSE), the same as clicking X.
  const target = appPidFromLog(dataDir, child.pid);
  // A close request only reaches a window that is already shown, so wait for the window and retry the request.
  await waitFor(() => mainWindowHandle(target) !== '0', 30000, 500);
  const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
  const closeEnd = Date.now() + 60000;
  let lastTry = 0;
  while (Date.now() < closeEnd && alive(target)) {
    // taskkill without /F asks the app's windows to close (WM_CLOSE), the same as clicking X.
    if (Date.now() - lastTry > 5000) { lastTry = Date.now(); try { execFileSync(taskkill, ['/PID', String(target)], { stdio: 'ignore' }); } catch { /* not closable yet */ } }
    await sleep(500);
  }
  const exited = await waitFor(() => child.exited && !alive(target), 15000);
  record('app closes cleanly after window close', Boolean(exited));
  if (!exited) killTree(child.pid);
  await sleep(1500);
  const log = readLog(dataDir);
  record('shutdown completed (logged)', /shutdown complete/.test(log));
  record('server stopped gracefully (database closed)', /server stopped gracefully/.test(log));
  record('server process gone (no orphan)', !alive(info.serverPid), `pid ${info.serverPid}`);
  record('PowerShell agent gone (no orphan)', !alive(info.agentPid), `pid ${info.agentPid}`);
}

(async () => {
  if (process.platform !== 'win32') { console.error('This verification runs on Windows only.'); process.exit(2); }
  if (!fs.existsSync(exe)) { console.error(`Executable not found: ${exe}`); process.exit(2); }
  const stat = fs.statSync(exe);
  console.log(`Verifying ${exe} (${(stat.size / 1048576).toFixed(1)} MB)`);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronos-e2e-'));
  console.log(`Isolated data dir: ${dataDir}\n`);

  let child = null;
  try {
    // ---------------- first launch
    child = launch(dataDir);
    const info = await waitReady(dataDir);
    record('window/app starts without a startup error', Boolean(info) && !info.failure, info && info.failure ? info.failure : info ? info.url : 'timed out waiting for ready');
    if (!info || info.failure) throw new Error('startup failed - see log below\n' + readLog(dataDir).slice(-3000));

    const health = await get(`${info.url}/api/health`);
    const hj = health.json || {};
    record('/api/health structured and ok', health.status === 200 && hj.ok && hj.database && hj.schema && hj.dataDirectory, JSON.stringify(hj));
    record('server bound to 127.0.0.1 only', /^http:\/\/127\.0\.0\.1:\d+$/.test(info.url));
    record('server process alive', alive(info.serverPid), `pid ${info.serverPid}`);
    record('agent process alive', alive(info.agentPid), `pid ${info.agentPid}`);
    record('monitoring heartbeat verified before window opened', info.monitoring === 'active', `monitoring=${info.monitoring}`);

    const live = await get(`${info.url}/api/live`);
    record('agent heartbeat visible in /api/live', Boolean(live.json && live.json.agent && live.json.agent.active), JSON.stringify(live.json && live.json.agent));
    const tracking = await waitFor(async () => {
      const r = await get(`${info.url}/api/live`);
      return r.json && r.json.current ? r.json.current : null;
    }, 20000);
    record('real foreground activity tracked (current session open)', Boolean(tracking), tracking ? `${tracking.type}: ${tracking.name}` : 'no open session');

    const title = await waitFor(() => { const t = mainWindowTitle(appPidFromLog(dataDir, child.pid)); return t || null; }, 6000, 1000);
    // Frameless/transparent windows may report an empty OS title; accept a real window handle instead.
    const hasWindow = Boolean(title) || mainWindowHandle(appPidFromLog(dataDir, child.pid)) !== '0';
    record('main window exists', hasWindow, title || 'window handle present (frameless, custom title bar)');

    const pageRes = await get(`${info.url}/`);
    record('dashboard HTML served', pageRes.status === 200 && /WatchTower/i.test(pageRes.text));

    // Deterministic record we can look for after a restart.
    const iso = new Date(Date.now() - 120000).toISOString();
    await get(`${info.url}/api/ingest`, { kind: 'app', at: iso, app: { exe: 'e2e-persist-check.exe', path: 'C:\\e2e\\e2e-persist-check.exe', description: 'E2E persistence check', pid: 999999 } });
    await get(`${info.url}/api/ingest`, { kind: 'desktop' });
    const sessions1 = await get(`${info.url}/api/sessions?pageSize=100`);
    record('session inserted and readable', /e2e-persist-check/i.test(sessions1.text));

    // ---------------- single instance
    const logLenBefore = readLog(dataDir).length;
    const second = launch(dataDir);
    const secondExited = await waitFor(() => second.exited, 300000); // portable re-extracts before it can notice the lock
    record('second launch exits (single instance)', Boolean(secondExited));
    if (!secondExited) killTree(second.pid);
    const extra = readLog(dataDir).slice(logLenBefore);
    record('second launch did not start another server', !/starting server:/.test(extra));

    // ---------------- close
    await closeGracefully(child, info, dataDir);

    // ---------------- relaunch against the same data
    const logOffset = readLog(dataDir).length;
    child = launch(dataDir);
    const info2 = await waitReady(dataDir, logOffset);
    record('relaunch starts without a startup error', Boolean(info2) && !info2.failure, info2 && info2.failure ? info2.failure : info2 ? info2.url : 'timed out');
    if (!info2 || info2.failure) throw new Error('relaunch failed\n' + readLog(dataDir).slice(-3000));
    const sessions2 = await get(`${info2.url}/api/sessions?pageSize=100`);
    record('records persisted across restart', /e2e-persist-check/i.test(sessions2.text));
    const h2 = await get(`${info2.url}/api/health`);
    record('relaunch health ok', h2.status === 200 && h2.json && h2.json.ok);
    await closeGracefully(child, info2, dataDir);
    child = null;
  } catch (error) {
    record('verification run', false, String(error && error.message ? error.message : error));
  } finally {
    if (child && !child.exited) killTree(child.pid);
    const startupLogCopy = readLog(dataDir);
    if (failed) console.log('\n----- watchtower-startup.log (tail) -----\n' + startupLogCopy.slice(-4000));
    await sleep(1000);
    // Remove ONLY the isolated temp directory created above.
    if (path.basename(dataDir).startsWith('chronos-e2e-') && path.dirname(dataDir) === os.tmpdir()) {
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) { console.log(`(could not remove temp dir: ${e.message})`); }
    }
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
