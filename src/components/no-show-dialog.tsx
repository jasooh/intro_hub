"use client";

import { useRef, useState } from "react";
import { acknowledgeNoShows } from "@/app/actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui";

/** Polite "please cancel early next time" pop-up. Closing it any way marks it seen. */
export function NoShowDialog({ sessionTitle, when }: { sessionTitle: string | null; when: string | null }) {
  const [open, setOpen] = useState(true);
  const sent = useRef(false);

  function close() {
    setOpen(false);
    if (sent.current) return;
    sent.current = true;
    void acknowledgeNoShows();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="rounded-none border-2 bg-[#f7ecd6] shadow-[6px_6px_0_var(--ink)] sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-2xl leading-none font-black tracking-tight uppercase">
            We missed you{sessionTitle ? ` at ${sessionTitle}` : ""}
          </DialogTitle>
          <DialogDescription className="space-y-3 text-base text-ink">
            <span className="block">
              {when ? `You had a spot on ${when}, but we didn't see you. ` : "You had a spot but we didn't see you. "}
              Plans change, and that&apos;s okay!
            </span>
            <span className="block">
              If you can&apos;t make it, please cancel from the session page as early as you can. Your spot could go to
              someone on the waitlist who&apos;d love to play. Thank you, and we hope to see you next time.
            </span>
          </DialogDescription>
        </DialogHeader>
        <button type="button" onClick={close} className={buttonClass("primary")}>
          Got it
        </button>
      </DialogContent>
    </Dialog>
  );
}
