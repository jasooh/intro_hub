import { AVATAR_SEED_RE } from "@/lib/avatars";
import { readPhoto } from "@/lib/avatar-storage";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A player's uploaded picture, from the private "avatars" bucket. Each upload
 * gets a new seed (so a new URL), which lets browsers and Vercel's CDN keep it
 * for good. A missing picture falls back to that seed's DiceBear avatar.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ owner: string; seed: string }> }) {
  const { owner, seed } = await params;
  if (!UUID_RE.test(owner) || !AVATAR_SEED_RE.test(seed)) return new Response("Not found", { status: 404 });

  const photo = await readPhoto(owner, seed);
  if (!photo) {
    return new Response(null, {
      status: 302,
      headers: { Location: `/api/avatar/thumbs/${seed}`, "Cache-Control": "public, max-age=300" },
    });
  }
  return new Response(photo, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
