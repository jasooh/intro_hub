import type { Metadata } from "next";
import { Suspense } from "react";
import { canUseDevTools } from "@/lib/auth";
import { databaseName } from "@/lib/dev-tools";
import { DevToolsNav } from "./dev-tools-nav";

export const metadata: Metadata = {
  title: { template: "%s · Dev tools · Intro Hub", default: "Dev tools · Intro Hub" },
  robots: { index: false, follow: false },
};

/** The dev tools nav, with a badge for which database these tools change. Hidden for everyone else (pages 404). */
async function DevToolsBench() {
  if (!(await canUseDevTools())) return null;
  const db = databaseName();
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-3 font-display text-sm font-bold tracking-[0.3em] text-ink-soft uppercase">
        Dev tools
        <span
          className={`px-2 py-0.5 font-score text-xs font-black tracking-normal ${db === "PROD" ? "bg-bad text-maple" : "bg-mat text-maple"}`}
        >
          {db}
        </span>
      </p>
      <DevToolsNav />
    </div>
  );
}

export default function DevToolsLayout({ children }: LayoutProps<"/dev-tools">) {
  return (
    <div className="space-y-10">
      <Suspense>
        <DevToolsBench />
      </Suspense>
      {children}
    </div>
  );
}
