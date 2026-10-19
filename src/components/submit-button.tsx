"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFlashOnSettle } from "@/components/flash-toaster";
import { buttonClass, type ButtonVariant } from "@/components/ui";

/** A confirmation step before submitting. A plain string is used as the title. */
export type Confirm = string | { title: string; description?: ReactNode; action?: string };

/** The form's current values, for comparing against what it loaded with. */
function snapshot(form: HTMLFormElement) {
  return JSON.stringify([...new FormData(form).entries()].map(([k, v]) => [k, typeof v === "string" ? v : v.name]));
}

/**
 * Whether the button's form differs from its last saved state. Re-baselines
 * after each save (and after React resets the form), so it greys out again.
 */
function useFormChanged(buttonRef: RefObject<HTMLButtonElement | null>, enabled: boolean, pending: boolean) {
  const [changed, setChanged] = useState(false);
  const baseline = useRef<string | null>(null);

  useEffect(() => {
    const form = buttonRef.current?.form;
    if (!enabled || !form) return;
    baseline.current = snapshot(form);
    const check = () => setChanged(snapshot(form) !== baseline.current);
    const rebase = () =>
      requestAnimationFrame(() => {
        baseline.current = snapshot(form);
        setChanged(false);
      });
    form.addEventListener("input", check);
    form.addEventListener("change", check);
    form.addEventListener("reset", rebase);
    return () => {
      form.removeEventListener("input", check);
      form.removeEventListener("change", check);
      form.removeEventListener("reset", rebase);
    };
  }, [buttonRef, enabled]);

  // A finished save becomes the new baseline.
  const wasPending = useRef(false);
  useEffect(() => {
    const form = buttonRef.current?.form;
    if (enabled && form && wasPending.current && !pending) {
      requestAnimationFrame(() => {
        baseline.current = snapshot(form);
        setChanged(false);
      });
    }
    wasPending.current = pending;
  }, [buttonRef, enabled, pending]);

  return !enabled || changed;
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  confirm,
  requireChange = false,
  bare = false,
  disabled = false,
  name,
  value,
  className,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  confirm?: Confirm;
  /** Disabled until a field in the form changes (for "Save" on edit forms). */
  requireChange?: boolean;
  /** Skip the standard button styles (style it entirely with className). */
  bare?: boolean;
  /** Can't be pressed right now (e.g. nothing to send). */
  disabled?: boolean;
  /** Like a native submit button: sent with the form when this button submits it. */
  name?: string;
  value?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  useFlashOnSettle();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const changed = useFormChanged(buttonRef, requireChange, pending);

  const button = (
    <button
      ref={buttonRef}
      type={confirm ? "button" : "submit"}
      name={confirm ? undefined : name}
      value={confirm ? undefined : value}
      disabled={pending || !changed || disabled}
      title={changed ? undefined : "No changes to save"}
      className={`${bare ? "disabled:pointer-events-none disabled:opacity-40" : buttonClass(variant, size)} ${className ?? ""}`}
      onClick={confirm ? () => setOpen(true) : undefined}
    >
      {pending ? "Working…" : children}
    </button>
  );
  if (!confirm) return button;

  const { title, description, action } = typeof confirm === "string" ? { title: confirm } : confirm;
  return (
    <>
      {button}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="rounded-none border-2 bg-[#f7ecd6] shadow-[6px_6px_0_var(--ink)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-3xl leading-none font-black uppercase">{title}</AlertDialogTitle>
            {description && <AlertDialogDescription className="text-base text-ink-soft">{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 pt-2">
            <AlertDialogCancel variant="ghost" className={`h-auto rounded-none ${buttonClass("secondary")}`}>
              Go back
            </AlertDialogCancel>
            <AlertDialogAction
              variant="ghost"
              className={`h-auto rounded-none ${buttonClass(variant === "danger" ? "danger" : "primary")}`}
              onClick={() => buttonRef.current?.form?.requestSubmit()}
            >
              {action ?? (typeof children === "string" ? children : "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
