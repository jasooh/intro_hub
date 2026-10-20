"use client";

import { useEffect, useRef } from "react";

// A slowly spinning wireframe volleyball, drawn on a canvas. Same ball as the
// old ASCII one: six panels (one per cube face), each split into three strips,
// with the strip direction turning from face to face.

type Vec = [number, number, number];
const STEPS = 40; // points per seam
const FPS = 30;

/** A point on the cube surface, pushed out onto the sphere. */
const toSphere = ([x, y, z]: Vec): Vec => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};

/** Every seam as a polyline on the unit sphere (computed once). */
function seams(): Vec[][] {
  const lines: Vec[][] = [];
  const line = (from: Vec, to: Vec) =>
    lines.push(
      Array.from({ length: STEPS + 1 }, (_, i) => {
        const t = i / STEPS;
        return toSphere([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]);
      }),
    );
  const at = (axis: number, value: number, rest: [number, number]): Vec => {
    const p: number[] = [0, 0, 0];
    p[axis] = value;
    p[(axis + 1) % 3] = rest[0];
    p[(axis + 2) % 3] = rest[1];
    return p as Vec;
  };

  // Panel edges: the 12 cube edges.
  for (let axis = 0; axis < 3; axis++) {
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        line(at(axis, -1, [a, b]), at(axis, 1, [a, b]));
      }
    }
  }
  // Strip seams: on each face, two lines splitting it into three strips.
  // x faces split along z, y faces along x, z faces along y (as in the ASCII ball).
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [-1, 1]) {
      for (const k of [-1 / 3, 1 / 3]) {
        // The splitting coordinate is the "minor" one: (axis + 2) % 3.
        line(at(axis, side, [-1, k]), at(axis, side, [1, k]));
      }
    }
  }
  return lines;
}

/** Ball space -> view space, the inverse of the ASCII ball's view -> ball rotation. */
function project([qx, qy, qz]: Vec, t: number): Vec {
  const ry = t * 0.45;
  const rx = 0.45 + Math.sin(t * 0.2) * 0.12;
  const [cy, sy, cx, sx] = [Math.cos(ry), Math.sin(ry), Math.cos(rx), Math.sin(rx)];
  const x = qx * cy - qz * sy;
  const z1 = qx * sy + qz * cy;
  return [x, qy * cx + z1 * sx, -qy * sx + z1 * cx];
}

function draw(ctx: CanvasRenderingContext2D, size: number, t: number, lines: Vec[][]) {
  const r = size / 2 - 2;
  ctx.clearRect(0, 0, size, size);
  ctx.lineWidth = 1.5;
  ctx.lineJoin = ctx.lineCap = "round";
  ctx.strokeStyle = "#1b1612";

  // Back seams faint, front seams full: reads as a see-through wire ball.
  for (const front of [false, true]) {
    ctx.globalAlpha = front ? 1 : 0.3;
    ctx.beginPath();
    for (const pts of lines) {
      let drawing = false;
      for (const p of pts) {
        const [x, y, z] = project(p, t);
        if (z > 0 === front) {
          const sx = size / 2 + x * r;
          const sy = size / 2 + y * r;
          if (drawing) ctx.lineTo(sx, sy);
          else ctx.moveTo(sx, sy);
          drawing = true;
        } else {
          drawing = false;
        }
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  ctx.stroke();
}

/** Lowkey background: fixed behind the page, top right. */
export function WireBall() {
  const canvas = useRef<HTMLCanvasElement>(null);

  // ~30 fps, paused while the tab is hidden; a single still frame for reduced motion.
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const lines = seams();
    let size = 0;
    const fit = () => {
      size = el.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      el.width = size * dpr;
      el.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    draw(ctx, size, 0.8, lines);
    const onResize = () => {
      fit();
      draw(ctx, size, 0.8, lines);
    };
    window.addEventListener("resize", onResize);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => window.removeEventListener("resize", onResize);
    }

    const start = performance.now();
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || now - last < 1000 / FPS) return;
      last = now;
      draw(ctx, size, 0.8 + (now - start) / 1000, lines);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-20 right-[max(-4rem,calc(50vw-34rem))] z-[-1] select-none max-sm:top-32 max-sm:-right-24"
    >
      <canvas ref={canvas} className="size-[clamp(240px,32vw,440px)] opacity-[0.14] max-sm:size-72 max-sm:opacity-[0.1]" />
    </div>
  );
}
