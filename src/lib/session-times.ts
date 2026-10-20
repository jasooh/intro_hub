// A session's two blocks, instructional then drop-in, entered as four clock
// times (HH:MM). Each time is read as the next time on the clock after the one
// before it, so a drop-in ending at 00:15 after an 21:00 start is just past
// midnight. Shared by the session/template forms and their server actions.

export type BlockClocks = {
  instructional_start: string;
  instructional_end: string;
  dropin_start: string;
  dropin_end: string;
};

/** Minutes after the instructional start. */
export type BlockOffsets = { instructionalEnd: number; dropinStart: number; end: number };

export const DEFAULT_CLOCKS: BlockClocks = {
  instructional_start: "20:00",
  instructional_end: "20:45",
  dropin_start: "21:00",
  dropin_end: "23:45",
};

const CLOCK = /^\d{2}:\d{2}$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Minutes from `from` forward to the next `to` on the clock (0 when they're equal). */
const forward = (from: string, to: string) => (toMin(to) - toMin(from) + 1440) % 1440;

export function blockOffsets(c: BlockClocks): { offsets: BlockOffsets } | { error: string } {
  if (![c.instructional_start, c.instructional_end, c.dropin_start, c.dropin_end].every((t) => CLOCK.test(t))) {
    return { error: "Fill in all four times" };
  }
  const instructionalEnd = forward(c.instructional_start, c.instructional_end);
  if (instructionalEnd === 0) return { error: "Instructional has to end after it starts" };
  const dropinStart = instructionalEnd + forward(c.instructional_end, c.dropin_start);
  // A drop-in "start" that's on the clock before the lesson ends would wrap a whole day.
  if (dropinStart - instructionalEnd > 12 * 60) return { error: "Drop-in has to start after instructional ends" };
  const dropinLength = forward(c.dropin_start, c.dropin_end);
  if (dropinLength === 0) return { error: "Drop-in has to end after it starts" };
  const end = dropinStart + dropinLength;
  if (end > 16 * 60) return { error: "That's longer than 16 hours. Check the times" };
  return { offsets: { instructionalEnd, dropinStart, end } };
}

/** HH:MM `minutes` after `start` (HH:MM[:SS]). */
export function clockPlus(start: string, minutes: number) {
  const total = (toMin(start) + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** "3 h 45 min", "45 min", "2 h". */
export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} h` : null, m || !h ? `${m} min` : null].filter(Boolean).join(" ");
}
