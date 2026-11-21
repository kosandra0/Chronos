'use strict';
// Auto-update tests with MOCKED release metadata and a mocked network. Nothing is downloaded from GitHub and
// nothing is published. Also covers the code-signing configuration/state detection.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const u = require('../desktop/updater.cjs');
const host = require('../desktop/v2-host.cjs');
const signing = require('../scripts/signing-status.cjs');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const INSTALLER = Buffer.alloc(300000, 7);
const base = (v) => `https://github.com/kosandra0/WatchTower/releases/download/v${v}/`;
function release(v = '2.1.0', over = {}) {
  return {
    tag_name: `v${v}`, draft: false, prerelease: false, body: 'Notes for ' + v, published_at: '2026-12-01T00:00:00Z',
    assets: [
      { name: `WatchTower-Setup-${v}.exe`, size: INSTALLER.length, browser_download_url: `${base(v)}WatchTower-Setup-${v}.exe` },
      { name: `WatchTower-Portable-${v}-x64.exe`, size: 1000, browser_download_url: `${base(v)}WatchTower-Portable-${v}-x64.exe` },
      { name: 'SHA256SUMS.txt', size: 200, browser_download_url: `${base(v)}SHA256SUMS.txt` },
    ],
    ...over,
  };
}
const sumsText = (v, buf = INSTALLER) => `${sha(buf)}  WatchTower-Setup-${v}.exe\n${'a'.repeat(64)}  WatchTower-Portable-${v}-x64.exe\n`;
function mockNet({ rel, sums, body = INSTALLER, failAt = null, apiError = null } = {}) {
  const calls = { stream: 0, text: 0 };
  return {
    calls,
    async getJson() { if (apiError) throw new Error(apiError); return rel; },
    async getText() { calls.text++; return sums; },
    async stream(url, onChunk) {
      calls.stream++;
      for (let i = 0; i < body.length; i += 50000) {
        if (failAt !== null && i >= failAt) throw new Error('connection reset');
        onChunk(body.subarray(i, i + 50000));
      }
    },
  };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'chronos-test-upd-'));

test('version parsing and comparison', () => {
  assert.equal(u.compareVersions('2.0.0', '1.9.9'), 1); assert.equal(u.compareVersions('1.10.0', '1.9.0'), 1, 'numeric, not lexical');
  assert.equal(u.compareVersions('v2.0.0', '2.0.0'), 0); assert.equal(u.compareVersions('2.0.0', '2.0.1'), -1);
  for (const bad of ['2.0', '2.0.0-beta', 'latest', '', '2.0.0.1', '../2.0.0', null]) assert.equal(u.parseVersion(bad), null, String(bad));
  assert.throws(() => u.compareVersions('x', '1.0.0'));
});

