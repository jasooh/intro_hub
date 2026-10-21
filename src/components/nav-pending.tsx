"use client";

import Link, { useLinkStatus } from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { cn, PageSpinner } from "@/components/ui";

// Click feedback for navigation. Without it a Link to a page that has to hit the
// database looks dead until the new page arrives. Pieces:
//   NavLink       a tab-style link that turns "active" the instant it's clicked
//   LinkPending   drop inside any Link (the Link needs `relative`): a dim overlay or a ball while it loads
//   NavGroup + PendingContent   swap a content area for the bouncing ball while any NavLink in the group loads

const ReportContext = createContext<((id: string, pending: boolean) => void) | null>(null);
const PendingContext = createContext(false);

/** Wrap a set of NavLinks and the content they change. */
export function NavGroup({ children }: { children: ReactNode }) {
  const ids = useRef(new Set<string>());
  const [pending, setPending] = useState(false);
  const report = useCallback((id: string, isPending: boolean) => {
    if (isPending) ids.current.add(id);
    else ids.current.delete(id);
    setPending(ids.current.size > 0);
  }, []);
  return (
    <ReportContext.Provider value={report}>
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
    </ReportContext.Provider>
  );
}

/** Shows the bouncing ball instead of its children while a NavLink in the surrounding NavGroup is loading. */
export function PendingContent({ children }: { children: ReactNode }) {
  return useContext(PendingContext) ? <PageSpinner /> : <>{children}</>;
}

/** Tells the surrounding NavGroup this link is loading. */
function useReportPending(pending: boolean) {
  const report = useContext(ReportContext);
  const id = useId();
  useEffect(() => {
    report?.(id, pending);
    return () => report?.(id, false);
  }, [report, id, pending]);
}

type FaceState = { active: boolean; pending: boolean };

function Face({
  active,
  className,
  children,
}: {
  active: boolean;
  className?: string | ((s: FaceState) => string);
  children: ReactNode;
}) {
  const { pending } = useLinkStatus();
  useReportPending(pending);
  const state = { active: active || pending, pending };
  // data-active / data-pending let server components style a NavLink with a plain string
  // (functions can't be passed from server to client components), e.g. "data-[active=true]:underline".
  return (
    <span
      data-active={state.active}
      data-pending={pending}
      className={cn("block", typeof className === "function" ? className(state) : className)}
    >
      {children}
    </span>
  );
}

/**
 * A link whose look is set by `className(state)` on an inner element (a Link can't read its own
 * pending state). `active` is the current page; while the click is loading it counts as active too.
 */
export function NavLink({
  active = false,
  className,
  linkClassName = "inline-flex",
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "className" | "children"> & {
  active?: boolean;
  className?: string | ((s: FaceState) => string);
  /** Classes for the <a> itself (layout in its parent), e.g. "flex" to fill a grid cell. */
  linkClassName?: string;
  children: ReactNode;
}) {
  return (
    <Link {...props} aria-current={active ? "page" : undefined} className={linkClassName}>
      <Face active={active} className={className}>
        {children}
      </Face>
    </Link>
  );
}

/** Put inside a Link that has `relative`: dims the whole link and shows the ball while the next page loads. */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-end bg-maple/50 pr-4">
      <span className="size-4 animate-bounce-ball rounded-full border-2 border-ink bg-line" />
    </span>
  );
}
