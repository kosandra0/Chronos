'use strict';
// WatchTower 1.0 feature checks against the PACKAGED server (isolated temp data directory only):
// new settings, landing-page migration, achievements catalogue and events, heat map + statistics APIs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers.cjs');

const present = fs.existsSync(h.packagedServerDir);
const skip = !present && process.env.WATCHTOWER_REQUIRE_PACKAGE !== '1' ? 'packaged build not found (run npm run desktop:dir)' : false;

test('1.0 settings, achievements, heat map and statistics', { skip, timeout: 300000 }, async (t) => {
  const { root, dest } = h.isolateBundle(h.packagedServerDir);
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir, { recursive: true });
  const port = await h.freePort();
  const srv = h.startServer(dest, dataDir, port);
  t.after(async () => { await h.stopServer(srv); await h.removeDir(root); });
  await h.waitHealthy(srv, port);
  const base = `http://127.0.0.1:${port}`;
  const patch = (body) => h.request(`${base}/api/settings`, { method: 'PATCH', body });
  const settings = async () => (await h.request(`${base}/api/settings`)).json;

  // ---- title bars, name, desktop options
  for (const titleBar of ['windows', 'mac', 'minimal', 'floating', 'classic']) {
    await patch({ titleBar });
    assert.equal((await settings()).titleBar, titleBar);
  }
  await patch({ userName: '   Last   Wayferer   ' });
  assert.equal((await settings()).userName, 'Last Wayferer', 'name is trimmed and whitespace collapsed');
  await patch({ userName: 'x'.repeat(100) });
  assert.equal((await settings()).userName.length, 40, 'name is capped at 40 characters');
  for (const k of ['launchAtStartup', 'startMinimized', 'minimizeToTray', 'closeToTray', 'confirmExit']) {
    assert.equal((await settings())[k], false, `${k} defaults to off`);
    await patch({ [k]: true });
    assert.equal((await settings())[k], true, `${k} saved`);
  }
  await patch({ landing: '/heatmap' });
  assert.equal((await settings()).landing, '/statistics', 'old Heat Map landing page maps to Statistics');

  // ---- seed activity across several apps
  const apps = [['notepad.exe', 'Notepad', 5], ['chrome.exe', 'Google Chrome', 4], ['Code.exe', 'Visual Studio Code', 3]];
  for (const [exe, desc, hrs] of apps) {
    const r = await h.request(`${base}/api/ingest`, { method: 'POST', body: { kind: 'app', at: new Date(Date.now() - hrs * 3600000).toISOString(), app: { exe, path: `C:\\apps\\${exe}`, description: desc, pid: 10 } } });
    assert.equal(r.status, 200, r.text);
  }
  await h.request(`${base}/api/ingest`, { method: 'POST', body: { kind: 'desktop' } });

  // ---- achievements: large catalogue, event unlocks, progress from real data
  let ach = (await h.request(`${base}/api/achievements`)).json;
  assert.ok(ach.achievements.length >= 55, `catalogue has ${ach.achievements.length} achievements`);
  const ids = ach.achievements.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'achievement ids are unique');
  assert.ok(ach.achievements.find((a) => a.id === 'first_session').unlockedAt, 'first_session unlocked from real data');
  assert.ok(ach.achievements.find((a) => a.id === 'apps_5' ) && !ach.achievements.find((a) => a.id === 'apps_5').unlockedAt, 'apps_5 still locked with 3 apps');
  assert.equal(ach.achievements.find((a) => a.id === 'set_name').unlockedAt, null);
  for (const ev of ['set_name', 'change_theme', 'open_palette', 'export_data']) {
    const r = await h.request(`${base}/api/achievements`, { method: 'POST', body: { event: ev } });
    assert.equal(r.status, 200, r.text);
  }
  ach = (await h.request(`${base}/api/achievements`)).json;
  for (const ev of ['set_name', 'change_theme', 'open_palette', 'export_data']) {
    assert.ok(ach.achievements.find((a) => a.id === ev).unlockedAt, `${ev} unlocked by its event`);
  }
  assert.ok(ach.xp >= 50 + 30 + 30 + 40 + 40, `xp accumulates (${ach.xp})`);

  // ---- heat map (now a Statistics tab) and statistics
  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const hm = await h.request(`${base}/api/heatmap?from=${year}-01-01&to=${year}-12-31`);
  assert.equal(hm.status, 200, hm.text);
  assert.ok(Array.isArray(hm.json.cells) && hm.json.cells.length > 0, 'heat map has cells for recorded activity');
  const cellTotal = hm.json.cells.reduce((n, c) => n + c.active, 0);
  const st = await h.request(`${base}/api/stats?from=${year}-01-01&to=${year}-12-31`);
  assert.equal(st.status, 200, st.text);
  assert.ok(st.json.totals.active > 0, 'statistics report active time');
  assert.ok(Math.abs(cellTotal - st.json.totals.active) < 5000, `heat map (${cellTotal}) and statistics (${st.json.totals.active}) agree`);
  const appSum = st.json.apps.reduce((n, a) => n + a.ms, 0);
  assert.ok(Math.abs(appSum + st.json.totals.desktop - st.json.totals.active) < 5000, 'app time + desktop time equals active time');
  assert.ok(st.json.sessions.count >= 4);
  // live: a later request reflects the still-open session growing
  const first = (await h.request(`${base}/api/stats?from=${today}&to=${today}`)).json.totals.active;
  await new Promise((r) => setTimeout(r, 2500));
  const second = (await h.request(`${base}/api/stats?from=${today}&to=${today}`)).json.totals.active;
  assert.ok(second >= first, 'today total never goes backwards while a session is open');

  // ---- every static page route responds
  for (const route of ['/', '/statistics', '/applications', '/sessions', '/timeline', '/achievements', '/settings', '/tray']) {
    const r = await h.request(`${base}${route}`);
    assert.equal(r.status, 200, `${route} -> ${r.status}`);
  }
  const redirect = await h.request(`${base}/heatmap`);
  assert.ok([200, 307, 308].includes(redirect.status), `/heatmap redirect status ${redirect.status}`);
});
