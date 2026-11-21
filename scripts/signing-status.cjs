'use strict';
/**
 * Windows code-signing support for WatchTower builds.
 *
 * electron-builder signs the app, the installer and the portable exe automatically when a REAL code-signing
 * certificate is provided through environment variables (never commit a certificate or password):
 *
 *   CSC_LINK          path, https URL or base64 of the .pfx/.p12 certificate
 *   CSC_KEY_PASSWORD  the certificate password
 *   (or CSC_NAME      the subject name of a certificate already installed in the Windows certificate store)
 *
 * Without them the build is produced UNSIGNED and Windows SmartScreen may warn. A self-signed certificate does not
 * establish a trusted publisher, so this script never creates one.
 *
 * Usage:
 *   node scripts/signing-status.cjs                      report whether a signing certificate is configured
 *   node scripts/signing-status.cjs --check <exe> ...    report the Authenticode signature state of built files
 *   add --require-signed to exit with code 1 unless every checked file has a valid signature
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

/** Pure: inspects an environment object. Never returns secret values. */
function detectSigningConfig(env = process.env) {
  const link = (env.WIN_CSC_LINK || env.CSC_LINK || '').trim();
  const password = env.WIN_CSC_KEY_PASSWORD || env.CSC_KEY_PASSWORD || '';
  const name = (env.CSC_NAME || '').trim();
  if (link && password) return { configured: true, method: 'certificate-file', missing: [] };
  if (name) return { configured: true, method: 'certificate-store', missing: [] };
  const missing = [];
  if (!link && !name) missing.push('CSC_LINK (certificate .pfx) or CSC_NAME (installed certificate)');
  if (link && !password) missing.push('CSC_KEY_PASSWORD');
  if (!link && !name) missing.push('CSC_KEY_PASSWORD');
  return { configured: false, method: null, missing };
}

/** Pure: maps Get-AuthenticodeSignature output to a state. */
function interpretSignature(sig) {
  const status = sig && typeof sig.Status === 'string' ? sig.Status : 'Unknown';
  if (status === 'NotSigned') return { state: 'unsigned', valid: false, status };
  if (status === 'Valid') return { state: 'signed', valid: true, status, subject: sig.Subject || null, thumbprint: sig.Thumbprint || null };
  if (!sig || !sig.Subject) return { state: 'unknown', valid: false, status };
  return { state: 'signed-but-not-trusted', valid: false, status, subject: sig.Subject || null };
}

function readSignature(file) {
  const ps = `$s = Get-AuthenticodeSignature -LiteralPath $env:WT_SIGN_FILE; [pscustomobject]@{ Status = [string]$s.Status; Subject = $s.SignerCertificate.Subject; Thumbprint = $s.SignerCertificate.Thumbprint } | ConvertTo-Json -Compress`;
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', timeout: 60000, env: { ...process.env, WT_SIGN_FILE: file }, stdio: ['ignore', 'pipe', 'pipe'] });
    return interpretSignature(JSON.parse(out));
  } catch (e) {
    return { state: 'unknown', valid: false, status: `could not verify: ${e.message.split('\n')[0]}` };
  }
}

function main(argv) {
  const cfg = detectSigningConfig();
  console.log(`Signing certificate configured: ${cfg.configured ? `yes (${cfg.method})` : 'NO'}`);
  if (!cfg.configured) console.log(`  Missing: ${cfg.missing.join('; ')}\n  Builds will be UNSIGNED until a trusted certificate is supplied.`);
  const i = argv.indexOf('--check');
  let allValid = true;
  if (i >= 0) {
    const files = argv.slice(i + 1).filter((a) => !a.startsWith('--'));
    if (!files.length) { console.error('No files given to --check.'); return 2; }
    for (const f of files) {
      const r = readSignature(path.resolve(f));
      allValid = allValid && r.valid;
      console.log(`${r.valid ? 'SIGNED  ' : r.state === 'unsigned' ? 'UNSIGNED' : 'NOT-OK  '} ${path.basename(f)}  [${r.status}]${r.subject ? ` ${r.subject}` : ''}`);
    }
  }
  return argv.includes('--require-signed') && !allValid ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { detectSigningConfig, interpretSignature, readSignature };
