// Theme demo for hosts: what a crow / "Fly" look could be. Not used anywhere else.
import type { CSSProperties, ReactNode } from "react";

const orange = "#F2711C";
const black = "#111111";
const white = "#F7F3EC";

const jersey: CSSProperties = {
  clipPath: "polygon(22% 0, 38% 0, 50% 9%, 62% 0, 78% 0, 100% 14%, 92% 34%, 82% 30%, 82% 100%, 18% 100%, 18% 30%, 8% 34%, 0 14%)",
};

function Feather({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 40 120" className={className} style={style} aria-hidden>
      <path d="M20 118 C20 80 4 60 6 30 C8 12 18 2 20 2 C22 2 32 12 34 30 C36 60 20 80 20 118 Z" fill="currentColor" />
      <path d="M20 118 L20 10" stroke={white} strokeOpacity="0.25" strokeWidth="1.2" />
      {[24, 36, 48, 60, 72].map((y) => (
        <g key={y} stroke={white} strokeOpacity="0.18" strokeWidth="1">
          <path d={`M20 ${y} L9 ${y - 9}`} />
          <path d={`M20 ${y} L31 ${y - 9}`} />
        </g>
      ))}
    </svg>
  );
}

function Banner() {
  // The hanging gym banner: white cloth, black brush characters, rope and tassels.
  return (
    <div className="relative flex flex-col items-center" aria-label="Banner reading Fly">
      <div className="h-6 w-px bg-[#8a7a66]" />
      <div className="h-1.5 w-28 rounded-full bg-[#5b4a3a]" />
      <div
        className="flex w-24 flex-col items-center gap-1 px-2 pt-4 pb-6 shadow-[6px_6px_0_rgba(0,0,0,0.35)]"
        style={{ background: white, clipPath: "polygon(0 0, 100% 0, 100% 92%, 50% 100%, 0 92%)" }}
      >
        <span className="text-6xl leading-none font-black" style={{ color: black, fontFamily: "'Yu Mincho','Hiragino Mincho ProN','Noto Serif JP',serif" }}>
          飛
        </span>
        <span className="text-6xl leading-none font-black" style={{ color: black, fontFamily: "'Yu Mincho','Hiragino Mincho ProN','Noto Serif JP',serif" }}>
          べ
        </span>
      </div>
    </div>
  );
}

function JerseyNumber({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex h-40 w-40 items-center justify-center" style={{ ...jersey, background: black }}>
        <div className="absolute inset-x-0 top-[30%] h-1.5" style={{ background: orange }} />
        <span
          className="relative mt-6 font-display text-7xl leading-none font-black"
          style={{ color: white, WebkitTextStroke: `2px ${orange}` }}
        >
          {n}
        </span>
      </div>
      <span className="font-display text-xs font-bold tracking-[0.3em] uppercase" style={{ color: black }}>
        {label}
      </span>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-5 flex items-end border-b-2" style={{ borderColor: black }}>
        <h2
          className="inline-flex items-center gap-2.5 px-3 pt-1.5 pb-1 font-display text-sm font-bold tracking-[0.2em] uppercase"
          style={{ background: black, color: white }}
        >
          <Feather className="h-4 w-2" style={{ color: orange }} />
          {label}
        </h2>
      </div>
      {children}
    </section>
  );
}

