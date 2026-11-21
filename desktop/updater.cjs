'use strict';
/**
 * WatchTower updater core: discovers stable releases of the OFFICIAL repository over HTTPS, validates the release
 * metadata, downloads the installer with progress, verifies its SHA-256 against the release's SHA256SUMS.txt and
 * only then offers it for installation. Nothing is executed without the user's consent (the host asks first).
 *
 * Network and filesystem access are injected so every path can be tested with mocked metadata.
 * Trust model: the HTTPS release source of kosandra0/WatchTower + a SHA-256 checksum published in the same
 * release. The builds are not code-signed yet, so checksum verification is the integrity mechanism (see BUILD-WINDOWS.md).
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const REPO = 'kosandra0/WatchTower';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const MAX_INSTALLER_BYTES = 600 * 1024 * 1024;
const TRUSTED_HOSTS = [/^github\.com$/, /^api\.github\.com$/, /(^|\.)githubusercontent\.com$/];

/** Strict x.y.z (optionally prefixed with "v"). Pre-release or build suffixes are not accepted: only stable releases are used. */
function parseVersion(v) {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(String(v == null ? '' : v).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) throw new Error(`invalid version: ${!x ? a : b}`);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

const isTrustedUrl = (u) => {
  try {
    const p = new URL(u);
    return p.protocol === 'https:' && !p.username && !p.password && TRUSTED_HOSTS.some((re) => re.test(p.hostname));
  } catch { return false; }
};

/**
 * Validates GitHub "latest release" metadata.
 * Returns { ok:true, upToDate:true, version } | { ok:true, upToDate:false, update } | { ok:false, reason }.
 */
function validateRelease(json, { currentVersion, platform = process.platform, arch = process.arch } = {}) {
  if (platform !== 'win32') return { ok: false, reason: 'Updates are only supported on Windows.' };
  if (arch !== 'x64') return { ok: false, reason: `Unsupported CPU architecture: ${arch}.` };
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false, reason: 'The release information is not valid.' };
  if (json.draft === true || json.prerelease === true) return { ok: false, reason: 'Only stable releases are used.' };
  const tag = typeof json.tag_name === 'string' ? json.tag_name : '';
  const version = parseVersion(tag) && tag.startsWith('v') ? tag.slice(1) : null;
  if (!version) return { ok: false, reason: `Unexpected release tag "${String(tag).slice(0, 40)}".` };
  if (!parseVersion(currentVersion)) return { ok: false, reason: 'The installed version is not a valid version number.' };
  if (compareVersions(version, currentVersion) <= 0) return { ok: true, upToDate: true, version: currentVersion };
  if (!Array.isArray(json.assets)) return { ok: false, reason: 'The release has no downloadable files.' };
  const prefix = `https://github.com/${REPO}/releases/download/${tag}/`;
  const pick = (name) => json.assets.find((a) => a && a.name === name && typeof a.browser_download_url === 'string' && a.browser_download_url === prefix + name);
  const installerName = `WatchTower-Setup-${version}.exe`;
  const installer = pick(installerName);
  const sums = pick('SHA256SUMS.txt');
  if (!installer) return { ok: false, reason: `The release does not contain ${installerName} from the official repository.` };
  if (!sums) return { ok: false, reason: 'The release has no SHA256SUMS.txt, so the download could not be verified.' };
  if (!Number.isInteger(installer.size) || installer.size <= 0 || installer.size > MAX_INSTALLER_BYTES) return { ok: false, reason: 'The installer size is not plausible.' };
  const portable = pick(`WatchTower-Portable-${version}-x64.exe`);
  const notes = typeof json.body === 'string' ? json.body.replace(/\u0000/g, '').slice(0, 4000) : '';
  return {
    ok: true,
    upToDate: false,
    update: { version, tag, notes, publishedAt: typeof json.published_at === 'string' ? json.published_at : null, installer: { name: installerName, url: installer.browser_download_url, size: installer.size }, checksumsUrl: sums.browser_download_url, portable: portable ? { name: portable.name, url: portable.browser_download_url } : null, pageUrl: RELEASES_PAGE },
  };
}

/** Parses sha256sum-style text: "<64 hex>  name" or "<64 hex> *name". */
function parseChecksums(text) {
  const map = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (m) map.set(m[2], m[1].toLowerCase());
  }
  return map;
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex')));
  });
}

