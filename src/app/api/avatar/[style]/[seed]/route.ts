import { createAvatar } from "@dicebear/core";
import { adventurerNeutral, botttsNeutral, funEmoji, thumbs } from "@dicebear/collection";
import { AVATAR_BACKGROUNDS, AVATAR_SEED_RE, isAvatarStyle, type AvatarStyle } from "@/lib/avatars";

const COLLECTIONS = {
  thumbs,
  "fun-emoji": funEmoji,
  "bottts-neutral": botttsNeutral,
  "adventurer-neutral": adventurerNeutral,
} satisfies Record<AvatarStyle, unknown>;

/** A player's DiceBear avatar. Style + seed decide the picture. */
export async function GET(_req: Request, { params }: { params: Promise<{ style: string; seed: string }> }) {
  const { style, seed } = await params;
  if (!isAvatarStyle(style) || !AVATAR_SEED_RE.test(seed)) {
    return new Response("Not found", { status: 404 });
  }
  // Each collection has its own options type; the shared ones are all we pass.
  const svg = createAvatar(COLLECTIONS[style] as typeof thumbs, {
    seed,
    backgroundColor: AVATAR_BACKGROUNDS,
    backgroundType: ["solid"],
    // Thumbs' figure covers most of the circle, so it gets the bold fills too, with a maple face that reads on any of them.
    ...(style === "thumbs" && { shapeColor: AVATAR_BACKGROUNDS, eyesColor: ["f2e3c6"], mouthColor: ["f2e3c6"] }),
  }).toString();
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // A day, not forever, so changes to how avatars are drawn reach browsers.
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
