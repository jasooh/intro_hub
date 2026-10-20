// Court mode helpers: which game is on, stepping through the rotation, and the
// game clock. Pure functions so they can be tested without a browser.

/** Where court mode is in the schedule. Rounds count how many times the rotation has started over. */
export type CourtPosition = { round: number; slot: number };

/**
 * The game that should be on at `nowMs`, when games have a set length: slots
 * run back to back from `startMs`, and the rotation repeats. Before the start
 * (or without a length) it's the first game.
 */
export function positionAt(startMs: number, nowMs: number, minutes: number | null, slots: number): CourtPosition {
  if (!minutes || slots < 1 || nowMs < startMs) return { round: 1, slot: 1 };
  const index = Math.floor((nowMs - startMs) / (minutes * 60_000));
  return { round: Math.floor(index / slots) + 1, slot: (index % slots) + 1 };
}

/** The next (+1) or previous (-1) game; after the last slot the rotation starts again. Never before round 1, game 1. */
export function stepGame(pos: CourtPosition, slots: number, dir: 1 | -1): CourtPosition {
  if (slots < 1) return pos;
  const index = (pos.round - 1) * slots + (pos.slot - 1) + dir;
  if (index < 0) return { round: 1, slot: 1 };
  return { round: Math.floor(index / slots) + 1, slot: (index % slots) + 1 };
}

/** "12:05" from milliseconds (rounded up while counting down, so 0:00 only shows at the end). */
export function clockText(ms: number, countingDown: boolean) {
  const total = Math.max(0, countingDown ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Game clock state: time banked while paused plus when the current run started. */
export type GameClock = { elapsedMs: number; runningSince: number | null };

export const STOPPED: GameClock = { elapsedMs: 0, runningSince: null };

export function elapsed(clock: GameClock, nowMs: number) {
  return clock.elapsedMs + (clock.runningSince == null ? 0 : Math.max(0, nowMs - clock.runningSince));
}

export function startClock(clock: GameClock, nowMs: number): GameClock {
  return clock.runningSince == null ? { ...clock, runningSince: nowMs } : clock;
}

export function pauseClock(clock: GameClock, nowMs: number): GameClock {
  return clock.runningSince == null ? clock : { elapsedMs: elapsed(clock, nowMs), runningSince: null };
}
