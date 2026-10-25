"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui";
import { AVATAR_STYLE_KEYS, AVATAR_STYLES, avatarPath, isAvatarStyle, randomSeed, type AvatarStyle } from "@/lib/avatars";

/**
 * Pick a DiceBear style and shuffle until you like it. Saves with the
 * surrounding form (fields `avatar_style` and `avatar_seed`).
 */
export function AvatarPicker({ defaultStyle, defaultSeed }: { defaultStyle: string; defaultSeed: string }) {
  const [style, setStyle] = useState<AvatarStyle>(isAvatarStyle(defaultStyle) ? defaultStyle : "thumbs");
  const [seed, setSeed] = useState(defaultSeed);
  const seedInput = useRef<HTMLInputElement>(null);
  const firstRender = useRef(true);

  // A hidden input changing fires no event, so tell the form (Save's "anything changed?" check listens for input).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    seedInput.current?.form?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [seed]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- our own SVG route; next/image adds nothing here */}
        <img
          src={avatarPath(style, seed)}
          alt="Your avatar"
          width={88}
          height={88}
          className="size-22 shrink-0 rounded-full bg-maple-deep ring-2 ring-ink"
        />
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-ink-soft">This is what other players see next to your name.</p>
          <button type="button" onClick={() => setSeed(randomSeed())} className={buttonClass("secondary", "sm")}>
            <span aria-hidden>⟳</span> Shuffle
          </button>
        </div>
      </div>
      <input ref={seedInput} type="hidden" name="avatar_seed" value={seed} />

      <fieldset>
        <legend className="pb-2 font-display text-sm font-bold tracking-[0.15em] uppercase">Style</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {AVATAR_STYLE_KEYS.map((key) => (
            <label
              key={key}
              className="flex cursor-pointer flex-col items-center gap-2 border-2 border-ink/20 px-2 py-3 transition-colors hover:border-ink has-[:checked]:border-line has-[:checked]:bg-maple-deep/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-line"
            >
              <input
                type="radio"
                name="avatar_style"
                value={key}
                checked={style === key}
                onChange={() => setStyle(key)}
                className="sr-only"
              />
              {/* eslint-disable-next-line @next/next/no-img-element -- our own SVG route */}
              <img
                src={avatarPath(key, seed)}
                alt=""
                width={48}
                height={48}
                className="size-12 rounded-full ring-2 ring-ink"
              />
              <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">{AVATAR_STYLES[key]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
