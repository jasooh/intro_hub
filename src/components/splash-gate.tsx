"use client";

import { useEffect } from "react";

const MIN_MS = 400; // long enough not to flicker
const MAX_MS = 2500; // never hold the page longer than this

/**
 * Fades the first-visit splash (src/components/splash.tsx) once the fonts and
 * the background ball's first frame are ready, then remembers it for the visit.
 */
export function SplashGate() {
  useEffect(() => {
    const html = document.documentElement;
    if (html.classList.contains("splash-skip")) return;
    const w = window as Window & { __wireBallReady?: boolean };
    const ball = new Promise<void>((resolve) => {
      if (w.__wireBallReady) resolve();
      else window.addEventListener("wireball:ready", () => resolve(), { once: true });
    });
    const cap = new Promise<void>((resolve) => setTimeout(resolve, MAX_MS));
    let cancelled = false;
    let timer = 0;
    Promise.race([Promise.all([document.fonts.ready, ball]), cap]).then(() => {
      if (cancelled) return;
      // performance.now() counts from the start of the page load.
      timer = window.setTimeout(() => {
        html.classList.add("splash-done");
        try {
          sessionStorage.setItem("ih-splash", "1");
        } catch {}
      }, Math.max(0, MIN_MS - performance.now()));
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return null;
}
