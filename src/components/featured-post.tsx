import Link from "next/link";
import { PostBody } from "@/components/post-body";
import { dateParts } from "@/lib/format";
import type { Post } from "@/lib/types";

/**
 * The host's featured post on the home page. No section divider: it sits on
 * its own, in an orange-framed panel with an LED "announcement" strip, so it
 * reads as the most important thing on the page.
 */
export function FeaturedPost({ post }: { post: Post }) {
  const { weekday, day, month } = dateParts(post.published_at ?? post.created_at);
  return (
    <article
      aria-labelledby={`featured-${post.id}`}
      className="border-[3px] border-line bg-[#fbf3e3] shadow-[6px_6px_0_var(--line)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-board px-4 py-2">
        <p className="led animate-flicker font-score text-base font-black tracking-[0.2em] uppercase">● Announcement</p>
        <p className="font-display text-xs font-bold tracking-[0.2em] text-maple/60 uppercase">
          {weekday} {month} {day}
        </p>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <h2
          id={`featured-${post.id}`}
          className="font-display text-4xl leading-[0.9] font-black tracking-tight uppercase [overflow-wrap:anywhere] sm:text-5xl"
        >
          {post.title.replace(/[.!?]$/, "")}
          <span className="text-line">.</span>
        </h2>
        <PostBody html={post.body_html} className="max-w-2xl" />
        <Link
          href={`/updates/${post.id}`}
          className="group inline-flex items-center gap-2 font-display text-lg font-bold tracking-wide text-line uppercase hover:text-ink"
        >
          Read the full post
          <span aria-hidden className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </Link>
      </div>
    </article>
  );
}
