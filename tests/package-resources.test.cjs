'use strict';
// Verifies the PACKAGED server bundle (release/win-unpacked) contains everything it needs at runtime.
// Requires `npm run desktop:dir` first. Set WATCHTOWER_REQUIRE_PACKAGE=1 to fail (instead of skip) when absent.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { packagedServerDir, projectRoot } = require('./helpers.cjs');

const present = fs.existsSync(packagedServerDir);
const skip = !present && process.env.WATCHTOWER_REQUIRE_PACKAGE !== '1' ? 'packaged build not found (run npm run desktop:dir)' : false;

test('packaged build exists', { skip }, () => {
  assert.ok(present, `missing ${packagedServerDir}`);
});

const required = [
  'server.js',
  'node_modules/next/package.json',
  'node_modules/react/package.json',
  'node_modules/react-dom/package.json',
  'node_modules/@electric-sql/pglite/package.json',
  'node_modules/@electric-sql/pglite/dist/pglite.wasm',
  'node_modules/@electric-sql/pglite/dist/pglite.data',
  '.next/BUILD_ID',
  '.next/server',
  '.next/static',
];
for (const rel of required) {
  test(`packaged server contains ${rel}`, { skip }, () => {
    assert.ok(fs.existsSync(path.join(packagedServerDir, rel)), `${rel} is missing from the packaged server (this was the v0.1.0 startup bug)`);
  });
}

test('packaged monitoring agent script exists', { skip }, () => {
  assert.ok(fs.existsSync(path.join(packagedServerDir, '..', 'agent', 'watchtower-agent.ps1')));
});

test('no symbolic links remain in the packaged server', { skip }, () => {
  const stack = [packagedServerDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      assert.ok(!e.isSymbolicLink(), `symlink found: ${p}`);
      if (e.isDirectory()) stack.push(p);
    }
  }
});

test('package-lock version matches package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, pkg.version);
});

test('packaged server bundle is lean (no build outputs or installers dragged in)', { skip }, () => {
  let bytes = 0;
  const stack = [packagedServerDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p); else bytes += fs.statSync(p).size;
    }
  }
  for (const bad of ['release', 'installer', 'logs', 'build', 'tests', 'src', 'UI']) {
    assert.ok(!fs.existsSync(path.join(packagedServerDir, bad)), `${bad}/ must not be inside the packaged server`);
  }
  assert.ok(bytes < 150 * 1024 * 1024, `packaged server is ${(bytes / 1048576).toFixed(0)} MB (expected < 150 MB)`);
});
