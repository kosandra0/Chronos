'use strict';
// UI polish checks on the PACKAGED app (release/win-unpacked/WatchTower.exe, isolated data directory), driven through
// the DevTools protocol with genuine mouse events:
//  - the Level/XP card: same shared design on Overview and Achievements, information kept, hover glow
//  - sliding-digit numbers on Focus, Limits, Productivity, Projects, Reports and Compare
//  - Settings sections transition instead of switching instantly
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const h = require('./helpers.cjs');

const exe = path.join(h.projectRoot, 'release', 'win-unpacked', 'WatchTower.exe');
const skip = !fs.existsSync(exe) && process.env.WATCHTOWER_REQUIRE_PACKAGE !== '1' ? 'packaged app not found (run npm run desktop:dir)' : false;
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const now = new Date();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (n, hh, mm = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, hh, mm).toISOString();

function seedFile() {
  const apps = [['chrome', 'Google Chrome', 'Browsers'], ['notepad', 'Notepad', 'Productivity'], ['game', 'Space Game', 'Gaming']];
  const sess = [['chrome', day(0, 0, 1), day(0, 1, 1)], ['notepad', day(0, 2), day(0, 2, 30)], ['game', day(0, 3), day(0, 3, 10)], ['chrome', day(-8, 9), day(-8, 11)]];
  return {
    schema: 'watchtower-export', schemaVersion: 2, appVersion: '2.0.0', exportedAt: new Date().toISOString(), timezone: tz,
    applications: apps.map(([id, name, category]) => ({ id, identityKey: `${id}.exe`, name, executableName: `${id}.exe`, executablePath: null, category, categoryOverridden: false, detectionStatus: 'ok', elevated: false, firstSeen: day(-9, 9), lastSeen: day(0, 4) })),
    sessions: sess.map(([a, s, e], i) => ({ id: `p${i}`, applicationId: a, startTime: s, endTime: e, durationMs: Date.parse(e) - Date.parse(s), activityType: 'app', terminationReason: null, windowTitle: null, source: 'agent', date: '2000-01-01' })),
    dailyStatistics: [], historicalStatistics: {}, categories: {}, settings: {}, gamification: { totalXp: 0, level: 1, achievements: [] }, backupMetadata: [],
  };
}
const getJson = (url) => new Promise((resolve, reject) => http.get(url, (res) => { const c = []; res.on('data', (x) => c.push(x)); res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(c).toString())); } catch (e) { reject(e); } }); }).on('error', reject));

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.onmessage = (m) => { const j = JSON.parse(m.data); const p = this.pending.get(j.id); if (p) { this.pending.delete(j.id); j.error ? p.reject(new Error(JSON.stringify(j.error))) : p.resolve(j.result); } }; }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  // Test-only wrapper around the DevTools Protocol's Runtime.evaluate: it runs only expressions written in this file,
  // inside a throwaway test instance (isolated temp data dir).
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; }
  async centre(selectorFn) { return this.eval(`(() => { const el = (${selectorFn})(); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); }
  async click(selectorFn) { const pt = await this.centre(selectorFn); if (!pt) return false; for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 }); return true; }
  async hover(selectorFn) { const pt = await this.centre(selectorFn); if (!pt) return false; await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y }); return true; }
  async until(fn, label, timeout = 25000) { const end = Date.now() + timeout; let last; while (Date.now() < end) { try { last = await this.eval(fn); if (last) return last; } catch { /* navigating */ } await sleep(200); } let body = ''; try { body = await this.eval("location.pathname + ' | ' + document.body.innerText.replace(/\s+/g, ' ').slice(0, 220)"); } catch { /* ignore */ } throw new Error(`timeout waiting for ${label} (last=${JSON.stringify(last)}) page=${body}`); }
  // Full-page navigation. A pre-existing, rare hydration hiccup (React #418/#519, also present in 1.1.0/2.0.0 builds) can leave
  // Next's "This page couldn't load" page for a full load; a reload clears it, so retry once like a user would.
  async go(url, ready, label) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.send('Page.navigate', { url });
      try { await this.until(`(${ready.startsWith('!') || ready.includes('&&') || ready.includes('(') ? ready : ready}) || /couldn.t load/.test(document.body.innerText)`, label, 20000); } catch (e) { if (attempt === 2) throw e; continue; }
      if (!(await this.eval(`/couldn.t load/.test(document.body.innerText)`))) return;
      this.reloads = (this.reloads || 0) + 1;
    }
    throw new Error(`page still failing to load after retries: ${label}`);
  }
}

test('level card, sliding numbers and settings transitions in the real window', { skip, timeout: 420000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronos-test-ui-'));
  const dbg = await h.freePort();
  const child = spawn(exe, [`--remote-debugging-port=${dbg}`], { env: { ...process.env, WATCHTOWER_DATA_DIR: dataDir }, stdio: 'ignore' });
  t.after(() => { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } });
  t.after(async () => { await sleep(1500); fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 400 }); });
  let url = null;
  for (let i = 0; i < 240 && !url; i++) { await sleep(500); try { const m = /dashboard ready url=(\S+)/.exec(fs.readFileSync(path.join(dataDir, 'logs', 'watchtower-startup.log'), 'utf8')); if (m) url = m[1]; } catch { /* not yet */ } }
  assert.ok(url, 'app started');
  await h.request(`${url}/api/settings`, { method: 'PATCH', body: { timezone: tz } });
  const imp = await h.request(`${url}/api/import`, { method: 'POST', body: { filename: 'p.json', content: JSON.stringify(seedFile()), mode: 'merge' } });
  assert.equal(imp.json.applied, true, imp.text.slice(0, 200));
  let target; for (let i = 0; i < 60 && !target; i++) { try { target = (await getJson(`http://127.0.0.1:${dbg}/json`)).find((x) => x.type === 'page' && x.url.startsWith(url) && !x.url.includes('/tray')); } catch { /* wait */ } if (!target) await sleep(500); }
  assert.ok(target, 'window found');
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const c = new Cdp(ws); t.after(() => ws.close());
  await c.send('Page.enable'); await c.send('Runtime.enable');

  // ------------------------------------------------ level card: shared design, information kept, hover glow
  const style = (sel) => `(() => { const el = document.querySelector('${sel}'); const cs = getComputedStyle(el); return { border: cs.borderTopColor, shadow: cs.boxShadow, radius: cs.borderTopLeftRadius, blur: cs.backdropFilter || cs.webkitBackdropFilter, cls: el.className, text: (() => { const c = el.cloneNode(true); c.querySelectorAll('.odo').forEach((o) => o.replaceWith(o.getAttribute('aria-label'))); return c.textContent; })(), hasSvg: !!el.querySelector('svg polygon'), hasBar: !!el.querySelector('.lvx-bar > i'), num: el.querySelector('.lvx-num')?.getAttribute('aria-label') }; })()`;
  await c.go(`${url}/`, `!!document.querySelector('[data-testid="level-panel-compact"]')`, 'Overview level card');
  const ov = await c.eval(style('[data-testid="level-panel-compact"]'));
  await c.go(`${url}/achievements`, `!!document.querySelector('[data-testid="level-panel-full"]')`, 'Achievements level card');
  const ac = await c.eval(style('[data-testid="level-panel-full"]'));
  assert.ok(/\blvx\b/.test(ov.cls) && /\blvx\b/.test(ac.cls), 'both tabs use the same shared card class');
  assert.equal(ov.radius, ac.radius, 'same corner radius'); assert.notEqual(ov.blur, 'none', 'glass blur is applied'); assert.ok(ov.hasSvg && ac.hasSvg && ov.hasBar && ac.hasBar, 'crest and progress bar present on both');
  assert.equal(ov.num, ac.num, 'same level shown'); assert.match(ov.text, /XP to level \d+/); assert.match(ac.text, /XP total/); assert.match(ov.text, /achievements/); assert.match(ac.text, /sessions/); assert.match(ac.text, /usage days/); assert.match(ac.text, /active recorded/); assert.match(ac.text, /Gamification notifications/);
  // hover glow: border and shadow change smoothly (measure after the transition)
  const before = await c.eval(style('[data-testid="level-panel-full"]'));
  assert.ok(await c.hover(`() => document.querySelector('[data-testid="level-panel-full"]')`)); await sleep(900);
  const after = await c.eval(style('[data-testid="level-panel-full"]'));
  assert.notEqual(after.shadow, before.shadow, 'the card glows on hover'); assert.notEqual(after.border, before.border, 'the hairline border brightens on hover');
  assert.ok(/rgba?\([^)]*\) 0px 0px 2\dpx/.test(after.shadow) || after.shadow.includes('0px 0px'), 'the glow is a soft spread shadow: ' + after.shadow.slice(0, 120));
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 500 }); await sleep(900);
  assert.equal((await c.eval(style('[data-testid="level-panel-full"]'))).shadow, before.shadow, 'glow fades away again when the cursor leaves');
  // the Overview card sits beside the daily goal like before
  await c.go(`${url}/`, `!!document.querySelector('[data-testid="level-panel-compact"]')`, 'Overview again'); assert.ok(await c.eval(`document.body.innerText.includes('Daily screen-time goal') || document.body.innerText.toLowerCase().includes('daily screen-time goal')`));

  // ------------------------------------------------ sliding digits on the new pages
  const odo = (sel) => `(() => { const root = '${sel}' ? (document.querySelector('${sel}') || document) : document; const strips = [...root.querySelectorAll('.odo .strip')]; return { odo: root.querySelectorAll('.odo').length, strips: strips.length, anim: strips.some((s) => parseFloat(getComputedStyle(s).transitionDuration) > 0), moved: strips.some((s) => /matrix|translate/.test(getComputedStyle(s).transform) && getComputedStyle(s).transform !== 'none') }; })()`;
  const odoWait = async (sel, pred, label) => { let o; for (let i = 0; i < 40; i++) { o = await c.eval(odo(sel)); if (pred(o)) return o; await sleep(200); } assert.fail(`${label}: ${JSON.stringify(o)}`); };
  await c.go(`${url}/focus`, `!!document.querySelector('[data-testid="focus-remaining"] .odo')`, 'Focus timer');
  let o = await odoWait('[data-testid="focus-remaining"]', (x) => x.odo >= 1 && x.strips >= 3 && x.anim, 'Focus timer slides');
  assert.ok(await c.click(`() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Start'))`)); // real click: start a block
  await c.until(`/\\d\\d:\\d\\d/.test(document.querySelector('[data-testid="focus-remaining"]').getAttribute('aria-label') || document.querySelector('[data-testid="focus-remaining"] .odo')?.getAttribute('aria-label') || '') && [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Pause'))`, 'timer running');
  const t1 = await c.eval(`document.querySelector('[data-testid="focus-remaining"] .odo').getAttribute('aria-label')`); await sleep(2600);
  const t2 = await c.eval(`document.querySelector('[data-testid="focus-remaining"] .odo').getAttribute('aria-label')`); assert.notEqual(t1, t2, `the timer counts down live (${t1} -> ${t2})`);
  assert.ok(await c.click(`() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Stop'))`));
  await c.go(`${url}/productivity`, `!!document.querySelector('[data-testid="prod-score"] .odo')`, 'Productivity');
  o = await odoWait('', (x) => x.odo >= 6 && x.anim, 'Productivity numbers slide');
  await c.go(`${url}/projects`, `!!document.querySelector('[data-testid="project-amount"] .odo')`, 'Projects');
  o = await c.eval(odo('')); assert.ok(o.odo >= 3 && o.strips >= 3, `Projects numbers use sliding digits (all values are 0 in this data, so nothing needs to move): ${JSON.stringify(o)}`);
  await c.go(`${url}/reports`, `!!document.querySelector('[data-testid="weekly-report"] .odo')`, 'Reports');
  o = await c.eval(odo('[data-testid="weekly-report"]')); assert.ok(o.odo >= 8 && o.strips >= 8, `Reports numbers use sliding digits: ${JSON.stringify(o)}`);
  assert.ok(await c.click(`() => [...document.querySelectorAll('.seg button')].find((b) => b.textContent.trim() === 'This vs last week')`));
  await c.until(`!!document.querySelector('[data-testid="compare-view"] .odo')`, 'compare numbers'); o = await odoWait('[data-testid="compare-view"]', (x) => x.odo >= 6 && x.anim, 'Compare numbers slide');
  await c.go(`${url}/limits`, `/add a limit/i.test(document.body.innerText)`, 'Limits'); assert.ok(await c.eval(`!!document.querySelector('.page')`));

  // ------------------------------------------------ Settings sections transition (not instant)
  await c.go(`${url}/settings`, `!!document.querySelector('[data-testid="settings-panel"]') && document.querySelectorAll('.set-nav button').length >= 9`, 'Settings');
  assert.ok(await c.eval(`!!document.querySelector('.set-nav .nav-bg')`), 'a sliding highlight pill exists in the settings menu');
  const first = await c.eval(`document.querySelector('[data-testid="settings-panel"]').innerText.slice(0, 40)`);
  // sample the panel's opacity right after the click: a transition produces intermediate values, an instant switch never does
  await c.eval(`window.__ops = []; window.__sampler = setInterval(() => { const p = document.querySelector('[data-testid="settings-panel"]'); if (p) window.__ops.push(+getComputedStyle(p).opacity); }, 16); true`);
  assert.ok(await c.click(`() => [...document.querySelectorAll('.set-nav button')].find((b) => b.textContent.trim() === 'Appearance')`));
  await c.until(`document.body.innerText.includes('App logo')`, 'Appearance content'); await sleep(500);
  const ops = await c.eval(`clearInterval(window.__sampler); window.__ops`);
  const mid = ops.filter((x) => x > 0.03 && x < 0.97);
  assert.ok(mid.length >= 4, `the switch passes through intermediate opacities (${mid.length} samples of ${ops.length}): ${ops.filter((_, i) => i % 3 === 0).map((x) => x.toFixed(2)).join(' ')}`);
  assert.ok(Math.min(...ops) < 0.5, 'the old section fades out first');
  assert.equal(await c.eval(`getComputedStyle(document.querySelector('[data-testid="settings-panel"]')).opacity`), '1', 'the new section ends fully visible');
  assert.notEqual(await c.eval(`document.querySelector('[data-testid="settings-panel"]').innerText.slice(0, 40)`), first, 'content changed');
  // and back, plus a third menu
  for (const label of ['About', 'General']) { assert.ok(await c.click(`() => [...document.querySelectorAll('.set-nav button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`)); await sleep(700); assert.ok(await c.eval(`[...document.querySelectorAll('.set-nav button.active')].some((b) => b.textContent.trim() === ${JSON.stringify(label)})`), `${label} active`); }
});
