// Parametric 3D watchtower models. Shared by the live logo (browser) and the model exporter script (Node).
// Only erasable TypeScript is used here so Node can import this file directly.
import type * as ThreeNS from "three";

export type TowerVariant = "classic" | "lighthouse" | "keep" | "pagoda" | "observer";
export type Three = typeof ThreeNS;
export type TowerModel = { tower: ThreeNS.Group; lampY: number; height: number };

export const TOWER_VARIANTS: TowerVariant[] = ["classic", "lighthouse", "keep", "pagoda", "observer"];

/** Builds the tower body (no beam). The lantern sits at `lampY`; `height` is the overall height. */
export function buildTower(THREE: Three, variant: TowerVariant): TowerModel {
  const tower = new THREE.Group();
  const mat = (color: number, rough = 0.7) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.08 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd54a });
  const add = (geo: ThreeNS.BufferGeometry, m: ThreeNS.Material, y: number, x = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    tower.add(mesh);
    return mesh;
  };
  const light = (y: number) => {
    const l = new THREE.PointLight(0xffd54a, 1.4, 6);
    l.position.y = y;
    tower.add(l);
  };

  if (variant === "lighthouse") {
    const white = mat(0xf2f5f8, 0.55);
    const red = mat(0xd9483f, 0.6);
    const dark = mat(0x46566a, 0.85);
    add(new THREE.ConeGeometry(1.25, 0.55, 10), dark, 0.27);
    add(new THREE.CylinderGeometry(0.45, 0.78, 2.3, 28), white, 1.65);
    add(new THREE.CylinderGeometry(0.585, 0.65, 0.4, 28), red, 1.0); // lower band
    add(new THREE.CylinderGeometry(0.5, 0.56, 0.4, 28), red, 2.0); // upper band
    add(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 28), dark, 2.85);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.62, 24), glow, 3.22);
    add(new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), red, 3.53);
    light(3.22);
    return { tower, lampY: 3.22, height: 4.05 };
  }

  if (variant === "keep") {
    const stone = mat(0x8c929b, 0.9);
    const dark = mat(0x4a5260, 0.9);
    add(new THREE.BoxGeometry(1.55, 0.3, 1.55), dark, 0.15);
    add(new THREE.BoxGeometry(1.2, 2.3, 1.2), stone, 1.45);
    add(new THREE.BoxGeometry(0.16, 0.8, 0.04), dark, 1.7, 0, 0.61); // arrow slit
    add(new THREE.BoxGeometry(0.4, 0.62, 0.04), dark, 0.62, 0, 0.61); // door
    add(new THREE.BoxGeometry(1.55, 0.18, 1.55), dark, 2.7);
    for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62], [0, -0.62], [0, 0.62], [-0.62, 0], [0.62, 0]]) {
      add(new THREE.BoxGeometry(0.3, 0.34, 0.3), stone, 2.96, x, z);
    }
    add(new THREE.CylinderGeometry(0.2, 0.14, 0.22, 12), dark, 2.9);
    add(new THREE.ConeGeometry(0.22, 0.58, 12), glow, 3.28); // torch flame
    light(3.2);
    return { tower, lampY: 3.2, height: 3.75 };
  }

  if (variant === "pagoda") {
    const wood = mat(0x8fa3ba, 0.75);
    const red = mat(0xd9534f, 0.6);
    const dark = mat(0x46566a, 0.85);
    add(new THREE.CylinderGeometry(1.05, 1.15, 0.2, 8), dark, 0.1);
    for (let i = 0; i < 3; i += 1) {
      const y0 = 0.2 + i * 0.98;
      add(new THREE.CylinderGeometry(0.55 - i * 0.1, 0.55 - i * 0.1, 0.56, 8), wood, y0 + 0.28);
      add(new THREE.ConeGeometry(0.98 - i * 0.2, 0.42, 8), red, y0 + 0.77);
    }
    add(new THREE.CylinderGeometry(0.22, 0.22, 0.46, 8), glow, 3.38);
    add(new THREE.ConeGeometry(0.38, 0.36, 8), red, 3.79);
    add(new THREE.SphereGeometry(0.06, 10, 10), mat(0xffd54a, 0.3), 4.04);
    light(3.38);
    return { tower, lampY: 3.38, height: 4.1 };
  }

  if (variant === "observer") {
    const concrete = mat(0x9aa7b6, 0.5);
    const dark = mat(0x46566a, 0.8);
    add(new THREE.CylinderGeometry(0.7, 0.82, 0.2, 28), dark, 0.1);
    add(new THREE.CylinderGeometry(0.2, 0.32, 2.9, 20), concrete, 1.55);
    add(new THREE.CylinderGeometry(0.98, 0.72, 0.18, 32), dark, 3.05);
    const dome = new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.92 });
    add(new THREE.SphereGeometry(0.64, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), dome, 3.14);
    add(new THREE.CylinderGeometry(0.12, 0.58, 0.14, 28), mat(0x5d6f85, 0.6), 3.82);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), concrete, 4.2);
    add(new THREE.SphereGeometry(0.07, 10, 10), mat(0xe5584f, 0.4), 4.58);
    light(3.4);
    return { tower, lampY: 3.4, height: 4.7 };
  }

  // classic stone watchtower
  const stone = mat(0x8fa3ba, 0.7);
  const dark = mat(0x46566a, 0.8);
  const roof = mat(0xe5846f, 0.6);
  add(new THREE.CylinderGeometry(0.95, 1.05, 0.28, 28), dark, 0.14);
  add(new THREE.CylinderGeometry(0.46, 0.8, 2.0, 28), stone, 1.28);
  add(new THREE.CylinderGeometry(0.82, 0.82, 0.16, 28), dark, 2.36);
  add(new THREE.CylinderGeometry(0.46, 0.46, 0.64, 20), glow, 2.76);
  add(new THREE.ConeGeometry(0.66, 0.6, 24), roof, 3.38);
  light(2.76);
  return { tower, lampY: 2.76, height: 3.75 };
}

/** The sweeping yellow searchlight: a translucent cone around a pivot at the lantern. */
export function buildBeam(THREE: Three, lampY: number) {
  const pivot = new THREE.Group();
  pivot.position.y = lampY;
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(0.62, 3.2, 28, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beam.rotation.z = -Math.PI / 2; // apex at the lamp, opening outwards (+x)
  beam.position.x = 1.7;
  pivot.add(beam);
  return pivot;
}
