import type { Metadata } from "next";
import { Suspense } from "react";
import { getIsOwner } from "@/lib/auth";
import { databaseName } from "@/lib/owner";
import { OwnerNav } from "./owner-nav";

export const metadata: Metadata = {
  title: { template: "%s · Owner · Intro Hub", default: "Owner · Intro Hub" },
  robots: { index: false, follow: false },
};

/** The owner nav, with a badge for which database these tools change. Hidden for everyone else (pages 404). */
async function OwnerBench() {
  if (!(await getIsOwner())) return null;
  const db = databaseName();
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-3 font-display text-sm font-bold tracking-[0.3em] text-ink-soft uppercase">
        Owner tools
        <span
          className={`px-2 py-0.5 font-score text-xs font-black tracking-normal ${db === "PROD" ? "bg-bad text-maple" : "bg-mat text-maple"}`}
        >
          {db}
        </span>
      </p>
      <OwnerNav />
    </div>
  );
}

export default function OwnerLayout({ children }: LayoutProps<"/owner">) {
  return (
    <div className="space-y-10">
      <Suspense>
        <OwnerBench />
      </Suspense>
      {children}
    </div>
  );
}
