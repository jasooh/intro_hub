import type { Metadata } from "next";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = {
  title: { template: "%s · Admin · Intro Hub", default: "Admin · Intro Hub" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <p className="font-display text-sm font-bold tracking-[0.3em] t-[#f2e3c6]/60 uppercase">Host bench</p>
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
