// Exports the five WatchTower 3D towers (with their yellow searchlight) as binary glTF (.glb) files.
//   node scripts/export-models.mjs        ->  models/watchtower-<id>.glb
// Uses the same model code as the live logo (src/components/towerModels.ts).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { buildBeam, buildTower, TOWER_VARIANTS } from "../src/components/towerModels.ts";

// GLTFExporter expects a browser FileReader; provide the two methods it uses.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((r) => { this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(r).toString("base64")}`; this.onloadend?.(); }); }
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "models");
fs.mkdirSync(outDir, { recursive: true });

for (const variant of TOWER_VARIANTS) {
  const model = buildTower(THREE, variant);
  const scene = new THREE.Scene();
  scene.name = `WatchTower ${variant}`;
  model.tower.name = `tower-${variant}`;
  const beam = buildBeam(THREE, model.lampY);
  beam.name = "searchlight";
  beam.rotation.y = 0.9;
  // point lights are not part of the exported asset; the model is lit by the viewer
  model.tower.children.filter((c) => c.isLight).forEach((c) => model.tower.remove(c));
  scene.add(model.tower, beam);
  const glb = await new Promise((resolve, reject) => new GLTFExporter().parse(scene, resolve, reject, { binary: true }));
  const file = path.join(outDir, `watchtower-${variant}.glb`);
  fs.writeFileSync(file, Buffer.from(glb));
  console.log(`${path.relative(root, file)}  ${(glb.byteLength / 1024).toFixed(1)} KB`);
}