test('release validation: none, available and invalid metadata', () => {
  assert.deepEqual(u.validateRelease(release('2.0.0'), { currentVersion: '2.0.0', platform: 'win32', arch: 'x64' }), { ok: true, upToDate: true, version: '2.0.0' }, 'same version');
  assert.equal(u.validateRelease(release('1.9.0'), { currentVersion: '2.0.0', platform: 'win32', arch: 'x64' }).upToDate, true, 'older release is not an update');
  const v = u.validateRelease(release('2.1.0'), { currentVersion: '2.0.0', platform: 'win32', arch: 'x64' });
  assert.equal(v.ok, true); assert.equal(v.upToDate, false); assert.equal(v.update.version, '2.1.0'); assert.equal(v.update.installer.name, 'WatchTower-Setup-2.1.0.exe'); assert.ok(v.update.portable);
  const bad = (r, why) => { const x = u.validateRelease(r, { currentVersion: '2.0.0', platform: 'win32', arch: 'x64' }); assert.equal(x.ok, false, why); return x.reason; };
  bad(null, 'null'); bad([], 'array'); bad('x', 'string');
  bad(release('2.1.0', { draft: true }), 'draft'); bad(release('2.1.0', { prerelease: true }), 'prerelease');
  bad(release('2.1.0', { tag_name: 'nightly' }), 'tag'); bad(release('2.1.0', { tag_name: 'v2.1.0-rc1' }), 'rc tag'); bad(release('2.1.0', { assets: 'x' }), 'assets');
  const r1 = release('2.1.0'); r1.assets[0].browser_download_url = 'https://evil.example/WatchTower-Setup-2.1.0.exe'; bad(r1, 'foreign host');
  const r2 = release('2.1.0'); r2.assets[0].browser_download_url = 'http://github.com/kosandra0/WatchTower/releases/download/v2.1.0/WatchTower-Setup-2.1.0.exe'; bad(r2, 'plain http');
  const r3 = release('2.1.0'); r3.assets[0].browser_download_url = 'https://github.com/someone-else/WatchTower/releases/download/v2.1.0/WatchTower-Setup-2.1.0.exe'; bad(r3, 'other repository');
  const r4 = release('2.1.0'); r4.assets = r4.assets.filter((a) => a.name !== 'SHA256SUMS.txt'); assert.match(bad(r4, 'no checksum'), /SHA256SUMS/);
  const r5 = release('2.1.0'); r5.assets[0].size = 0; bad(r5, 'size');
  const r6 = release('2.1.0'); r6.assets[0].size = 9e12; bad(r6, 'huge');
  const r7 = release('2.1.0'); r7.assets = r7.assets.slice(1); bad(r7, 'no installer');
  assert.equal(u.validateRelease(release('2.1.0'), { currentVersion: '2.0.0', platform: 'linux', arch: 'x64' }).ok, false, 'platform');
  assert.equal(u.validateRelease(release('2.1.0'), { currentVersion: '2.0.0', platform: 'win32', arch: 'arm64' }).ok, false, 'arch');
  assert.equal(u.validateRelease(release('2.1.0'), { currentVersion: 'bad', platform: 'win32', arch: 'x64' }).ok, false);
});

test('trusted urls and checksum parsing', () => {
  assert.equal(u.isTrustedUrl('https://github.com/a/b'), true); assert.equal(u.isTrustedUrl('https://objects.githubusercontent.com/x'), true);
  for (const bad of ['http://github.com/x', 'https://github.com.evil.com/x', 'https://evilgithub.com/x', 'ftp://github.com/x', 'file:///c:/x', 'https://user:pw@github.com/x', 'nonsense']) assert.equal(u.isTrustedUrl(bad), false, bad);
  const m = u.parseChecksums(`${'A'.repeat(64)}  a.exe\r\n${'b'.repeat(64)} *b.exe\ngarbage\n${'c'.repeat(10)}  short.exe\n`);
  assert.equal(m.get('a.exe'), 'a'.repeat(64)); assert.equal(m.get('b.exe'), 'b'.repeat(64)); assert.equal(m.size, 2);
});

test('checkForUpdate: no update, update available, errors', async () => {
  const none = await u.checkForUpdate({ currentVersion: '2.0.0', net: mockNet({ rel: release('2.0.0') }), platform: 'win32', arch: 'x64' });
  assert.equal(none.status, 'none');
  const yes = await u.checkForUpdate({ currentVersion: '2.0.0', net: mockNet({ rel: release('2.1.0') }), platform: 'win32', arch: 'x64' });
  assert.equal(yes.status, 'available'); assert.equal(yes.version, '2.1.0'); assert.equal(yes.notes, 'Notes for 2.1.0'); assert.equal(yes.current, '2.0.0');
  const offline = await u.checkForUpdate({ currentVersion: '2.0.0', net: mockNet({ apiError: 'getaddrinfo ENOTFOUND' }) });
  assert.equal(offline.status, 'error'); assert.match(offline.error, /Could not check/);
  const invalid = await u.checkForUpdate({ currentVersion: '2.0.0', net: mockNet({ rel: { tag_name: 'v9.9.9', assets: [] } }), platform: 'win32', arch: 'x64' });
  assert.equal(invalid.status, 'error');
  const html = await u.checkForUpdate({ currentVersion: '2.0.0', net: { getJson: async () => { throw new SyntaxError('Unexpected token <'); } } });
  assert.equal(html.status, 'error');
});

