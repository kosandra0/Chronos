const fs = require('node:fs');
const path = require('node:path');

const standaloneRoot = path.resolve(process.cwd(), '.next', 'standalone');

if (!fs.existsSync(standaloneRoot) || !fs.statSync(standaloneRoot).isDirectory()) {
  throw new Error(`Next.js standalone output was not found: ${standaloneRoot}. Run "npm run build" first.`);
}

let inspectedLinks = 0;
let removedDanglingLinks = 0;

function removeDanglingLinks(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const stat = fs.lstatSync(absolutePath);

    if (stat.isSymbolicLink()) {
      inspectedLinks += 1;
      try {
        fs.statSync(absolutePath);
      } catch (error) {
        if (error && ['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) {
          // Remove only the dangling link, never the target.
          fs.unlinkSync(absolutePath);
          removedDanglingLinks += 1;
          console.log(`[desktop:clean] Removed dangling link: ${path.relative(standaloneRoot, absolutePath)}`);
        } else {
          throw error;
        }
      }
      continue;
    }

    if (stat.isDirectory()) removeDanglingLinks(absolutePath);
  }
}

removeDanglingLinks(standaloneRoot);

const serverEntry = path.join(standaloneRoot, 'server.js');
if (!fs.existsSync(serverEntry)) {
  throw new Error(`The standalone server entry point is missing: ${serverEntry}`);
}

console.log(`[desktop:clean] Scanned ${inspectedLinks} symbolic link(s); removed ${removedDanglingLinks} dangling link(s).`);
console.log('[desktop:clean] Standalone server entry point verified.');
