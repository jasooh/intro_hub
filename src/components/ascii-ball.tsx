"use client";

import { useEffect, useRef } from "react";

// A slowly spinning ASCII volleyball drawn in the Doto dot-matrix font.
// Volleyball panels: map each surface point to its dominant cube face; every
// face has three parallel strips, and the strip direction rotates per face.

const COLS = 54;
const ROWS = 31; // Doto glyphs are ~1.75x taller than wide: 54 / 31 keeps the ball round
const SHADES = ".·:-=+*"; // shadow → highlight (never blank, so the dark side still reads)
const SEAM = "#";
const FPS = 14;

function frame(t: number): string {
  const ry = t * 0.45; // spin
  const rx = 0.45 + Math.sin(t * 0.2) * 0.12; // gentle wobble
  const [cy, sy, cx, sx] = [Math.cos(ry), Math.sin(ry), Math.cos(rx), Math.sin(rx)];
  const light = [-0.45, -0.55, 0.7];
  let out = "";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = (c / (COLS - 1)) * 2 - 1;
      const y = (r / (ROWS - 1)) * 2 - 1;
      const d = x * x + y * y;
      if (d > 1) {
        out += " ";
        continue;
      }
      const z = Math.sqrt(1 - d);
      // Rotate the view-space point into ball space (around X, then Y).
      const y1 = y * cx - z * sx;
      const z1 = y * sx + z * cx;
      const qx = x * cy + z1 * sy;
      const qz = -x * sy + z1 * cy;
      const qy = y1;
      const ax = Math.abs(qx);
      const ay = Math.abs(qy);
      const az = Math.abs(qz);

      // Dominant face and the component that sets the strip seams on it.
      let major: number, minor: number, other: number;
      if (ax >= ay && ax >= az) [major, minor, other] = [ax, az, ay];
      else if (ay >= ax && ay >= az) [major, minor, other] = [ay, ax, az];
      else [major, minor, other] = [az, ay, ax];
      const u = minor / major; // 0..1 across the face
      const edge = major - Math.max(minor, other) < 0.035; // face boundary
      const strip = Math.abs(u - 1 / 3) < 0.03 || Math.abs(u - 2 / 3) < 0.03;

      // Skip seams right at the rim, where they foreshorten into stray dots.
      if ((edge || strip) && z > 0.22) {
        out += SEAM;
        continue;
      }
      const lambert = Math.max(0, x * light[0] + y * light[1] + z * light[2]);
      const shade = Math.min(SHADES.length - 1, Math.floor(lambert * SHADES.length));
      out += SHADES[shade];
    }
    out += "\n";
  }
  return out;
}

/** Lowkey background: fixed behind the page, top right. */
export function AsciiBall() {
  const pre = useRef<HTMLPreElement>(null);

  // Draw loop: ~14 fps, paused while the tab is hidden; a single still frame for reduced motion.
  useEffect(() => {
    const el = pre.current;
    if (!el) return;
    el.textContent = frame(0.8);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || now - last < 1000 / FPS) return;
      last = now;
      el.textContent = frame(0.8 + (now - start) / 1000);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-20 right-[max(-4rem,calc(50vw-34rem))] z-[-1] select-none max-sm:top-32 max-sm:-right-24 max-sm:opacity-60"
    >
      <pre ref={pre} className="font-score text-[clamp(9px,1.05vw,14px)] leading-[1.05] font-black text-ink/[0.13]" />
    </div>
  );
}