/** Real network layer (HTTPS only, redirects limited and restricted to trusted hosts). Replaced by mocks in tests. */
function createNetwork({ userAgent = 'WatchTower-Updater' } = {}) {
  const open = (url, headers, cb, hops = 0) => new Promise((resolve, reject) => {
    if (!isTrustedUrl(url)) return reject(new Error('Refusing to contact an untrusted address.'));
    const req = https.get(url, { headers: { 'User-Agent': userAgent, Accept: 'application/vnd.github+json, application/octet-stream', ...headers }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (hops >= 4) return reject(new Error('Too many redirects.'));
        return resolve(open(new URL(res.headers.location, url).toString(), headers, cb, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Server answered ${res.statusCode}.`)); }
      cb(res, resolve, reject);
    });
    req.on('timeout', () => req.destroy(new Error('The connection timed out.')));
    req.on('error', reject);
  });
  return {
    async getJson(url) {
      const text = await this.getText(url, 2 * 1024 * 1024);
      return JSON.parse(text);
    },
    getText(url, limit = 256 * 1024) {
      return open(url, {}, (res, resolve, reject) => {
        const parts = [];
        let n = 0;
        res.on('data', (c) => { n += c.length; if (n > limit) { res.destroy(new Error('Response too large.')); } else parts.push(c); });
        res.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
        res.on('error', reject);
      });
    },
    stream(url, onChunk) {
      return open(url, {}, (res, resolve, reject) => {
        res.on('data', (c) => onChunk(c));
        res.on('end', resolve);
        res.on('error', reject);
      });
    },
  };
}

/** Checks the official repository for a newer stable release. Never throws: returns a status object. */
async function checkForUpdate({ currentVersion, net = createNetwork(), platform, arch }) {
  let json;
  try {
    json = await net.getJson(API_URL);
  } catch (e) {
    return { status: 'error', current: currentVersion, error: `Could not check for updates: ${e.message}` };
  }
  const v = validateRelease(json, { currentVersion, platform, arch });
  if (!v.ok) return { status: 'error', current: currentVersion, error: v.reason };
  if (v.upToDate) return { status: 'none', current: currentVersion };
  return { status: 'available', current: currentVersion, ...v.update };
}

/**
 * Downloads and verifies the installer. A previously verified file is reused (no repeated download).
 * Resolves { ok:true, file, cached } or { ok:false, error }. A failed or tampered download is deleted.
 */
async function downloadUpdate({ update, dir, net = createNetwork(), onProgress = () => {}, fsImpl = fs }) {
  try {
    if (!update || !update.installer || !isTrustedUrl(update.installer.url) || !isTrustedUrl(update.checksumsUrl)) throw new Error('The update description is not trusted.');
    const name = update.installer.name;
    if (path.basename(name) !== name || !/^WatchTower-Setup-\d+\.\d+\.\d+\.exe$/.test(name)) throw new Error('Unexpected installer file name.');
    const sums = parseChecksums(await net.getText(update.checksumsUrl));
    const expected = sums.get(name);
    if (!expected) throw new Error(`SHA256SUMS.txt has no entry for ${name}.`);
    fsImpl.mkdirSync(dir, { recursive: true });
    const finalPath = path.join(dir, name);
    if (fsImpl.existsSync(finalPath) && (await sha256File(finalPath)) === expected) {
      onProgress({ received: update.installer.size, total: update.installer.size });
      return { ok: true, file: finalPath, cached: true, sha256: expected };
    }
    const part = `${finalPath}.part`;
    const out = fsImpl.createWriteStream(part);
    const hash = crypto.createHash('sha256');
    let received = 0;
    try {
      await net.stream(update.installer.url, (chunk) => {
        received += chunk.length;
        if (received > MAX_INSTALLER_BYTES) throw new Error('The download is larger than expected.');
        hash.update(chunk);
        out.write(chunk);
        onProgress({ received, total: update.installer.size });
      });
    } finally {
      await new Promise((r) => out.end(r));
    }
    if (received !== update.installer.size) throw new Error(`The download is incomplete (${received} of ${update.installer.size} bytes).`);
    if (hash.digest('hex') !== expected) throw new Error('Integrity check failed: the downloaded file does not match the published checksum.');
    fsImpl.renameSync(part, finalPath);
    return { ok: true, file: finalPath, cached: false, sha256: expected };
  } catch (e) {
    try { fsImpl.rmSync(path.join(dir, `${update && update.installer ? update.installer.name : 'x'}.part`), { force: true }); } catch { /* ignore */ }
    return { ok: false, error: e.message || String(e) };
  }
}

/** Arguments for the NSIS installer: silent, relaunch afterwards. Only a file inside `dir` with the expected name is accepted. */
function buildInstallCommand(file, dir) {
  const resolved = path.resolve(file);
  if (path.dirname(resolved) !== path.resolve(dir) || !/^WatchTower-Setup-\d+\.\d+\.\d+\.exe$/.test(path.basename(resolved))) throw new Error('Refusing to run a file that is not a downloaded WatchTower installer.');
  return { file: resolved, args: ['/S', '--force-run'] };
}

module.exports = { REPO, API_URL, RELEASES_PAGE, parseVersion, compareVersions, isTrustedUrl, validateRelease, parseChecksums, sha256File, createNetwork, checkForUpdate, downloadUpdate, buildInstallCommand };
