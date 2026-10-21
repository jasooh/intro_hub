import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailHealthBanner } from "@/components/email-health-banner";
import { TickHealthBanner } from "@/components/tick-health-banner";
import { getProfile } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = {
  title: { template: "%s · Admin · Intro Hub", default: "Admin · Intro Hub" },
  robots: { index: false, follow: false },
};

/** The host nav, only for hosts (pages like /admin/demo show non-hosts an "Admin only" screen). */
async function HostBench() {
  const profile = await getProfile();
  if (profile?.role !== "admin") return null;
  return (
    <div className="space-y-1">
      <p className="font-display text-sm font-bold tracking-[0.3em] t-[#f2e3c6]/60 uppercase">Host bench</p>
      <AdminNav />
      <div className="space-y-2 pt-3 empty:hidden">
        <TickHealthBanner />
        <EmailHealthBanner />
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="space-y-10">
      <Suspense>
        <HostBench />
      </Suspense>
      {children}
    </div>
  );
}
