"use client";

import { useRef, useState } from "react";
import { acknowledgeCover, declineCover } from "@/app/actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui";

/** One-time "someone is paying for you" pop-up. Closing it any way marks it seen. */
export function CoveredDialog({
  registrationId,
  sessionId,
  payerName,
  sessionTitle,
}: {
  registrationId: string;
  sessionId: string;
  payerName: string;
  sessionTitle: string;
}) {
  const [open, setOpen] = useState(true);
  const sent = useRef(false);

  function close() {
    setOpen(false);
    if (sent.current) return;
    sent.current = true;
    void acknowledgeCover(registrationId);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="rounded-none border-2 bg-[#f7ecd6] shadow-[6px_6px_0_var(--ink)] sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-2xl leading-none font-black tracking-tight uppercase">
            Your spot is covered
          </DialogTitle>
          <DialogDescription className="text-base text-ink [overflow-wrap:anywhere]">
            {payerName} is paying for your spot at {sessionTitle}. Nothing to send.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={close} className={buttonClass("primary")}>
            Got it
          </button>
          <form action={declineCover.bind(null, registrationId, sessionId)} onSubmit={() => setOpen(false)}>
            <button type="submit" className={buttonClass("secondary")}>
              I&apos;ll pay myself
            </button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
