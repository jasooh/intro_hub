import { SKILL_RANKS, skillLabel } from "@/lib/skill";
import { cn } from "@/lib/utils";

/**
 * Five ascending bars, like signal strength: filled up to `value`. Orange when
 * filled; the empty ones follow the surrounding text colour, faded.
 */
export function SkillMeter({ value, size = "md", className }: { value: number | null; size?: "sm" | "md"; className?: string }) {
  const unit = size === "sm" ? 3 : 5;
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-end", size === "sm" ? "gap-px" : "gap-[3px]", className)}>
      {SKILL_RANKS.map((r) => (
        <span
          key={r.value}
          style={{ width: unit + 1, height: (r.value + 1) * unit }}
          className={value != null && r.value <= value ? "bg-line" : "bg-current opacity-20"}
        />
      ))}
    </span>
  );
}

/** Read-only rank: dot-matrix number, meter and name. */
export function SkillBadge({ value, className }: { value: number | null; className?: string }) {
  const label = skillLabel(value);
  if (value == null || !label) return <span className="text-ink-soft">Not given</span>;
  return (
    <span className={cn("inline-flex items-center gap-2 align-middle", className)}>
      <span className="font-score text-2xl leading-none font-black">{value}</span>
      <SkillMeter value={value} size="sm" />
      <span className="font-display text-sm font-bold tracking-[0.12em] uppercase">{label}</span>
    </span>
  );
}

/**
 * The profile's skill picker: five ruled rows, strongest on top, so it reads as
 * a ladder. The picked row lights up like the scoreboard.
 */
export function SkillLadder({ name, defaultValue, required }: { name: string; defaultValue: number | null; required?: boolean }) {
  return (
    <div className="space-y-2">
      {[...SKILL_RANKS].reverse().map((r) => (
        <label
          key={r.value}
          className="group/row relative flex cursor-pointer items-center gap-3 border-2 border-ink/25 px-3 py-2.5 transition-[background-color,box-shadow,transform] hover:bg-maple-deep/60 has-[:checked]:-translate-x-0.5 has-[:checked]:-translate-y-0.5 has-[:checked]:border-ink has-[:checked]:bg-board has-[:checked]:text-maple has-[:checked]:shadow-[4px_4px_0_var(--line)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-line"
        >
          <input type="radio" name={name} value={r.value} defaultChecked={defaultValue === r.value} required={required} className="peer sr-only" />
          <span className="w-8 shrink-0 text-center font-score text-4xl leading-none font-black text-ink-soft group-has-[:checked]/row:animate-flicker group-has-[:checked]/row:text-led">
            {r.value}
          </span>
          <SkillMeter value={r.value} />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg leading-tight font-black tracking-[0.08em] uppercase">{r.label}</span>
            <span className="block text-sm leading-snug text-ink-soft group-has-[:checked]/row:text-maple/80">{r.blurb}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
