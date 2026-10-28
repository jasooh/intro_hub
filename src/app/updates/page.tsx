import type { Metadata } from "next";
import { PostAuthor } from "@/components/post-author";
import Link from "next/link";
import { Suspense } from "react";
import { DateBlock } from "@/components/session-card";
import { EmptyState, Mark, PageSpinner, PageTitle, reveal, Sheet } from "@/components/ui";
import { getPublicPosts } from "@/lib/public-data";
import { postExcerpt } from "@/lib/rich-text";

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
  const posts = await getPublicPosts();
  if (posts.length === 0) return <EmptyState>No updates yet. Check back soon!</EmptyState>;
  return (
    <ol className="divide-y divide-ink/25">
      {posts.map((p, i) => (
        <li key={p.id} className="reveal" style={reveal(i + 2)}>
          <Link
            href={`/updates/${p.id}`}
            className="group grid grid-cols-[auto_1fr] gap-x-4 py-5 transition-colors hover:bg-maple-deep/50 sm:gap-x-6 sm:px-2"
          >
            <DateBlock iso={p.published_at!} />
            <div className="min-w-0 space-y-2">
              {p.featured && (
                <Mark tone="line" glyph="★">
                  Featured
                </Mark>
              )}
              <h2 className="font-display text-2xl leading-tight font-extrabold uppercase [overflow-wrap:anywhere] decoration-line decoration-2 underline-offset-4 group-hover:underline sm:text-3xl">
                {p.title}
              </h2>
              <PostAuthor author={p.author} size={24} />
              {postExcerpt(p.body_html, 280) && (
                <p className="line-clamp-3 text-ink-soft">{postExcerpt(p.body_html, 280)}</p>
              )}
              <span className="inline-flex items-center gap-2 font-display text-base font-bold tracking-wide text-line uppercase">
                Read more
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
