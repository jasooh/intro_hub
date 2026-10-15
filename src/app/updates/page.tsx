import type { Metadata } from "next";
import { Suspense } from "react";
import { PostBody } from "@/components/post-body";
import { DateBlock } from "@/components/session-card";
import { EmptyState, Mark, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { getPublishedPosts } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Updates",
  description: "News and announcements from the Intro 2 Volleyball hosts.",
};

export default function UpdatesPage() {
  return (
    <div className="space-y-10">
      <PageTitle sub="News and announcements from the hosts.">Updates</PageTitle>
      <Sheet label="Posts" className="reveal" style={reveal(1)}>
        <Suspense fallback={<PageSpinner />}>
          <Posts />
        </Suspense>
      </Sheet>
    </div>
  );
}

async function Posts() {
  const posts = await getPublishedPosts();
  if (posts.length === 0) return <EmptyState>No updates yet. Check back soon!</EmptyState>;
  return (
    <ol className="divide-y divide-ink/25">
      {posts.map((p) => (
        <li key={p.id} id={`post-${p.id}`} className="flex scroll-mt-24 gap-4 py-8 first:pt-2 sm:gap-6">
          <DateBlock iso={p.published_at!} className="shrink-0" />
          <article className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1.5">
              {p.featured && (
                <Mark tone="line" glyph="★">
                  Featured
                </Mark>
              )}
              <h2 className="font-display text-3xl leading-[0.95] font-black uppercase [overflow-wrap:anywhere] sm:text-4xl">
                {p.title}
              </h2>
            </div>
            <PostBody html={p.body_html} />
          </article>
        </li>
      ))}
    </ol>
  );
}
