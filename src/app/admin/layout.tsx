import Link from "next/link";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/refunds", label: "Refunds" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/templates", label: "Weekly schedule" },
] as const;

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="space-y-5">
      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 text-sm">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="whitespace-nowrap rounded-full border border-stone-200 bg-white px-3 py-1 text-stone-700 hover:bg-stone-100"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
