'use client';

import { useEffect, useRef } from 'react';
import { GEO_URL } from '@/lib/geo';

/**
 * NavGlobe — the World entry in the experience nav, as a real 3D globe.
 * Reuses the app's own country polygons (same GeoJSON as WorldGlobe),
 * rasterized once into an equirectangular texture on a tiny three.js
 * sphere. While `spinning` (hover) it turns about its vertical axis like
 * the interactive globe's auto-rotate; otherwise it holds a single frame.
 */

const TEX_W = 1024;
const TEX_H = 512;
const OCEAN = '#0e0f1a';          // same base as WorldGlobe's sphere material
const LAND = '#7a83ec';           // periwinkle land — the #767DEC family

// One texture for the whole session — nav remounts on every route change.
let texturePromise: Promise<HTMLCanvasElement> | null = null;

function buildTexture(): Promise<HTMLCanvasElement> {
  texturePromise ??= (async () => {
    const c = document.createElement('canvas');
    c.width = TEX_W;
    c.height = TEX_H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, TEX_W, TEX_H);
    try {
      type Ring = [number, number][];
      type Feature = { geometry: { type: string; coordinates: unknown } };
      const geo: { features: Feature[] } = await fetch(GEO_URL).then((r) => r.json());
      ctx.fillStyle = LAND;
      for (const f of geo.features) {
        const polys = (
          f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
        ) as Ring[][];
        for (const poly of polys) {
          ctx.beginPath();
          for (const ring of poly) {
            ring.forEach(([lon, lat], i) => {
              const x = ((lon + 180) / 360) * TEX_W;
              const y = ((90 - lat) / 180) * TEX_H;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            });
            ctx.closePath();
          }
          ctx.fill();
        }
      }
    } catch {
      /* plain dark sphere is an acceptable fallback */
    }
    return c;
  })();
  return texturePromise;
}

export function NavGlobe({ spinning, className }: { spinning: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const spinRef = useRef(spinning);
  spinRef.current = spinning;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;
    let cleanupGL: (() => void) | undefined;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    (async () => {
      // three is already in both routes' budgets (R3F / react-globe.gl) —
      // dynamic import keeps it out of the nav's initial chunk.
      const THREE = await import('three');
      const texCanvas = await buildTexture();
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(56, 56, false); // CSS scales it down — stays crisp on hover pop

      const texture = new THREE.CanvasTexture(texCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 10);
      camera.position.z = 4.3;
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1, 48, 48),
        new THREE.MeshBasicMaterial({ map: texture }),
      );
      sphere.rotation.y = -1.2; // open on Africa/Europe, like the page's globe
      scene.add(sphere);

      const render = () => renderer.render(scene, camera);
      render(); // static frame for the resting state

      const tick = () => {
        if (disposed) return;
        if (spinRef.current && !reduceMotion.matches) {
          sphere.rotation.y += 0.02; // the page's unhurried auto-rotate feel
          render();
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      cleanupGL = () => {
        sphere.geometry.dispose();
        sphere.material.dispose();
        texture.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      };
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanupGL?.();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
