// Players' DiceBear avatars. The style keys must match the check on
// profiles.avatar_style (supabase/migrations/20261125000000_dicebear_avatars.sql),
// and avatarPath() must build the same URL as public._set_avatar_url().

export const AVATAR_STYLES = {
  thumbs: "Thumbs",
  "fun-emoji": "Emoji",
  "bottts-neutral": "Bots",
  "adventurer-neutral": "Faces",
} as const;

export type AvatarStyle = keyof typeof AVATAR_STYLES;

export const AVATAR_STYLE_KEYS = Object.keys(AVATAR_STYLES) as AvatarStyle[];

export const AVATAR_SEED_RE = /^[a-z0-9]{1,32}$/;

/**
 * Solid fills from the theme (court line, mat, ok, warn). No maple: it's the
 * page colour, so a maple avatar looks empty.
 */
export const AVATAR_BACKGROUNDS = ["e8541e", "1e3a8a", "2f6b3a", "a8640c"];

export function isAvatarStyle(s: unknown): s is AvatarStyle {
  return typeof s === "string" && Object.hasOwn(AVATAR_STYLES, s);
}

/** Where an avatar is served from (see src/app/api/avatar/[style]/[seed]/route.ts). */
export function avatarPath(style: AvatarStyle, seed: string) {
  return `/api/avatar/${style}/${seed}`;
}

/** A fresh random seed: 12 lowercase hex characters. */
export function randomSeed() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
