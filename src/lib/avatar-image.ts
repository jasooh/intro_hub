import "server-only";
import sharp from "sharp";

/** Largest upload accepted (the browser shrinks photos first, so real uploads are far smaller). */
export const AVATAR_MAX_BYTES = 3 * 1024 * 1024;
export const AVATAR_PX = 256;

const FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"]);

/** A message safe to show the player. */
export class AvatarImageError extends Error {}

/**
 * Turns an uploaded picture into a square 256px WebP: applies the phone's
 * rotation, crops to the middle, and drops all metadata (EXIF, including GPS
 * location). Throws AvatarImageError for files that aren't readable images.
 */
export async function toAvatarWebp(input: Buffer): Promise<Buffer> {
  let format: string | undefined;
  try {
    ({ format } = await sharp(input, { limitInputPixels: 50_000_000 }).metadata());
  } catch {
    throw new AvatarImageError("That file isn't a picture we can read. Try a JPG or PNG.");
  }
  if (!format || !FORMATS.has(format)) throw new AvatarImageError("That file isn't a picture we can read. Try a JPG or PNG.");
  try {
    return await sharp(input, { limitInputPixels: 50_000_000, animated: false })
      .rotate()
      .resize(AVATAR_PX, AVATAR_PX, { fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new AvatarImageError("Couldn't process that picture. Try a different one.");
  }
}
