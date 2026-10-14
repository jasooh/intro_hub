import Link from "next/link";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import type { RegistrationStatus } from "@/lib/types";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/** Stagger index for the `.reveal` page-load animation. */
export function reveal(i: number): CSSProperties {
  return { "--i": i } as CSSProperties;
}

// ---------------------------------------------------------------------------
// Buttons: square, condensed caps, a hard ink shadow that presses in.
// ---------------------------------------------------------------------------

const press =
  "shadow-[3px_3px_0_var(--shadow)] hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_var(--shadow)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none";

const buttonVariants = {
  primary: cn("border-2 border-ink bg-line text-[#fff8ee] [--shadow:var(--ink)]", press),
  secondary: cn("border-2 border-ink bg-transparent text-ink hover:bg-maple-deep [--shadow:var(--ink)]", press),
  danger: cn("border-2 border-bad bg-transparent text-bad hover:bg-bad hover:text-[#fff8ee] [--shadow:var(--bad)]", press),
  ghost: "text-ink-soft decoration-line decoration-2 underline-offset-[6px] hover:text-ink hover:underline",
};

export type ButtonVariant = keyof typeof buttonVariants;

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 font-display font-bold tracking-wide whitespace-nowrap uppercase transition-[transform,box-shadow,background-color,color] duration-100 disabled:pointer-events-none disabled:opacity-50",
    variant === "ghost" ? (size === "sm" ? "py-1 text-base" : "py-2 text-lg") : size === "sm" ? "px-3 py-1 text-base" : "px-5 py-2 text-xl",
    buttonVariants[variant],
  );
}

/** "← Back" link above a page's content, on its own row. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="pb-4">
      <Link href={href} className={cn(buttonClass("ghost", "sm"), "group gap-1.5")}>
        <span aria-hidden className="transition-transform group-hover:-translate-x-1">
          ←
        </span>
        {children}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout: sheets and rules instead of rounded cards.
// ---------------------------------------------------------------------------

/** A scoresheet section: heavy ink rule, optional caps label and action, then content. */
export function Sheet({
  label,
  action,
  className,
  children,
  ...props
}: Omit<ComponentProps<"section">, "title"> & { label?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cn("border-t-2 border-ink pt-3", className)} {...props}>
      {(label || action) && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          {label && <h2 className="font-display text-sm font-bold tracking-[0.2em] text-ink-soft uppercase">{label}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Status: a court-dot glyph + small caps in a status colour. No pills.
// ---------------------------------------------------------------------------

export type Tone = "ok" | "warn" | "mat" | "bad" | "muted" | "line";

const toneClass: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  mat: "text-mat",
  bad: "text-bad",
  muted: "text-ink-soft",
  line: "text-line",
};

export function Mark({
  tone,
  glyph,
  struck,
  className,
  children,
}: {
  tone: Tone;
  glyph: string;
  struck?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-display text-sm font-bold tracking-[0.12em] whitespace-nowrap uppercase",
        toneClass[tone],
        className,
      )}
    >
      <Glyph glyph={glyph} />
      <span className={cn(struck && "line-through decoration-2")}>{children}</span>
    </span>
  );
}

/** Court dots drawn in CSS (the display font has no ●◐○); other symbols use the body font. */
function Glyph({ glyph }: { glyph: string }) {
  const dot = "inline-block size-[0.6em] shrink-0 rounded-full border-[1.5px] border-current";
  if (glyph === "●") return <span aria-hidden className={cn(dot, "bg-current")} />;
  if (glyph === "◐") return <span aria-hidden className={cn(dot, "bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]")} />;
  if (glyph === "○") return <span aria-hidden className={dot} />;
  return (
    <span aria-hidden className="font-sans text-[0.95em] leading-none font-bold">
      {glyph}
    </span>
  );
}

const statusMarks: Record<RegistrationStatus, { label: string; tone: Tone; glyph: string; struck?: boolean }> = {
  confirmed: { label: "Confirmed", tone: "ok", glyph: "●" },
  pending_payment: { label: "Holding · unpaid", tone: "warn", glyph: "◐" },
  waitlisted: { label: "Waitlist", tone: "mat", glyph: "○" },
  expired: { label: "Expired", tone: "muted", glyph: "✕", struck: true },
  cancelled: { label: "Cancelled", tone: "muted", glyph: "✕", struck: true },
};

export function StatusMark({ status, suffix }: { status: RegistrationStatus; suffix?: string }) {
  const m = statusMarks[status];
  return (
    <Mark tone={m.tone} glyph={m.glyph} struck={m.struck}>
      {m.label}
      {suffix && ` ${suffix}`}
    </Mark>
  );
}

// ---------------------------------------------------------------------------
// Scoreboard pieces
// ---------------------------------------------------------------------------

