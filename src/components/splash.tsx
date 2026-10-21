/** Shown only on the first load of a visit; skipped by the inline script below once seen. */
const SKIP_SCRIPT = `try{if(sessionStorage.getItem("ih-splash"))document.documentElement.classList.add("splash-skip")}catch(e){}`;

/**
 * First-visit loading screen: a bouncing ball over the court line while the
 * fonts and the background ball load. Plain HTML/CSS so it paints before any
 * JavaScript; SplashGate fades it out, and CSS hides it after 4s regardless.
 */
export function Splash() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SKIP_SCRIPT }} />
      <div id="splash" role="status" aria-label="Loading">
        <div className="flex flex-col items-center gap-1.5">
          <div className="size-10 animate-bounce-ball rounded-full border-[3px] border-ink bg-line" />
          <div className="splash-shadow h-1.5 w-10 rounded-full bg-ink/20" />
        </div>
        <p className="mt-6 font-display text-3xl font-black tracking-tight uppercase">
          Intro<span className="text-line">/</span>Hub
        </p>
        <div className="mt-3 h-[3px] w-40 bg-ink/10">
          <div className="splash-line h-full bg-line" />
        </div>
      </div>
    </>
  );
}