test('download: verified install file, progress, cache (no repeat download), failures cleaned up', async () => {
  const dir = tmp();
  const update = (await u.checkForUpdate({ currentVersion: '2.0.0', net: mockNet({ rel: release('2.1.0') }), platform: 'win32', arch: 'x64' }));
  const progress = [];
  const net = mockNet({ rel: null, sums: sumsText('2.1.0') });
  const r = await u.downloadUpdate({ update, dir, net, onProgress: (p) => progress.push(p) });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.cached, false); assert.ok(fs.existsSync(r.file)); assert.equal(sha(fs.readFileSync(r.file)), sha(INSTALLER));
  assert.ok(progress.length >= 3 && progress.at(-1).received === INSTALLER.length, 'progress reported up to 100%'); assert.ok(!fs.existsSync(`${r.file}.part`));
  const again = await u.downloadUpdate({ update, dir, net });
  assert.equal(again.ok, true); assert.equal(again.cached, true); assert.equal(net.calls.stream, 1, 'the same version is not downloaded twice');

  const dir2 = tmp();
  const tampered = await u.downloadUpdate({ update, dir: dir2, net: mockNet({ sums: sumsText('2.1.0', Buffer.alloc(300000, 9)) }) });
  assert.equal(tampered.ok, false); assert.match(tampered.error, /Integrity/); assert.equal(fs.readdirSync(dir2).length, 0, 'tampered file not kept');
  const dir3 = tmp();
  const cut = await u.downloadUpdate({ update, dir: dir3, net: mockNet({ sums: sumsText('2.1.0'), failAt: 100000 }) });
  assert.equal(cut.ok, false); assert.match(cut.error, /connection reset/); assert.equal(fs.readdirSync(dir3).length, 0, 'partial download removed');
  const dir4 = tmp();
  const short = await u.downloadUpdate({ update, dir: dir4, net: mockNet({ sums: sumsText('2.1.0'), body: INSTALLER.subarray(0, 100000) }) });
  assert.equal(short.ok, false); assert.match(short.error, /incomplete/);
  const dir5 = tmp();
  const noEntry = await u.downloadUpdate({ update, dir: dir5, net: mockNet({ sums: `${'a'.repeat(64)}  other.exe\n` }) });
  assert.equal(noEntry.ok, false); assert.match(noEntry.error, /no entry/);
  const evil = await u.downloadUpdate({ update: { ...update, installer: { ...update.installer, url: 'https://evil.example/a.exe' } }, dir: tmp(), net });
  assert.equal(evil.ok, false); assert.match(evil.error, /not trusted/);
  const traversal = await u.downloadUpdate({ update: { ...update, installer: { ...update.installer, name: '..\\evil.exe' } }, dir: tmp(), net });
  assert.equal(traversal.ok, false);
  for (const d of [dir, dir2, dir3, dir4, dir5]) fs.rmSync(d, { recursive: true, force: true });
});

test('install command only accepts a downloaded WatchTower installer', () => {
  const dir = tmp();
  const ok = u.buildInstallCommand(path.join(dir, 'WatchTower-Setup-2.1.0.exe'), dir);
  assert.deepEqual(ok.args, ['/S', '--force-run']);
  assert.throws(() => u.buildInstallCommand(path.join(dir, 'evil.exe'), dir));
  assert.throws(() => u.buildInstallCommand(path.join(os.tmpdir(), 'WatchTower-Setup-2.1.0.exe'), dir));
  assert.throws(() => u.buildInstallCommand(path.join(dir, '..', 'WatchTower-Setup-2.1.0.exe'), dir));
  fs.rmSync(dir, { recursive: true, force: true });
});

