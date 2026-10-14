import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { buttonClass, PageTitle, reveal, Sheet } from "@/components/ui";

export const metadata: Metadata = {
  title: "About",
  description:
    "Intro 2 Volleyball started with one guy who wanted to spread the love of volleyball. A beginner-friendly drop-in at Aaniin Community Centre in Markham.",
};

// To add a photo: put the file in public/about/ and set its src, e.g. "/about/group.jpg".
const PHOTOS: Record<string, { src: string | null; alt: string }> = {
  hero: { src: null, alt: "The group after a session" },
  warmup: { src: null, alt: "Warming up and learning the basics" },
  game: { src: null, alt: "A game in full swing" },
  huddle: { src: null, alt: "Team huddle" },
};

const SESSION_PARTS = [
  {
    title: "Learn",
    body: "We start with the basics: passing, setting, serving. No experience needed, and nobody expects you to know the rules.",
  },
  {
    title: "Play",
    body: "Then we split into teams balanced by experience and play real games, with the hype song playlist going.",
  },
  {
    title: "Hang out",
    body: "Plenty of people come solo. Stick around, meet people, come back next week.",
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-14">
      <PageTitle eyebrow="Intro 2 Volleyball" sub="A small drop-in at Aaniin Community Centre in Markham, for anyone who wants to play.">
        About us
      </PageTitle>

      <Photo {...PHOTOS.hero} className="reveal aspect-[16/9]" style={reveal(1)} priority />

      <Sheet label="Who we are" className="reveal" style={reveal(2)}>
        <div className="max-w-2xl space-y-4 text-lg">
          <p>
            Intro 2 Volleyball started with one guy who wanted to spread the love of volleyball as far as possible, and to
            build a community that&apos;s inclusive and fun.
          </p>
          <p className="text-ink-soft">
            Never touched a volleyball? Perfect. That&apos;s who this is for. Come as you are: every skill level, every
            background, every body.
          </p>
        </div>
      </Sheet>

      <Sheet label="A typical session" className="reveal" style={reveal(3)}>
        <ol className="grid gap-6 sm:grid-cols-3 sm:gap-0 sm:divide-x-2 sm:divide-ink">
          {SESSION_PARTS.map((part, i) => (
            <li key={part.title} className="space-y-2 sm:px-5 sm:first:pl-0 sm:last:pr-0">
              <div className="flex items-baseline gap-3">
                <span className="font-score text-4xl font-black text-line">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-display text-2xl font-extrabold uppercase">{part.title}</span>
              </div>
              <p className="text-ink-soft">{part.body}</p>
            </li>
          ))}
        </ol>
      </Sheet>

      <section className="reveal grid gap-4 sm:grid-cols-[3fr_2fr]" style={reveal(4)}>
        <Photo {...PHOTOS.warmup} className="aspect-[4/5] sm:aspect-auto sm:row-span-2" />
        <Photo {...PHOTOS.game} className="aspect-[4/3]" />
        <Photo {...PHOTOS.huddle} className="aspect-[4/3]" />
      </section>

      <Sheet label="Come play" className="reveal" style={reveal(5)}>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <p className="max-w-md text-lg">
            Sign up for the next session, or say hi on Instagram first. We&apos;re friendly, promise.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/sessions" className={buttonClass("primary")}>
              See sessions
            </Link>
            <a
              href="https://www.instagram.com/intro2volleyball/"
              target="_blank"
              rel="noreferrer"
              className={buttonClass("secondary")}
            >
              @intro2volleyball
            </a>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

/** A photo, or a labelled blank frame until one is added. */
function Photo({
  src,
  alt,
  className,
  style,
  priority,
}: {
  src: string | null;
  alt: string;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
}) {
  return (
    <figure className={`relative overflow-hidden border-2 border-ink bg-maple-deep ${className ?? ""}`} style={style}>
      {src ? (
        <Image src={src} alt={alt} fill priority={priority} sizes="(min-width: 896px) 896px, 100vw" className="object-cover" />
      ) : (
        <div
          className="flex h-full min-h-48 flex-col items-center justify-center gap-1 p-4 text-center text-ink-soft"
          style={{
            backgroundImage: "repeating-linear-gradient(135deg, transparent 0 14px, rgb(27 22 18 / 0.06) 14px 16px)",
          }}
        >
          <span className="font-score text-2xl font-black text-ink/40">PHOTO</span>
          <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">{alt}</span>
        </div>
      )}
    </figure>
  );
}
