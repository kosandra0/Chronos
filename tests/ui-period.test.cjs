'use strict';
// Real UI interaction test of the PACKAGED app (release/win-unpacked/WatchTower.exe) with an isolated data directory.
// It drives the real window through the Chrome DevTools Protocol using genuine mouse events (not by calling helpers):
// clicks every period button on Applications, uses the Custom date picker, types into search, navigates to other
// menus and back, reloads, and checks the displayed table each time.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const h = require('./helpers.cjs');
const ranges = require(path.join(__dirname, '..', 'src', 'lib', 'ranges.ts'));

const exe = path.join(h.projectRoot, 'release', 'win-unpacked', 'WatchTower.exe');
const skip = !fs.existsSync(exe) && process.env.WATCHTOWER_REQUIRE_PACKAGE !== '1' ? 'packaged app not found (run npm run desktop:dir)' : false;
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const now = new Date();
const D = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
const at = (d, hh, mm = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).toISOString();
const lastYear = new Date(now.getFullYear() - 1, 5, 15);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function seedFile() {
  const apps = [['chrome', 'Google Chrome', 'Browsers'], ['notepad', 'Notepad', 'Productivity'], ['old', 'Ancient Tool', 'Other']];
  const sess = [['chrome', at(D(0), 0, 1), at(D(0), 1, 1)], ['notepad', at(D(0), 2, 0), at(D(0), 2, 15)], ['chrome', at(D(-1), 8, 0), at(D(-1), 8, 30)], ['old', at(lastYear, 9), at(lastYear, 10)]];
  return {
    schema: 'watchtower-export', schemaVersion: 2, appVersion: '2.0.0', exportedAt: new Date().toISOString(), timezone: tz,
    applications: apps.map(([id, name, category]) => ({ id, identityKey: `${id}.exe`, name, executableName: `${id}.exe`, executablePath: null, category, categoryOverridden: false, detectionStatus: 'ok', elevated: false, firstSeen: at(lastYear, 9), lastSeen: at(D(0), 3) })),
    sessions: sess.map(([a, s, e], i) => ({ id: `u${i}`, applicationId: a, startTime: s, endTime: e, durationMs: Date.parse(e) - Date.parse(s), activityType: 'app', terminationReason: null, windowTitle: null, source: 'agent', date: '2000-01-01' })),
    dailyStatistics: [], historicalStatistics: {}, categories: {}, settings: {}, gamification: { totalXp: 0, level: 1, achievements: [] }, backupMetadata: [],
  };
}

