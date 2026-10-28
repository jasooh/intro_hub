"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { uploadAvatar } from "@/app/actions";
import { buttonClass } from "@/components/ui";
import {
  AVATAR_STYLE_KEYS,
  AVATAR_STYLES,
  avatarPath,
  isAvatarStyle,
  PHOTO_STYLE,
  photoPath,
  randomSeed,
  type AvatarStyle,
} from "@/lib/avatars";

type Style = AvatarStyle | typeof PHOTO_STYLE;

const tileClass =
  "flex cursor-pointer flex-col items-center gap-2 border-2 border-ink/20 px-2 py-3 transition-colors hover:border-ink has-[:checked]:border-line has-[:checked]:bg-maple-deep/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-line";

/**
 * Pick a DiceBear style and shuffle until you like it, or upload your own
 * picture. Saves with the surrounding form (fields `avatar_style` and
 * `avatar_seed`); an upload is stored right away but only used once saved.
 */
export function AvatarPicker({
  profileId,
  defaultStyle,
  defaultSeed,
}: {
  profileId: string;
  defaultStyle: string;
  defaultSeed: string;
}) {
  const startsAsPhoto = defaultStyle === PHOTO_STYLE;
  const [style, setStyle] = useState<Style>(startsAsPhoto ? PHOTO_STYLE : isAvatarStyle(defaultStyle) ? defaultStyle : "thumbs");
  const [seed, setSeed] = useState(defaultSeed);
  const [photoSeed, setPhotoSeed] = useState<string | null>(startsAsPhoto ? defaultSeed : null);
  const [uploading, setUploading] = useState(false);
  const seedInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  // A hidden input changing fires no event, so tell the form (Save's "anything changed?" check listens for input).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    seedInput.current?.form?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [seed, style]);

  const preview = (s: Style, sd: string) => (s === PHOTO_STYLE ? photoPath(profileId, sd) : avatarPath(s, sd));

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("photo", await shrink(file));
      const result = await uploadAvatar(fd);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setPhotoSeed(result.seed);
      setSeed(result.seed);
      setStyle(PHOTO_STYLE);
    } catch {
      toast.error("Couldn't upload that picture. Please try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- our own avatar routes; next/image adds nothing here */}
        <img
          src={preview(style, seed)}
          alt="Your avatar"
          width={88}
          height={88}
          className="size-22 shrink-0 rounded-full bg-maple-deep object-cover ring-2 ring-ink"
        />
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-ink-soft">This is what other players see next to your name.</p>
          <div className="flex flex-wrap gap-3">
            {style !== PHOTO_STYLE && (
              <button
                type="button"
                onClick={() => setSeed(randomSeed())}
                className={buttonClass("secondary", "sm")}
              >
                <span aria-hidden>⟳</span> Shuffle
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className={buttonClass("secondary", "sm")}
            >
              {uploading ? "Uploading…" : photoSeed ? "Change photo" : "Upload photo"}
            </button>
          </div>
        </div>
      </div>
      <input ref={seedInput} type="hidden" name="avatar_seed" value={seed} />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <fieldset>
        <legend className="pb-2 font-display text-sm font-bold tracking-[0.15em] uppercase">Style</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {AVATAR_STYLE_KEYS.map((key) => (
            <label key={key} className={tileClass}>
              <input
                type="radio"
                name="avatar_style"
                value={key}
                checked={style === key}
                onChange={() => {
                  // Leaving the photo: keep a DiceBear-friendly seed (the photo's seed works too).
                  setStyle(key);
                }}
                className="sr-only"
              />
              {/* eslint-disable-next-line @next/next/no-img-element -- our own SVG route */}
              <img src={avatarPath(key, seed)} alt="" width={48} height={48} className="size-12 rounded-full ring-2 ring-ink" />
              <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">{AVATAR_STYLES[key]}</span>
            </label>
          ))}
          {photoSeed ? (
            <label className={tileClass}>
              <input
                type="radio"
                name="avatar_style"
                value={PHOTO_STYLE}
                checked={style === PHOTO_STYLE}
                onChange={() => {
                  setStyle(PHOTO_STYLE);
                  setSeed(photoSeed);
                }}
                className="sr-only"
              />
              {/* eslint-disable-next-line @next/next/no-img-element -- our own avatar route */}
              <img
                src={photoPath(profileId, photoSeed)}
                alt=""
                width={48}
                height={48}
                className="size-12 rounded-full object-cover ring-2 ring-ink"
              />
              <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">Photo</span>
            </label>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="flex flex-col items-center gap-2 border-2 border-dashed border-ink/30 px-2 py-3 transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line"
            >
              <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-maple-deep text-2xl ring-2 ring-ink">
                +
              </span>
              <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">
                {uploading ? "Uploading…" : "Photo"}
              </span>
            </button>
          )}
        </div>
        {style === PHOTO_STYLE && (
          <p className="mt-2 text-sm text-ink-soft">Your photo is cropped to a circle. Location data is removed.</p>
        )}
      </fieldset>
    </div>
  );
}

/** Shrinks a photo in the browser before upload (phone photos are several MB). Falls back to the original. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return blob ?? file;
  } catch {
    return file;
  }
}
