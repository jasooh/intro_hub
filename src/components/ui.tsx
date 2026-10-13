import type { ComponentProps, ReactNode } from "react";
import type { RegistrationStatus } from "@/lib/types";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const buttonVariants = {
  primary: "bg-orange-600 text-white hover:bg-orange-700",
  secondary: "border border-stone-700 bg-stone-900 text-stone-200 hover:bg-stone-800",
  danger: "border border-red-900 bg-stone-900 text-red-300 hover:bg-red-950/50",
  ghost: "text-stone-400 hover:bg-stone-800",
};

export type ButtonVariant = keyof typeof buttonVariants;

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "px-2.5 py-1 text-sm" : "px-4 py-2",
    buttonVariants[variant],
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-stone-800 bg-stone-900 p-5 shadow-sm", className)} {...props} />;
}

const statusStyles: Record<RegistrationStatus, [string, string]> = {
  confirmed: ["Confirmed", "bg-green-950 text-green-300"],
  pending_payment: ["Awaiting payment", "bg-amber-950 text-amber-300"],
  waitlisted: ["Waitlisted", "bg-sky-950 text-sky-300"],
  expired: ["Expired", "bg-stone-800 text-stone-300"],
  cancelled: ["Cancelled", "bg-stone-800 text-stone-300"],
};

export function StatusBadge({ status }: { status: RegistrationStatus }) {
  const [label, style] = statusStyles[status];
  return <Badge className={style}>{label}</Badge>;
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

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
      className="shrink-0 rounded-full bg-stone-800"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-orange-950 text-xs font-semibold text-orange-300"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-stone-300">{label}</span>
      {children}
      {hint && <span className="block text-xs text-stone-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "block w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-stone-100 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30";

export function PageSpinner() {
  return (
    <div className="flex justify-center py-16" aria-label="Loading">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-700 border-t-orange-600" />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-stone-700 p-6 text-center text-stone-400">{children}</p>;
}
