import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageTitle, reveal, Sheet } from "@/components/ui";
import { MAX_TEAMMATES } from "@/lib/teams";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to common questions about paying, signing up with friends and playing for the first time at Intro 2 Volleyball.",
};

const FAQS: { id: string; q: string; a: ReactNode }[] = [
  {
    id: "autodeposit",
    q: "What happened to the auto deposit?",
    a: (
      <p>
        We turned it off. Now every Interac e-Transfer needs your <b>VB- code</b> in the message. That&apos;s how the site matches your
        payment to your sign-up and confirms your spot automatically. You&apos;ll find the code on your sign-up after you register.
      </p>
    ),
  },
  {
    id: "forgot-code",
    q: "I forgot to include the code in my e-Transfer. What do I do?",
    a: (
      <>
        <p>
          Don&apos;t send a second transfer. If the name your bank sent from matches a name on your profile (the &ldquo;e-Transfer
          names&rdquo; field) and the amount is exactly what you owe, the site usually still matches it on its own.
        </p>
        <p>
          If your sign-up still says unpaid after a while, send the hosts a message from your{" "}
          <Link href="/me/messages" className="font-semibold text-line underline underline-offset-4">
            inbox
          </Link>{" "}
          with the name and time of your transfer, and they&apos;ll mark it paid.
        </p>
      </>
    ),
  },
  {
    id: "pay-for-friends",
    q: "Can I pay for my friends?",
    a: (
      <p>
        Yes, for friends who are signed up for the same session. On your payment screen, pick the friends you&apos;re covering and send
        one e-Transfer for the total with <b>your own code</b>. A friend can still choose &ldquo;I&apos;ll pay myself&rdquo; if they&apos;d
        rather.
      </p>
    ),
  },
  {
    id: "play-with-friends",
    q: "How can I make sure I play with my friends?",
    a: (
      <>
        <p>
          If you&apos;re playing in the games, you can ask to be teamed with up to {MAX_TEAMMATES} other players who are also signed up.
          Pick them when you sign up, or later from the session page. One person asking is enough.
        </p>
        <p>
          Teams hold up to 6 players, so a very large group may have to be split. Requests only work for drop-in players, not
          Instructional only.
        </p>
      </>
    ),
  },
  {
    id: "first-time",
    q: "I've never played before. Is that okay?",
    a: (
      <>
        <p>
          Yes, that&apos;s who this is for. Every session starts with a lesson on the basics before the games, and everyone is
          placed on teams with a mix of skill levels.
        </p>
        <p>
          Bringing a friend who&apos;s new too? A first-timer can sign up with <b>Bring a Friend</b>, and you both pay half.
        </p>
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <div className="space-y-14">
      <PageTitle eyebrow="Intro 2 Volleyball" sub="Quick answers about paying, playing with friends and coming for the first time.">
        FAQ
      </PageTitle>

      <Sheet label="Common questions" className="reveal" style={reveal(1)}>
        <dl className="divide-y divide-ink/20">
          {FAQS.map((f) => (
            <div key={f.id} id={f.id} className="scroll-mt-24 space-y-2 py-6 first:pt-0 last:pb-0">
              <dt className="font-display text-2xl leading-tight font-extrabold uppercase">{f.q}</dt>
              <dd className="max-w-2xl space-y-3 text-ink-soft">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Sheet>

      <p className="reveal text-ink-soft" style={reveal(2)}>
        Still stuck? <Link href="/contact" className="font-semibold text-line underline underline-offset-4">Get in touch</Link>.
      </p>
    </div>
  );
}
