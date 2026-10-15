"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** Copies `value` to the clipboard and briefly shows "Copied". */
export function CopyButton({
  value,
  label,
  tone = "light",
  className,
}: {
  value: string;
  /** What's being copied, for the screen-reader label and the toast ("Code copied"). */
  label: string;
  /** "dark" for use on the scoreboard panel. */
  tone?: "light" | "dark";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers / non-secure contexts: fall back to a hidden textarea.
      const el = document.createElement("textarea");
      el.value = value;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      if (!ok) {
        toast.error(`Couldn't copy. Press and hold the ${label.toLowerCase()} to copy it.`);
        return;
      }
    }
    setCopied(true);
    toast.success(`${label} copied`);
  }

  const colors =
    tone === "dark"
      ? "border-maple/40 text-maple hover:border-line hover:text-line"
      : "border-ink/40 text-ink-soft hover:border-ink hover:text-ink";

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
      className={`inline-flex shrink-0 items-center gap-1.5 border-2 px-2.5 py-1 font-display text-sm font-bold tracking-wide uppercase transition-colors ${colors} ${className ?? ""}`}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
