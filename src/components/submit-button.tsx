"use client";

import { useRef, useState, type ReactNode } from "react";
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
import { buttonClass, type ButtonVariant } from "@/components/ui";

/** A confirmation step before submitting. A plain string is used as the title. */
export type Confirm = string | { title: string; description?: ReactNode; action?: string };

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  confirm,
  className,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  confirm?: Confirm;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const button = (
    <button
      ref={buttonRef}
      type={confirm ? "button" : "submit"}
      disabled={pending}
      className={`${buttonClass(variant, size)} ${className ?? ""}`}
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              variant={variant === "danger" ? "destructive" : "default"}
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
