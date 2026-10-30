import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { setPostFeatured } from "@/app/admin/actions";
import { ListFilters } from "@/components/list-filters";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass, EmptyState, Mark, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { postExcerpt } from "@/lib/rich-text";
import { signupMatches } from "@/lib/signups";
import { createClient } from "@/lib/supabase/server";
import type { Post } from "@/lib/types";

type View = "published" | "drafts";
const TABS: { key: View; label: string }[] = [
  { key: "published", label: "Published" },
  { key: "drafts", label: "Drafts" },
];

export const metadata: Metadata = {
  title: "Updates",
};

export default function AdminUpdatesPage(props: PageProps<"/admin/updates">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <AdminUpdates searchParams={props.searchParams} />
    </Suspense>
  );
}

async function AdminUpdates({ searchParams }: { searchParams: PageProps<"/admin/updates">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const view: View = params.view === "drafts" ? "drafts" : "published";
  const q = typeof params.q === "string" ? params.q : "";

  const supabase = await createClient();
  const { data } = await supabase.from("posts").select("*").order("updated_at", { ascending: false }).limit(500);
  const matching = ((data ?? []) as Post[]).filter((p) => signupMatches([p.title, postExcerpt(p.body_html, 10_000)], q));
  const inView = (v: View) => matching.filter((p) => (v === "published" ? p.published_at : !p.published_at));
  const shown = inView(view).sort((a, b) =>
    view === "published" ? (b.published_at ?? "").localeCompare(a.published_at ?? "") : 0,
  );

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle sub="Posts show on the public Updates page. Feature one on the home page, or email it to players.">
          Updates
        </PageTitle>
        <Link href="/admin/updates/new" className={buttonClass()}>
          + New post
        </Link>
      </div>

      <Sheet label="Posts" className="reveal" style={reveal(1)}>
        <ListFilters
          path="/admin/updates"
          tabs={{ param: "view", value: view, options: TABS.map((t) => ({ ...t, count: inView(t.key).length })) }}
          q={q}
          placeholder="Search posts"
        >
          {shown.length === 0 ? (
            <EmptyState>
              {q ? <>No posts match &ldquo;{q}&rdquo;.</> : view === "drafts" ? "No drafts." : "Nothing published yet."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-ink/25">
              {shown.map((p) => (
                <li key={p.id} className="grid grid-cols-1 items-start gap-x-6 gap-y-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0 space-y-1">
                    <Link
                      href={`/admin/updates/${p.id}`}
                      className="font-display text-2xl leading-tight font-extrabold uppercase [overflow-wrap:anywhere] decoration-line decoration-2 underline-offset-4 hover:underline"
                    >
                      {p.title}
                    </Link>
                    <p className="text-sm text-ink-soft">
                      {p.published_at ? `Published ${formatDateTime(p.published_at)}` : `Edited ${formatDateTime(p.updated_at)}`}
                    </p>
                    {postExcerpt(p.body_html) && <p className="text-ink-soft">{postExcerpt(p.body_html)}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                      {p.featured && (
                        <Mark tone="line" glyph="★">
                          On home page
                        </Mark>
                      )}
                      {p.emailed_at && (
                        <Mark tone="ok" glyph="✉">
                          Emailed {formatDateTime(p.emailed_at)}
                        </Mark>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    {p.published_at && (
                      <form action={setPostFeatured.bind(null, p.id, !p.featured)}>
                        <SubmitButton size="sm" variant="ghost">
                          {p.featured ? "Remove from home page" : "Show on home page"}
                        </SubmitButton>
                      </form>
                    )}
                    <Link href={`/admin/updates/${p.id}`} className={buttonClass("secondary", "sm")}>
                      Edit
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ListFilters>
      </Sheet>
    </div>
  );
}
