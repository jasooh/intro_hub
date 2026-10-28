import { Avatar } from "@/components/ui";
import type { PostAuthor as Author } from "@/lib/types";

/** "Posted by" with the poster's avatar, on updates. */
export function PostAuthor({ author, size = 28 }: { author: Author | null; size?: number }) {
  if (!author) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm text-ink-soft">
      <Avatar name={author.name} src={author.avatar_url} size={size} />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        Posted by <b className="font-semibold text-ink">{author.name}</b>
      </span>
    </span>
  );
}
