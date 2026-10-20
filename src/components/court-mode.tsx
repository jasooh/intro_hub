"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clockText,
  elapsed,
  pauseClock,
  positionAt,
  startClock,
  stepGame,
  STOPPED,
  type CourtPosition,
  type GameClock,
} from "@/lib/court";
import { pad2 } from "@/lib/format";

export type CourtTeam = { id: string; name: string; players: string[] };
export type CourtGame = { slot: number; court: number; a: string; b: string };

type Saved = { pos: CourtPosition; clock: GameClock; scores: Record<string, [number, number]> };

const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 border-2 border-maple/35 px-4 font-display text-base font-bold tracking-[0.12em] uppercase transition-colors hover:border-line hover:text-line focus-visible:outline-2 focus-visible:outline-line disabled:opacity-40 disabled:hover:border-maple/35 disabled:hover:text-maple";
const btnHot = `${btn} border-line bg-line text-board hover:bg-led hover:text-board`;

/**
 * Court mode: a full-screen scoreboard for the gym. Shows the game that's on
 * (each court's matchup with rosters), a game clock, tap-to-score, who sits out
 * and what's next. Scores and the clock live on this device only (saved in the
 * browser so a refresh keeps them).
 */
export function CourtMode({
  sessionId,
  title,
  backHref,
  startIso,
  minutes,
  timeZone,
  teams,
  games,
}: {
  sessionId: string;
  title: string;
  backHref: string;
  /** When drop-in games start (slot times count up from here). */
  startIso: string;
  /** Game length; null = games go to a score (the clock counts up). */
  minutes: number | null;
  timeZone: string;
  teams: CourtTeam[];
  games: CourtGame[];
}) {
  const storeKey = `court:${sessionId}`;
  const slots = Math.max(0, ...games.map((g) => g.slot));
  const byId = new Map(teams.map((t) => [t.id, t]));

  const [now, setNow] = useState<number | null>(null);
  const [state, setState] = useState<Saved>({ pos: { round: 1, slot: 1 }, clock: STOPPED, scores: {} });
  const loaded = useRef(false);

  // Load what this device saved, or start on the game the clock says is on.
  useEffect(() => {
    const t = Date.now();
    let saved: Saved | null = null;
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) saved = JSON.parse(raw) as Saved;
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
    setState(saved ?? { pos: positionAt(new Date(startIso).getTime(), t, minutes, slots), clock: STOPPED, scores: {} });
    setNow(t);
    loaded.current = true;
  }, [storeKey, startIso, minutes, slots]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(storeKey, JSON.stringify(state));
    } catch {}
  }, [storeKey, state]);

  // Tick a few times a second (the clock and the time of day).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Keep the screen awake while court mode is open.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const grab = () => {
      if (document.visibilityState === "visible") nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    grab();
    document.addEventListener("visibilitychange", grab);
    return () => {
      document.removeEventListener("visibilitychange", grab);
      lock?.release().catch(() => {});
    };
  }, []);

  const { pos, clock, scores } = state;
  const ms = now == null ? clock.elapsedMs : elapsed(clock, now);
  const limit = minutes ? minutes * 60_000 : null;
  const timeUp = limit != null && ms >= limit;
  const running = clock.runningSince != null;

  // Three short beeps when the time runs out.
  const beeped = useRef(false);
  useEffect(() => {
    if (timeUp && running && !beeped.current) {
      beeped.current = true;
      beep();
    }
    if (!timeUp) beeped.current = false;
  }, [timeUp, running]);

  const setClock = (c: GameClock) => setState((s) => ({ ...s, clock: c }));
  const go = useCallback(
    (dir: 1 | -1) => setState((s) => ({ ...s, pos: stepGame(s.pos, slots, dir), clock: STOPPED })),
    [slots],
  );
  const scoreKey = (court: number) => `${pos.round}:${pos.slot}:${court}`;
  const addPoint = (court: number, side: 0 | 1, delta: number) =>
    setState((s) => {
      const cur = s.scores[scoreKey(court)] ?? [0, 0];
      const next: [number, number] = [...cur];
      next[side] = Math.max(0, next[side] + delta);
      return { ...s, scores: { ...s.scores, [scoreKey(court)]: next } };
    });

  const current = games.filter((g) => g.slot === pos.slot).sort((a, b) => a.court - b.court);
  const nextPos = stepGame(pos, slots, 1);
  const upNext = games.filter((g) => g.slot === nextPos.slot).sort((a, b) => a.court - b.court);
  const playing = new Set(current.flatMap((g) => [g.a, g.b]));
  const sitting = teams.filter((t) => !playing.has(t.id));
  const multiCourt = games.some((g) => g.court > 1);
  const slotStart =
    minutes && now != null
      ? new Date(new Date(startIso).getTime() + ((pos.round - 1) * slots + pos.slot - 1) * minutes * 60_000)
      : null;
  const fmt = (d: Date | number) => new Intl.DateTimeFormat("en-CA", { timeZone, hour: "numeric", minute: "2-digit" }).format(d);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-board text-maple" role="region" aria-label="Court mode">
      <header className="sticky top-0 z-10 border-b-[3px] border-line bg-board">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Link href={backHref} className="font-display text-base font-bold tracking-[0.12em] uppercase hover:text-line">
            ← Exit
          </Link>
          <p className="min-w-0 flex-1 truncate font-display text-lg font-black tracking-wide uppercase">{title}</p>
          <span className="led font-score text-xl font-black tabular-nums" aria-label="Time now">
            {now == null ? "--:--" : fmt(now)}
          </span>
          <button type="button" onClick={toggleFullscreen} className="hidden font-display text-base font-bold tracking-[0.12em] uppercase hover:text-line sm:block">
            Full screen
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-5">
        {teams.length === 0 ? (
          <Empty backHref={backHref}>No teams yet. Make teams on the session page first.</Empty>
        ) : (
          <>
            {/* Game picker + clock */}
            <section className="grid grid-cols-1 items-center gap-4 border-2 border-maple/20 p-4 md:grid-cols-[1fr_auto_1fr]">
              <div className="flex items-center gap-3">
                {slots > 0 ? (
                  <>
                    <button type="button" onClick={() => go(-1)} disabled={pos.round === 1 && pos.slot === 1} className={btn} aria-label="Previous game">
                      ◂
                    </button>
                    <div className="min-w-0 leading-none">
                      <p className="font-display text-sm font-bold tracking-[0.2em] whitespace-nowrap text-maple/60 uppercase">
                        Game{pos.round > 1 ? ` · Rd ${pos.round}` : ""}
                      </p>
                      <p className="font-score text-4xl font-black">
                        {pad2(pos.slot)}
                        <span className="text-2xl text-maple/40">/{pad2(slots)}</span>
                      </p>
                      {slotStart && <p className="mt-1 text-sm text-maple/60">Starts {fmt(slotStart)}</p>}
                    </div>
                    <button type="button" onClick={() => go(1)} className={btn} aria-label="Next game">
                      ▸
                    </button>
                  </>
                ) : (
                  <p className="text-maple/70">
                    No game schedule yet: the teams are below. Make a schedule on the session page to rotate games here.
                  </p>
                )}
              </div>

              <div className="text-center">
                <p
                  className={`font-score text-7xl leading-none font-black tabular-nums sm:text-8xl ${timeUp ? "animate-pulse text-line" : "led"}`}
                  aria-live="off"
                  aria-label={limit ? "Time left" : "Time played"}
                >
                  {timeUp ? "0:00" : clockText(limit ? limit - ms : ms, Boolean(limit))}
                </p>
                <p className="mt-1 font-display text-sm font-bold tracking-[0.2em] text-maple/60 uppercase">
                  {timeUp ? "Time!" : limit ? `${minutes} min game` : "Game clock"}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 md:justify-end">
                {running ? (
                  <button type="button" onClick={() => now != null && setClock(pauseClock(clock, now))} className={btn}>
                    Pause
                  </button>
                ) : (
                  <button type="button" onClick={() => setClock(startClock(clock, Date.now()))} className={btnHot}>
                    {clock.elapsedMs > 0 ? "Resume" : "Start"}
                  </button>
                )}
                <button type="button" onClick={() => setClock(STOPPED)} className={btn} disabled={!running && clock.elapsedMs === 0}>
                  Reset
                </button>
                {slots > 0 && timeUp && (
                  <button type="button" onClick={() => go(1)} className={btnHot}>
                    Next game ▸
                  </button>
                )}
              </div>
            </section>

            {/* Courts */}
            {current.length > 0 ? (
              <div className={`grid grid-cols-1 gap-5 ${current.length > 1 ? "lg:grid-cols-2" : ""} ${current.length > 2 ? "2xl:grid-cols-3" : ""}`}>
                {current.map((g) => {
                  const score = scores[scoreKey(g.court)] ?? [0, 0];
                  return (
                    <section key={g.court} className="border-2 border-maple/25 shadow-[5px_5px_0_var(--line)]" aria-label={`Court ${g.court}`}>
                      <p className="flex items-center gap-2 bg-maple px-3 py-1.5 font-display text-lg font-black tracking-[0.2em] text-board uppercase">
                        <span aria-hidden className="size-2.5 bg-line" />
                        {multiCourt ? `Court ${g.court}` : "On court"}
                      </p>
                      <div className="grid grid-cols-2 divide-x-2 divide-maple/15">
                        {([g.a, g.b] as const).map((teamId, side) => {
                          const team = byId.get(teamId);
                          return (
                            <div key={teamId} className="flex min-w-0 flex-col items-center gap-3 p-3 sm:p-4">
                              <h2
                                title={team?.name}
                                className="flex min-h-[2.5em] w-full items-center justify-center text-center font-display text-2xl leading-[1.25] font-black uppercase [overflow-wrap:anywhere] sm:text-3xl"
                              >
                                <span className="line-clamp-2">{team?.name ?? "?"}</span>
                              </h2>
                              <button
                                type="button"
                                onClick={() => addPoint(g.court, side as 0 | 1, 1)}
                                className="led w-full border-2 border-maple/15 py-2 font-score text-7xl leading-none font-black tabular-nums hover:border-line sm:text-8xl"
                                aria-label={`${team?.name}: ${score[side]} points. Tap to add a point`}
                              >
                                {score[side]}
                              </button>
                              <button
                                type="button"
                                onClick={() => addPoint(g.court, side as 0 | 1, -1)}
                                disabled={score[side] === 0}
                                className={`${btn} min-h-9 w-full text-sm`}
                                aria-label={`Take a point off ${team?.name}`}
                              >
                                − 1
                              </button>
                              <ul className="w-full space-y-0.5 text-center text-sm text-maple/70">
                                {team?.players.map((p) => (
                                  <li key={p} className="truncate">
                                    {p}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : slots > 0 ? null : (
              <TeamList teams={teams} />
            )}

            {slots > 0 && (
              <section className="grid grid-cols-1 gap-x-8 gap-y-4 border-t-2 border-maple/20 pt-4 md:grid-cols-2">
                <div>
                  <p className="font-display text-sm font-bold tracking-[0.2em] text-line uppercase">Up next</p>
                  <ul className="mt-1 space-y-1">
                    {upNext.map((g) => (
                      <li key={g.court} className="font-display text-xl font-bold uppercase [overflow-wrap:anywhere]">
                        {multiCourt && <span className="text-maple/50">Court {g.court} · </span>}
                        {byId.get(g.a)?.name} <span className="text-maple/50">vs</span> {byId.get(g.b)?.name}
                      </li>
                    ))}
                  </ul>
                </div>
                {sitting.length > 0 && (
                  <div>
                    <p className="font-display text-sm font-bold tracking-[0.2em] text-maple/60 uppercase">Sitting out</p>
                    <p className="mt-1 font-display text-xl font-bold uppercase [overflow-wrap:anywhere]">
                      {sitting.map((t) => t.name).join(", ")}
                    </p>
                  </div>
                )}
              </section>
            )}
          </>
        )}
        <p className="text-sm text-maple/45">Scores and the clock are kept on this device only.</p>
      </main>
    </div>
  );
}

function TeamList({ teams }: { teams: CourtTeam[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {teams.map((t) => (
        <section key={t.id} className="border-2 border-maple/25">
          <h2 className="bg-maple px-3 py-1.5 font-display text-xl font-black text-board uppercase [overflow-wrap:anywhere]">{t.name}</h2>
          <ul className="space-y-0.5 p-3 text-maple/80">
            {t.players.map((p) => (
              <li key={p} className="truncate">
                {p}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Empty({ backHref, children }: { backHref: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4 border-2 border-dashed border-maple/30 p-8 text-center">
      <p className="font-display text-xl font-bold tracking-wide uppercase">{children}</p>
      <Link href={backHref} className={btnHot}>
        Back to the session
      </Link>
    </div>
  );
}

/** Three short beeps (needs a tap first on most phones, which Start provides). */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((at) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.4, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.25);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {}
}
