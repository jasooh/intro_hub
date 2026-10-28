import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AvatarImageError, toAvatarWebp } from "@/lib/avatar-image";

describe("profile picture processing", () => {
  it("makes a 256px square WebP and drops metadata like GPS location", async () => {
    const photo = await sharp({ create: { width: 800, height: 500, channels: 3, background: "#e8541e" } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Make: "TestPhone" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "43/1 52/1 0/1" } } })
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();

    const out = await toAvatarWebp(photo);
    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 256, height: 256 });
    expect(meta.exif).toBeUndefined();
  });

  it("refuses files that aren't pictures", async () => {
    await expect(toAvatarWebp(Buffer.from("not an image at all"))).rejects.toBeInstanceOf(AvatarImageError);
  });
});