function getJson(url) {
  return new Promise((resolve, reject) => http.get(url, (res) => { const c = []; res.on('data', (x) => c.push(x)); res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c).toString())); } catch (e) { reject(e); } }); }).on('error', reject));
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.onmessage = (m) => { const j = JSON.parse(m.data); const p = this.pending.get(j.id); if (p) { this.pending.delete(j.id); j.error ? p.reject(new Error(JSON.stringify(j.error))) : p.resolve(j.result); } }; }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  // Test-only: wraps the DevTools Protocol's Runtime.evaluate. It only ever runs expressions written in this file,
  // inside a throwaway test instance (isolated temp data dir); no user, file or network data is evaluated.
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; }
  /** Genuine mouse click at the centre of the first element matching the predicate source (returns false if not found). */
  async click(selectorFn) {
    const pt = await this.eval(`(() => { const el = (${selectorFn})(); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!pt) return false;
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
    return true;
  }
  async until(fn, label, timeout = 20000) { const end = Date.now() + timeout; let last; while (Date.now() < end) { try { last = await this.eval(fn); if (last) return last; } catch { /* page navigating */ } await sleep(250); } throw new Error(`timeout waiting for ${label} (last=${JSON.stringify(last)})`); }
}

test('Applications period selector in the real window: ten filters, Custom dates, search, navigation and reload', { skip, timeout: 420000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronos-test-ui-'));
  const dbgPort = await h.freePort();
  const child = spawn(exe, [`--remote-debugging-port=${dbgPort}`], { env: { ...process.env, WATCHTOWER_DATA_DIR: dataDir }, stdio: 'ignore' });
  let appPid = child.pid;
  t.after(() => { try { execFileSync('taskkill', ['/PID', String(appPid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ } });
  t.after(async () => { await sleep(1500); try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 400 }); } catch { /* a scanner may still hold the folder; it is a temp dir, so a failed cleanup must not fail the test */ } });

  // wait for the dashboard to be ready and read its local URL from the startup log
  let url = null;
  for (let i = 0; i < 240 && !url; i++) {
    await sleep(500);
    try { const log = fs.readFileSync(path.join(dataDir, 'logs', 'watchtower-startup.log'), 'utf8'); const m = /dashboard ready url=(\S+)/.exec(log); if (m) url = m[1]; } catch { /* not yet */ }
  }
  assert.ok(url, 'the packaged app started');
  await h.request(`${url}/api/settings`, { method: 'PATCH', body: { timezone: tz } });
  const imp = await h.request(`${url}/api/import`, { method: 'POST', body: { filename: 'ui.json', content: JSON.stringify(seedFile()), mode: 'merge' } });
  assert.equal(imp.json.applied, true, imp.text.slice(0, 200));

  let target;
  for (let i = 0; i < 60 && !target; i++) { try { target = (await getJson(`http://127.0.0.1:${dbgPort}/json`)).find((x) => x.type === 'page' && x.url.startsWith(url) && !x.url.includes('/tray')); } catch { /* debugger not ready */ } if (!target) await sleep(500); }
  assert.ok(target, 'found the app window through the debugging port');
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const c = new Cdp(ws); t.after(() => ws.close());
  await c.send('Page.enable'); await c.send('Runtime.enable');
  await c.send('Page.navigate', { url: `${url}/applications` });
  const BTN = (label) => `() => [...document.querySelectorAll('.seg button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;
  const state = `(() => ({ on: [...document.querySelectorAll('.seg button.on')].map((b) => b.textContent.trim()), rows: [...document.querySelectorAll('table.tbl tbody tr')].filter((r) => ['Google Chrome', 'Notepad', 'Ancient Tool'].some((n) => r.children[0].textContent.includes(n))).map((r) => [...r.children].map((x) => { const o = x.querySelector('.odo'); return o ? o.getAttribute('aria-label') : x.textContent.trim(); })), empty: /No application activity in this period|No applications match/.test(document.body.innerText), range: document.body.innerText.match(/\\d{4}-\\d{2}-\\d{2}( → \\d{4}-\\d{2}-\\d{2})?|All time/g) }))()`;
  await c.until(`document.querySelectorAll('.seg button').length >= 10 && document.querySelectorAll('table.tbl tbody tr').length > 0`, 'Applications page with data');

  // the ten options are present, in order, with the same labels as Statistics
  const labels = await c.eval(`[...document.querySelectorAll('.seg')].find((s) => s.textContent.includes('Yesterday'))?.innerText.split('\\n').map((x) => x.trim()).filter(Boolean)`);
  assert.deepEqual(labels, ['Today', 'Yesterday', 'This Week', 'Last Week', 'This Month', 'Last Month', 'This Year', 'Last Year', 'All Time', 'Custom']);
  assert.deepEqual((await c.eval(state)).on, ['All Time'], 'Applications keeps its existing all-time behaviour by default');
  let s = await c.eval(state); assert.equal(s.rows.length, 3, 'All Time lists all applications');
  const names = (st) => st.rows.map((r) => r[0].split('\n')[0].replace(/\s+/g, ' ').trim().replace(/\s*[a-z0-9_.-]+\.exe.*$/i, ''));

  async function pick(label, wantNames) {
    assert.ok(await c.click(BTN(label)), `click ${label}`);
    try { await c.until(`(() => { const s = ${state}; const want = ${JSON.stringify(wantNames)}; return s.on.includes(${JSON.stringify(label)}) && (want.length ? s.rows.length === want.length && want.every((n) => s.rows.some((r) => r[0].includes(n))) : s.rows.length === 0); })()`, `${label} table`); } catch (e) { throw new Error(`${e.message} state=${JSON.stringify(await c.eval(state))}`); }
    return c.eval(state);
  }
  const hms = (ms) => { const sec = Math.floor(ms / 1000); return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((x) => String(x).padStart(2, '0')).join(':'); };

  s = await pick('Today', ['Google Chrome', 'Notepad']);
  const row = (st, n) => st.rows.find((r) => r[0].includes(n));
  assert.equal(row(s, 'Google Chrome')[2], hms(60 * 60000), 'Today: Chrome shows only today\'s hour'); assert.equal(row(s, 'Google Chrome')[4], '1', 'Today: one session'); assert.equal(row(s, 'Notepad')[2], hms(15 * 60000));
  assert.ok(s.range.includes(ranges.ymd(D(0))), 'the selected date is displayed');
  s = await pick('Yesterday', ['Google Chrome']); assert.equal(row(s, 'Google Chrome')[2], hms(30 * 60000), 'Yesterday: only yesterday\'s 30 minutes');
  for (const [label, preset] of [['This Week', 'thisWeek'], ['Last Week', 'lastWeek'], ['This Month', 'thisMonth'], ['Last Month', 'lastMonth'], ['This Year', 'thisYear'], ['Last Year', 'lastYear']]) {
    const range = ranges.resolvePreset(preset);
    const lo = Date.parse(`${range.from}T00:00:00`), hi = Date.parse(`${range.to}T00:00:00`) + 86400000;
    const exp = new Map();
    for (const [a, st, en] of [['Google Chrome', Date.parse(at(D(0), 0, 1)), Date.parse(at(D(0), 1, 1))], ['Notepad', Date.parse(at(D(0), 2)), Date.parse(at(D(0), 2, 15))], ['Google Chrome', Date.parse(at(D(-1), 8)), Date.parse(at(D(-1), 8, 30))], ['Ancient Tool', Date.parse(at(lastYear, 9)), Date.parse(at(lastYear, 10))]]) {
      const x = Math.max(st, lo), y = Math.min(en, hi); if (y > x) exp.set(a, (exp.get(a) ?? 0) + (y - x));
    }
    s = await pick(label, [...exp.keys()]);
    for (const [name, ms] of exp) assert.equal(row(s, name)[2], hms(ms), `${label}: ${name}`);
    if (exp.size === 0) assert.equal(s.rows.length, 0, `${label}: no stale rows from the previous range`);
  }
  s = await pick('All Time', ['Google Chrome', 'Notepad', 'Ancient Tool']); assert.equal(row(s, 'Google Chrome')[2], hms(90 * 60000), 'All Time: lifetime usage'); assert.equal(row(s, 'Google Chrome')[4], '2');

  // ---- Custom: date pickers appear, Apply uses the exact interval
  assert.ok(await c.click(BTN('Custom')));
  await c.until(`!!document.querySelector('input[type=date]')`, 'custom date inputs');
  const setDate = (idx, v) => c.eval(`(() => { const el = document.querySelectorAll('input[type=date]')[${idx}]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()`);
  const from = ranges.ymd(D(-1)), to = ranges.ymd(D(0));
  assert.equal(await setDate(0, from), from); assert.equal(await setDate(1, to), to);
  assert.ok(await c.click(`() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Apply')`));
  await c.until(`(() => { const s = ${state}; return s.on.includes('Custom') && s.rows.some((r) => r[0].includes('Google Chrome') && r[2] === '01:30:00'); })()`, 'custom range applied');
  s = await c.eval(state); assert.equal(row(s, 'Google Chrome')[2], hms(90 * 60000), 'Custom yesterday..today: 30 + 60 minutes'); assert.equal(row(s, 'Google Chrome')[4], '2'); assert.equal(row(s, 'Notepad')[2], hms(15 * 60000));
  assert.ok(s.range.some((x) => x.includes(from) && x.includes(to)), 'the custom dates are displayed');
  // an interval with no activity shows the proper empty state
  assert.equal(await setDate(0, ranges.ymd(D(-400))), ranges.ymd(D(-400))); assert.equal(await setDate(1, ranges.ymd(D(-390))), ranges.ymd(D(-390)));
  assert.ok(await c.click(`() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Apply')`));
  await c.until(`(() => { const s = ${state}; return s.rows.length === 0 && s.empty; })()`, 'empty custom range');
  assert.equal(await setDate(0, from), from); assert.equal(await setDate(1, to), to);
  assert.ok(await c.click(`() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Apply')`));
  await c.until(`(() => { const s = ${state}; return s.rows.some((r) => r[0].includes('Google Chrome') && r[2] === '01:30:00'); })()`, 'custom range restored');

  // ---- search narrows the list WITHOUT resetting the period
  const typeSearch = (v) => c.eval(`(() => { const el = document.querySelector('input[aria-label="Search applications"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await typeSearch('notepad');
  await c.until(`(() => { const s = ${state}; return s.rows.length === 1 && s.on.includes('Custom'); })()`, 'search + custom period');
  s = await c.eval(state); assert.equal(row(s, 'Notepad')[2], hms(15 * 60000));
  await typeSearch('');
  await c.until(`${state}.rows.length === 2`, 'search cleared');

  // ---- the selection survives navigating to other menus and back
  const NAV = (label) => `() => [...document.querySelectorAll('nav a')].find((a) => a.textContent.trim() === ${JSON.stringify(label)})`;
  assert.ok(await c.click(NAV('Statistics')));
  await c.until(`location.pathname === '/statistics' && document.querySelectorAll('.seg button').length >= 10`, 'Statistics page');
  const stats = await c.eval(`[...document.querySelectorAll('.seg button.on')].map((b) => b.textContent.trim())`);
  assert.ok(stats.includes('This Week'), `Statistics keeps its own range (this week), got ${stats}`);
  assert.ok(await c.click(BTN('Today'))); // change Statistics' range: must not leak into Applications
  assert.ok(await c.click(NAV('Applications')));
  await c.until(`location.pathname === '/applications' && document.querySelectorAll('table.tbl tbody tr').length > 0`, 'back on Applications');
  s = await c.eval(state); assert.deepEqual(s.on, ['Custom'], 'Applications remembered Custom'); assert.equal(s.rows.length, 2);
  assert.equal(await c.eval(`document.querySelectorAll('input[type=date]')[0].value`), from, 'Custom start date remembered'); assert.equal(await c.eval(`document.querySelectorAll('input[type=date]')[1].value`), to, 'Custom end date remembered');
  assert.ok(s.range.some((x) => x.includes(from)));
  // reload keeps it too (restart persistence)
  await c.send('Page.reload'); await c.until(`${state}.rows.length === 2 && [...document.querySelectorAll('.seg button.on')].some((b) => b.textContent.trim() === 'Custom')`, 'reloaded with the saved range');
  // Yesterday then through a different menu (Sessions) and back
  assert.ok(await c.click(BTN('Yesterday'))); await c.until(`${state}.rows.length === 1`, 'yesterday again');
  assert.ok(await c.click(NAV('Sessions'))); await c.until(`location.pathname === '/sessions'`, 'sessions page');
  assert.ok(await c.click(NAV('Applications'))); await c.until(`location.pathname === '/applications' && [...document.querySelectorAll('.seg button.on')].some((b) => b.textContent.trim() === 'Yesterday') && ${state}.rows.length === 1`, 'Yesterday remembered');
  const dump = await c.eval(`!!document.querySelector('input[aria-label="Search applications"]')`); assert.equal(dump, true, 'the existing toolbar (search, sort, category) is intact');
  assert.ok(await c.eval(`!!document.querySelector('[aria-label="Sort"]') && !!document.querySelector('[aria-label="Category"]') && /application/.test(document.body.innerText)`), 'sort dropdown, category filter and application count still present');
});
