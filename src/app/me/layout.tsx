import { MeNav } from "./me-nav";

export default function MeLayout({ children }: LayoutProps<"/me">) {
  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <p className="font-display text-sm font-bold tracking-[0.3em] t-[#f2e3c6]/60 uppercase">Your account</p>
        <MeNav />
      </div>
      {children}
    </div>
  );
}