export function CrowThemeDemo() {
  return (
    <div className="space-y-14">
      {/* Hero: night-gym panel with the hanging banner */}
      <section
        className="relative overflow-hidden px-6 pt-8 pb-10 sm:px-10"
        style={{ background: black, color: white, boxShadow: `8px 8px 0 ${orange}` }}
      >
        <Feather className="absolute -top-4 right-40 h-24 w-8 rotate-[25deg] opacity-20" style={{ color: white }} />
        <Feather className="absolute bottom-6 left-1/2 h-16 w-6 -rotate-[35deg] opacity-15" style={{ color: orange }} />
        <div className="grid grid-cols-1 items-start gap-8 sm:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <p className="font-display text-sm font-bold tracking-[0.35em] uppercase" style={{ color: orange }}>
              Intro 2 Volleyball · crows welcome
            </p>
            <h1 className="font-display text-[clamp(4rem,20vw,9rem)] leading-[0.8] font-black uppercase">
              Fly<span style={{ color: orange }}>.</span>
            </h1>
            <p className="max-w-md text-lg" style={{ color: `${white}cc` }}>
              Never played? Every great spiker started on the bench. Grab a spot and connect.
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <span
                className="inline-flex items-center px-5 py-2 font-display text-xl font-bold tracking-wide uppercase"
                style={{ background: orange, color: black, border: `2px solid ${white}`, boxShadow: `3px 3px 0 ${white}` }}
              >
                Join the next match
              </span>
              <span
                className="inline-flex items-center px-5 py-2 font-display text-xl font-bold tracking-wide uppercase"
                style={{ color: white, border: `2px solid ${white}` }}
              >
                My account
              </span>
            </div>
          </div>
          <div className="hidden sm:block">
            <Banner />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-end justify-center gap-10">
        <JerseyNumber n="06" label="Spots left" />
        <JerseyNumber n="10" label="Players in" />
      </div>

      <Section label="Next match">
        <div className="flex gap-5 border-l-[6px] py-2 pl-4" style={{ borderColor: orange }}>
          <div className="flex w-14 flex-col items-center font-display leading-none uppercase">
            <span className="text-sm font-bold tracking-[0.2em]" style={{ color: orange }}>
              SAT
            </span>
            <span className="text-5xl font-black">31</span>
            <span className="text-sm font-bold tracking-[0.2em] text-ink-soft">OCT</span>
          </div>
          <div className="space-y-1">
            <p className="font-display text-2xl font-extrabold uppercase">Practice match · Gym 2</p>
            <p className="text-ink-soft">8:00 – 10:00 p.m. · Aaniin Community Centre · $10</p>
            <p className="font-display text-sm font-bold tracking-wide uppercase" style={{ color: orange }}>
              ● 6 spots left on the court
            </p>
          </div>
        </div>
      </Section>

      <Section label="Squads">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {[
            { name: "Crows", players: ["Jane Doe", "Sam Lee", "Dev Rao"], numbers: ["10", "9", "5"] },
            { name: "Cats", players: ["Mia Wong", "Leo Silva", "Priya Kaur"], numbers: ["1", "4", "11"] },
          ].map((t, i) => (
            <div
              key={t.name}
              className="border-2"
              style={{ borderColor: i === 0 ? orange : black, boxShadow: `4px 4px 0 ${i === 0 ? orange : black}` }}
            >
              <div className="flex items-center justify-between px-3 py-2.5" style={{ background: black, color: white }}>
                <span className="font-display text-xl font-black uppercase">Team {t.name}</span>
                {i === 0 && (
                  <span className="font-display text-xs font-bold tracking-[0.2em] uppercase" style={{ color: orange }}>
                    ★ Your squad
                  </span>
                )}
              </div>
              <ul>
                {t.players.map((p, j) => (
                  <li key={p} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0" style={{ borderColor: "#1111111f" }}>
                    <span
                      className="flex size-8 items-center justify-center font-display text-base font-black"
                      style={{ ...jersey, background: i === 0 ? black : orange, color: white }}
                    >
                      {t.numbers[j]}
                    </span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <section className="px-5 py-4" style={{ background: orange, color: black, boxShadow: `6px 6px 0 ${black}` }}>
        <p className="font-display text-sm font-black tracking-[0.3em] uppercase">● Announcement</p>
        <p className="mt-1 font-display text-3xl leading-tight font-black uppercase">Training camp this Saturday.</p>
        <p className="mt-1">Gym 3, same time. Bring water and your loudest &ldquo;nice receive!&rdquo;</p>
      </section>
    </div>
  );
}