// Simulates the Electron host: IPC handlers are collected and called as the renderer would.
function fakeHost({ net, dialogResponse = 0, version = '2.0.0' }) {
  const handlers = new Map(); const sent = []; const spawned = []; const events = {}; let quitCalled = 0;
  const dataRoot = tmp();
  const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn) };
  const app = { getVersion: () => version, once: (ev, fn) => { events[ev] = fn; } };
  host.init({
    app, Notification: Object.assign(function () {}, { isSupported: () => false }), shell: { openExternal() {} }, ipcMain,
    dialog: { showMessageBox: async () => ({ response: dialogResponse }) },
    getServerUrl: () => null, getDataRoot: () => dataRoot, showMain() {}, quitReally: () => { quitCalled++; }, trusted: () => true,
    sendToMain: (c, p) => sent.push([c, p]), log() {}, net, spawn: (f, a) => { spawned.push([f, a]); return { unref() {} }; }, autoChecks: false,
  });
  const call = (ch, ...a) => handlers.get(ch)({}, ...a);
  return { call, sent, spawned, events, dataRoot, quit: () => quitCalled };
}

test('simulated update flow: check -> download -> user approves -> installer starts only after quit', async () => {
  const h = fakeHost({ net: mockNet({ rel: release('2.1.0'), sums: sumsText('2.1.0') }) });
  assert.equal((await h.call('wt:update-install')).ok, false, 'nothing to install before a download');
  assert.equal((await h.call('wt:update-download')).ok, false, 'download requires a check first');
  const info = await h.call('wt:update-check'); assert.equal(info.status, 'available'); assert.equal(info.version, '2.1.0');
  const d = await h.call('wt:update-download'); assert.equal(d.ok, true, JSON.stringify(d)); assert.ok(h.sent.some(([c]) => c === 'wt:update-progress'));
  const again = await h.call('wt:update-download'); assert.equal(again.cached, true, 'no repeated download');
  assert.equal(h.spawned.length, 0, 'nothing runs before the user agrees');
  const inst = await h.call('wt:update-install'); assert.equal(inst.ok, true); assert.equal(h.quit(), 1, 'the app is asked to quit');
  assert.equal(h.spawned.length, 0, 'installer waits until the app has actually quit');
  h.events.quit(); assert.equal(h.spawned.length, 1); assert.match(path.basename(h.spawned[0][0]), /^WatchTower-Setup-2\.1\.0\.exe$/); assert.deepEqual(h.spawned[0][1], ['/S', '--force-run']);
  fs.rmSync(h.dataRoot, { recursive: true, force: true });
});