/** One dot per spot: filled = confirmed, half = holding a spot, ring = open. */
export function SpotDots({
  capacity,
  confirmed,
  holding,
  size = "md",
  className,
}: {
  capacity: number;
  confirmed: number;
  holding: number;
  size?: "sm" | "md";
  className?: string;
}) {
  if (capacity > 40) {
    // Too many dots to read: fall back to a two-tone court line.
    const pct = (n: number) => `${Math.min((n / capacity) * 100, 100)}%`;
    return (
      <div className={cn("flex h-2 w-full max-w-64 border border-ink", className)}>
        <div className="bg-ink" style={{ width: pct(confirmed) }} />
        <div className="bg-ink/40" style={{ width: pct(holding) }} />
      </div>
    );
  }
  const dot = size === "sm" ? "size-2" : "size-3";
  return (
    <div
      className={cn("flex flex-wrap", size === "sm" ? "gap-1" : "gap-1.5", className)}
      role="img"
      aria-label={`${confirmed} confirmed, ${holding} holding, ${Math.max(capacity - confirmed - holding, 0)} open of ${capacity}`}
    >
      {Array.from({ length: capacity }, (_, i) => {
        const kind = i < confirmed ? "full" : i < confirmed + holding ? "half" : "open";
        return (
          <span
            key={i}
            className={cn(
              dot,
              "animate-fill-dot rounded-full border-[1.5px] border-ink",
              kind === "full" && "bg-ink",
              kind === "half" && "bg-[linear-gradient(90deg,var(--ink)_50%,transparent_50%)]",
              kind === "open" && "border-ink/45",
            )}
            style={{ animationDelay: `${i * 30}ms` }}
          />
        );
      })}
    </div>
  );
}

/** Dot-matrix LED readout on a black panel. */
export function Scoreboard({
  value,
  label,
  size = "md",
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-1 bg-board shadow-[inset_0_0_0_2px_#2a241f,4px_4px_0_var(--line)]",
        size === "sm" ? "px-3 py-2" : size === "lg" ? "px-6 py-4" : "px-4 py-3",
        className,
      )}
    >
      <span
        className={cn(
          "led animate-flicker font-score leading-none font-black whitespace-nowrap tabular-nums",
          size === "sm" ? "text-3xl" : size === "lg" ? "text-6xl sm:text-7xl" : "text-5xl",
        )}
      >
        {value}
      </span>
      <span className="font-display text-[11px] font-bold tracking-[0.3em] text-[#f2e3c6]/60 uppercase">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// People and forms
// ---------------------------------------------------------------------------

export function Avatar({ name, src, size = 32 }: { name: string; src: string | null; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return src ? (
    // Google avatar URLs; next/image would need remotePatterns config for little benefit.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      className="shrink-0 rounded-full bg-maple-deep ring-2 ring-ink"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-mat font-display font-bold text-[#f2e3c6] ring-2 ring-ink"
      style={{ width: size, height: size, fontSize: Math.max(size * 0.4, 11) }}
    >
      {initials}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="font-display text-sm font-bold tracking-[0.15em] text-ink uppercase">{label}</span>
      {children}
      {hint && <span className="block text-sm text-ink-soft">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "block w-full rounded-none border-0 border-b-2 border-ink bg-transparent px-0 py-2 text-lg text-ink placeholder:text-ink-soft/60 focus:border-line focus:ring-0 focus:outline-none";

export function PageSpinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-16" aria-label="Loading">
      <div className="size-5 animate-bounce-ball rounded-full border-2 border-ink bg-line" />
      <div className="h-1 w-5 rounded-full bg-ink/20" />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="border-y-2 border-dashed border-ink/35 py-8 text-center font-display text-lg font-semibold tracking-wide text-ink-soft uppercase">
      {children}
    </p>
  );
}

/** Notice line for errors/success: a coloured left court-line, no box. */
export function Notice({ tone, children }: { tone: "bad" | "ok"; children: ReactNode }) {
  return (
    <p
      className={cn(
        "border-l-4 py-1 pl-3 text-sm font-semibold",
        tone === "bad" ? "border-bad text-bad" : "border-ok text-ok",
      )}
    >
      {children}
    </p>
  );
}

/** Big condensed page heading with an optional eyebrow and intro line. */
export function PageTitle({ eyebrow, sub, children }: { eyebrow?: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="reveal space-y-2" style={reveal(0)}>
      {eyebrow && <p className="font-display text-sm font-bold tracking-[0.3em] text-line uppercase">{eyebrow}</p>}
      <h1 className="font-display text-5xl leading-[0.85] font-black tracking-tight uppercase sm:text-6xl">
        {children}
        <span className="text-line">.</span>
      </h1>
      {sub && <p className="max-w-2xl text-ink-soft">{sub}</p>}
    </div>
  );
}
