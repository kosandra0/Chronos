const fs = require('node:fs');
const path = require('node:path');

const standaloneRoot = path.resolve(process.cwd(), '.next', 'standalone');

if (!fs.existsSync(standaloneRoot) || !fs.statSync(standaloneRoot).isDirectory()) {
  throw new Error(`Next.js standalone output was not found: ${standaloneRoot}. Run "npm run build" first.`);
}

let inspectedLinks = 0;
let materializedLinks = 0;
let removedDanglingLinks = 0;

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeLinks(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const stat = fs.lstatSync(absolutePath);

    if (stat.isSymbolicLink()) {
      inspectedLinks += 1;

      let targetPath;
      try {
        // Resolve the target while the original standalone tree is intact.
        targetPath = fs.realpathSync(absolutePath);
        fs.statSync(targetPath);
      } catch (error) {
        if (error && ['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) {
          // A dangling link cannot be used at runtime.
          fs.rmSync(absolutePath, { recursive: true, force: true });
          removedDanglingLinks += 1;
          console.log(`[desktop:clean] Removed dangling link: ${path.relative(standaloneRoot, absolutePath)}`);
          continue;
        }
        throw error;
      }

      // Copying links into Electron's resources tree can leave their original
      // targets behind. Materialize valid links as normal files/directories.
      if (isInside(targetPath, absolutePath)) {
        throw new Error(`Refusing to materialize a cyclic link: ${absolutePath} -> ${targetPath}`);
      }

      const temporaryPath = `${absolutePath}.chronos-materializing`;
      fs.rmSync(temporaryPath, { recursive: true, force: true });

      try {
        fs.cpSync(targetPath, temporaryPath, {
          recursive: true,
          dereference: true,
          preserveTimestamps: true,
        });
        fs.rmSync(absolutePath, { recursive: true, force: true });
        fs.renameSync(temporaryPath, absolutePath);
        materializedLinks += 1;
        console.log(`[desktop:clean] Materialized link: ${path.relative(standaloneRoot, absolutePath)}`);
      } catch (error) {
        fs.rmSync(temporaryPath, { recursive: true, force: true });
        throw error;
      }

      const materializedStat = fs.lstatSync(absolutePath);
      if (materializedStat.isDirectory()) normalizeLinks(absolutePath);
      continue;
    }

    if (stat.isDirectory()) normalizeLinks(absolutePath);
  }
}

normalizeLinks(standaloneRoot);

const serverEntry = path.join(standaloneRoot, 'server.js');
if (!fs.existsSync(serverEntry)) {
  throw new Error(`The standalone server entry point is missing: ${serverEntry}`);
}

console.log(`[desktop:clean] Inspected ${inspectedLinks} link(s), materialized ${materializedLinks}, removed ${removedDanglingLinks} dangling link(s).`);
console.log('[desktop:clean] Standalone server entry point verified.');