test('simulated update flow: user declines, no update, failed download', async () => {
  const dec = fakeHost({ net: mockNet({ rel: release('2.1.0'), sums: sumsText('2.1.0') }), dialogResponse: 1 });
  await dec.call('wt:update-check'); await dec.call('wt:update-download');
  const r = await dec.call('wt:update-install'); assert.equal(r.ok, false); assert.equal(r.declined, true);
  assert.equal(dec.quit(), 0, 'declining does not quit'); assert.equal(dec.events.quit, undefined === dec.events.quit ? undefined : dec.events.quit); dec.events.quit && dec.events.quit(); assert.equal(dec.spawned.length, 0, 'declined update never starts the installer');
  const none = fakeHost({ net: mockNet({ rel: release('2.0.0') }) }); assert.equal((await none.call('wt:update-check')).status, 'none');
  const bad = fakeHost({ net: mockNet({ rel: release('2.1.0'), sums: sumsText('2.1.0'), failAt: 50000 }) });
  await bad.call('wt:update-check'); const f = await bad.call('wt:update-download'); assert.equal(f.ok, false); assert.match(f.error, /connection reset/);
  assert.equal((await bad.call('wt:update-install')).ok, false, 'a failed download cannot be installed');
  const skip = fakeHost({ net: mockNet({ rel: release('2.1.0') }) }); assert.equal((await skip.call('wt:update-skip', '2.1.0')).ok, true); assert.equal((await skip.call('wt:update-skip', 'junk')).ok, true);
  const untrusted = (() => { const handlers = new Map(); host.init({ app: { getVersion: () => '2.0.0', once() {} }, Notification: { isSupported: () => false }, shell: {}, dialog: {}, ipcMain: { handle: (c, f) => handlers.set(c, f) }, getServerUrl: () => null, getDataRoot: () => tmp(), showMain() {}, quitReally() {}, trusted: () => false, sendToMain() {}, log() {}, autoChecks: false }); return handlers; })();
  assert.equal((await untrusted.get('wt:update-check')({})).status, 'error', 'calls from untrusted pages are refused');
  for (const x of [dec, none, bad, skip]) fs.rmSync(x.dataRoot, { recursive: true, force: true });
});

test('code signing: configuration and signature state detection', () => {
  assert.deepEqual(signing.detectSigningConfig({}), { configured: false, method: null, missing: ['CSC_LINK (certificate .pfx) or CSC_NAME (installed certificate)', 'CSC_KEY_PASSWORD'] });
  assert.equal(signing.detectSigningConfig({ CSC_LINK: 'C:\\cert.pfx' }).configured, false, 'certificate without password');
  assert.deepEqual(signing.detectSigningConfig({ CSC_LINK: 'C:\\cert.pfx' }).missing, ['CSC_KEY_PASSWORD']);
  assert.equal(signing.detectSigningConfig({ CSC_LINK: 'C:\\cert.pfx', CSC_KEY_PASSWORD: 'x' }).configured, true);
  assert.equal(signing.detectSigningConfig({ WIN_CSC_LINK: 'a', WIN_CSC_KEY_PASSWORD: 'b' }).method, 'certificate-file');
  assert.equal(signing.detectSigningConfig({ CSC_NAME: 'My Company' }).method, 'certificate-store');
  assert.ok(!JSON.stringify(signing.detectSigningConfig({ CSC_LINK: 'a', CSC_KEY_PASSWORD: 'SECRET123' })).includes('SECRET123'), 'secrets are never reported');
  assert.equal(signing.interpretSignature({ Status: 'NotSigned' }).state, 'unsigned');
  const ok = signing.interpretSignature({ Status: 'Valid', Subject: 'CN=Acme', Thumbprint: 'AB' }); assert.equal(ok.state, 'signed'); assert.equal(ok.valid, true);
  assert.equal(signing.interpretSignature({ Status: 'UnknownError', Subject: 'CN=Self' }).valid, false, 'untrusted / self-signed is not valid');
  assert.equal(signing.interpretSignature({ Status: 'HashMismatch', Subject: 'CN=Acme' }).state, 'signed-but-not-trusted');
  assert.equal(signing.interpretSignature(null).valid, false);
});

test('code signing: a real unsigned file is reported as unsigned by Windows', { skip: process.platform !== 'win32' }, () => {
  const f = path.join(tmp(), 'plain.exe'); fs.writeFileSync(f, Buffer.from('MZ' + 'x'.repeat(200)));
  const r = signing.readSignature(f);
  assert.equal(r.valid, false, 'a non-signed file is never reported valid'); assert.ok(['NotSigned', 'UnknownError'].includes(r.status), 'Windows returned a real status: ' + JSON.stringify(r));
  const sys = signing.readSignature(path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'notepad.exe'));
  assert.equal(sys.valid, true, 'a Microsoft-signed system file is reported as validly signed: ' + JSON.stringify(sys));
  fs.rmSync(path.dirname(f), { recursive: true, force: true });
});
