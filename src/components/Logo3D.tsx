"use client";

import { useEffect, useRef, useState } from "react";
import logos from "@/lib/logos.json";
import { buildBeam, buildTower, type TowerVariant } from "./towerModels";

export type LogoId = TowerVariant;

/** Flat version of a logo (title bar, WebGL fallback). Same artwork as the app, tray and shortcut icons. */
export function WatchTowerMark({ size = 32, variant = "classic" }: { size?: number; variant?: LogoId }) {
  const svg = (logos.find((l) => l.id === variant) ?? logos[0]).svg;
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="WatchTower logo" width={size} height={size} style={{ display: "block", flex: "none" }} src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} />;
}

/**
 * Live 3D watchtower: the tower turns slowly while a yellow searchlight sweeps around its lantern.
 * Five different towers (see towerModels.ts). Built with three.js (loaded on demand); falls back to the flat
 * mark if WebGL is unavailable and renders a single still frame when animations are off.
 */
export function Logo3D({ size = 36, animate = true, variant = "classic" }: { size?: number; animate?: boolean; variant?: LogoId }) {
  const host = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import("three");
        if (disposed || !host.current) return;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(size, size);
        renderer.setClearColor(0x000000, 0);
        host.current.appendChild(renderer.domElement);
        renderer.domElement.style.display = "block";
        renderer.domElement.addEventListener("webglcontextlost", () => setFallback(true));

        const model = buildTower(THREE, variant);
        const beamPivot = buildBeam(THREE, model.lampY);
        const lookY = model.height * 0.45;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
        camera.position.set(0, lookY + 0.45, model.height * 1.55 + 0.6);
        camera.lookAt(0, lookY, 0);

        scene.add(new THREE.AmbientLight(0xbfd0e6, 0.9));
        const sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.position.set(3, 5, 4);
        scene.add(sun);

        const root = new THREE.Group();
        root.add(model.tower, beamPivot);
        root.rotation.x = 0.1;
        scene.add(root);

        let raf = 0;
        let last = performance.now();
        const draw = (now: number) => {
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          model.tower.rotation.y += dt * 0.55;
          beamPivot.rotation.y -= dt * 1.5;
          renderer.render(scene, camera);
          if (animate) raf = requestAnimationFrame(draw);
        };
        model.tower.rotation.y = 0.6;
        beamPivot.rotation.y = 0.9;
        if (animate) raf = requestAnimationFrame(draw);
        else renderer.render(scene, camera);

        cleanup = () => {
          cancelAnimationFrame(raf);
          renderer.dispose();
          scene.traverse((o) => {
            const m = o as import("three").Mesh;
            m.geometry?.dispose?.();
          });
          renderer.domElement.remove();
        };
      } catch {
        if (!disposed) setFallback(true);
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [size, animate, variant]);

  if (fallback) return <WatchTowerMark size={size} variant={variant} />;
  return <div ref={host} style={{ width: size, height: size, flex: "none" }} aria-label="WatchTower logo" role="img" />;
}
