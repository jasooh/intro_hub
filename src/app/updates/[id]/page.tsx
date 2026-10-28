import type { Metadata } from "next";
import { PostAuthor } from "@/components/post-author";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PostBody } from "@/components/post-body";
import { BackLink, buttonClass, Mark, PageSpinner, reveal } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { getPublicPost } from "@/lib/public-data";
import { postExcerpt } from "@/lib/rich-text";

export async function generateMetadata({ params }: PageProps<"/updates/[id]">): Promise<Metadata> {
  const { id } = await params;
  const post = await getPublicPost(id);
  if (!post) return { title: "Post not found" };
  const description = postExcerpt(post.body_html, 160) || "An update from the Intro 2 Volleyball hosts.";
  return { title: post.title, description, openGraph: { title: post.title, description, type: "article" } };
}

export default function PostPage(props: PageProps<"/updates/[id]">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <PostView params={props.params} />
    </Suspense>
  );
}

async function PostView({ params }: { params: PageProps<"/updates/[id]">["params"] }) {
  const { id } = await params;
  const post = await getPublicPost(id);
  if (!post) notFound();

  return (
    <article className="max-w-2xl space-y-8">
      <div className="space-y-4">
        <BackLink href="/updates">All updates</BackLink>
        <div className="reveal space-y-3" style={reveal(0)}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="font-display text-sm font-bold tracking-[0.3em] text-line uppercase">
              {formatDateTime(post.published_at!)}
            </p>
            {post.featured && (
              <Mark tone="line" glyph="★">
                Featured
              </Mark>
            )}
          </div>
          <h1 className="font-display text-5xl leading-[0.88] font-black tracking-tight uppercase [overflow-wrap:anywhere] sm:text-6xl">
            {post.title.replace(/[.!?]$/, "")}
            <span className="text-line">.</span>
          </h1>
          <PostAuthor author={post.author} size={32} />
        </div>
      </div>

      <div className="reveal border-t-2 border-ink pt-6" style={reveal(1)}>
        <PostBody html={post.body_html} />
      </div>

      <div className="reveal flex flex-wrap gap-4 border-t border-ink/25 pt-6" style={reveal(2)}>
        <Link href="/updates" className={buttonClass("secondary")}>
          All updates
        </Link>
        <Link href="/sessions" className={buttonClass("primary")}>
          See sessions
        </Link>
      </div>
    </article>
  );
}
