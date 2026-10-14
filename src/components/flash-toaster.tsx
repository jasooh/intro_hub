"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Toaster, toast } from "sonner";

// Shows the one-shot "flash" cookie set by server actions (src/lib/flash.ts).
// Failed actions redirect with `?error=…`, which also becomes a toast.
// The cookie is checked after navigation, when a form's action settles, and whenever
// the browser reports a cookie change.

const CHECK_EVENT = "flash:check";

function showFlash() {
  const match = document.cookie.match(/(?:^|;\s*)flash=([^;]+)/);
  if (!match) return;
  document.cookie = "flash=; Max-Age=0; path=/; SameSite=Lax";
  try {
    const b64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const { k, m, id } = JSON.parse(new TextDecoder().decode(bytes)) as { k: "success" | "error"; m: string; id: string };
    if (k === "error") toast.error(m, { id });
    else toast.success(m, { id });
  } catch {
    // Malformed cookie: already cleared, nothing to show.
  }
}

/** Call inside a <form>: checks for a toast when that form's action finishes. */
export function useFlashOnSettle() {
  const { pending } = useFormStatus();
  useEffect(() => {
    if (!pending) window.dispatchEvent(new Event(CHECK_EVENT));
  }, [pending]);
}

/** For forms without a SubmitButton (e.g. a select that saves on change). */
export function FlashOnSettle() {
  useFlashOnSettle();
  return null;
}

/** After each navigation: show any flash, and turn `?error=` (set by failed actions) into a toast. */
function OnNavigate() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    showFlash();
    const error = params.get("error");
    if (!error) return;
    toast.error(error, { id: `error:${error}` });
    const rest = new URLSearchParams(params);
    rest.delete("error");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, params, router]);
  return null;
}

export function FlashToaster() {
  useEffect(() => {
    window.addEventListener(CHECK_EVENT, showFlash);
    const store = (window as Window & { cookieStore?: EventTarget }).cookieStore;
    store?.addEventListener("change", showFlash);
    return () => {
      window.removeEventListener(CHECK_EVENT, showFlash);
      store?.removeEventListener("change", showFlash);
    };
  }, []);

  return (
    <>
      <Toaster
        position="bottom-center"
        offset={20}
        mobileOffset={16}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              "flex w-full items-center gap-3 border-2 border-ink bg-[#f7ecd6] px-4 py-3 text-ink shadow-[4px_4px_0_var(--ink)] sm:w-[22rem]",
            title: "text-base font-semibold leading-snug",
            icon: "shrink-0",
            success: "[&_[data-icon]]:text-ok",
            error: "border-bad! shadow-[4px_4px_0_var(--bad)]! [&_[data-icon]]:text-bad",
          },
        }}
      />
      <Suspense>
        <OnNavigate />
      </Suspense>
    </>
  );
}
