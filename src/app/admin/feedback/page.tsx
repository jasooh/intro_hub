import type { Metadata } from "next";
import { Suspense } from "react";
import { ListFilters } from "@/components/list-filters";
import { PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FeedbackList, type FeedbackRow } from "./feedback-list";

const TABS = [
  { key: "new", label: "New" },
  { key: "handled", label: "Handled" },
] as const;
type View = (typeof TABS)[number]["key"];

export const metadata: Metadata = {
  title: "Feedback",
};

export default function FeedbackPage(props: PageProps<"/admin/feedback">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Feedback searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Feedback({ searchParams }: { searchParams: PageProps<"/admin/feedback">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const view: View = TABS.find((t) => t.key === params.view)?.key ?? "new";
  const q = typeof params.q === "string" ? params.q : "";
  const needle = q.trim().toLowerCase();

  const supabase = await createClient();
  const { data } = await supabase
    .from("feedback")
    .select("id, message, name, email, created_at, handled_at, profile:profiles(display_name, email)")
    .order("created_at", { ascending: false })
    .limit(1000);
  const rows = ((data ?? []) as unknown as FeedbackRow[]).filter(
    (f) =>
      !needle ||
      [f.message, f.name, f.email, f.profile?.display_name, f.profile?.email].some((v) => v?.toLowerCase().includes(needle)),
  );
  const inView = (v: View) => rows.filter((f) => (v === "handled") === (f.handled_at !== null));
  const shown = inView(view);

  return (
    <div className="space-y-12">
      <PageTitle sub="Sent from the Contact page. Anonymous feedback has no name, email or account.">Feedback</PageTitle>
      <Sheet label={`New · ${inView("new").length}`} className="reveal" style={reveal(1)}>
        <ListFilters
          path="/admin/feedback"
          tabs={{ param: "view", value: view, options: TABS.map((t) => ({ ...t, count: inView(t.key).length })) }}
          q={q}
          placeholder="Search message, name, email"
        >
          <FeedbackList
            rows={shown}
            empty={needle ? "No feedback matches" : view === "new" ? "Nothing new" : "Nothing handled yet"}
          />
        </ListFilters>
      </Sheet>
    </div>
  );
}
