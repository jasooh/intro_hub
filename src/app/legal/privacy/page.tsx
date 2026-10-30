import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CONTACT_EMAIL } from "@/app/contact/limits";
import { BackLink, PageTitle, reveal, Sheet } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Intro 2 Volleyball collects about players, why, who sees it and how to delete it.",
};

const UPDATED = "October 2026";

/** Plain-language privacy policy. Keep it in step with what the app actually stores. */
export default function PrivacyPage() {
  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <BackLink href="/">Home</BackLink>
        <PageTitle eyebrow="Legal" sub={`How we handle your information. Last updated ${UPDATED}.`}>
          Privacy
        </PageTitle>
      </div>

      <Sheet label="What we collect" className="reveal" style={reveal(1)}>
        <Points>
          <li>
            <b>From Google when you sign in:</b> your name and email address. Google also sends your profile picture,
            but we don&apos;t show it anywhere: your picture here is a cartoon avatar you pick.
          </li>
          <li>
            <b>From your profile:</b> your name, phone number, emergency contact (name, relationship and phone), skill level, whether you&apos;ve
            played with us before, what you want to learn, your hype song, how you heard about us, the names your
            e-Transfers come from, and your answers to the waiver, media release and age check.
          </li>
          <li>
            <b>When you play:</b> your sign-ups, payments (amount, sender name and the reference code from Interac
            e-Transfer notifications), refunds, team requests, teams, and anything you send through the contact form.
          </li>
          <li>
            <b>Visits:</b> anonymous page-view counts (no cookies, nothing that identifies you).
          </li>
        </Points>
      </Sheet>

      <Sheet label="Why" className="reveal" style={reveal(2)}>
        <Points>
          <li>To run sessions: hold your spot, match your payment, make balanced teams and refund you when needed.</li>
          <li>To keep you safe: your emergency contact is only for when you get hurt at a session.</li>
          <li>To email you about your sign-ups and payments, and, only if you choose, club updates and reminders.</li>
          <li>To see how the club is doing (sign-up and payment totals), so the hosts can plan sessions.</li>
        </Points>
        <p className="mt-4 text-sm text-ink-soft">We never sell your information or use it for advertising.</p>
      </Sheet>

      <Sheet label="Who sees it" className="reveal" style={reveal(3)}>
        <Points>
          <li>
            <b>Other players</b> see only your display name and the avatar you picked on session lists and team sheets.
          </li>
          <li>
            <b>The hosts</b> see your profile, sign-ups and payments so they can run sessions.
          </li>
          <li>
            <b>The site&apos;s developer</b> can reach the database to fix problems.
          </li>
          <li>
            <b>Services we use to run the site:</b> Supabase (database and sign-in), Vercel (hosting and the anonymous
            visit counts) and Google (sign-in, and Gmail for sending emails and receiving e-Transfer notifications).
          </li>
        </Points>
      </Sheet>

      <Sheet label="How long we keep it" className="reveal" style={reveal(4)}>
        <Points>
          <li>Your profile and sign-ups stay until you delete your account.</li>
          <li>Messages between you and the hosts stay in your inbox until you delete your account, then they are removed. Only you and the hosts can read them.</li>
          <li>Logs are cleared automatically: error logs after 30 days, email send records after 90, activity notes for hosts after 180, and email history after about a year.</li>
          <li>Payment records stay for the club&apos;s bookkeeping, unlinked from you once your account is deleted.</li>
        </Points>
      </Sheet>

      <Sheet label="Your choices" className="reveal" style={reveal(5)}>
        <Points>
          <li>Change your details and email settings any time on your Account page.</li>
          <li>Every optional email has an unsubscribe link.</li>
          <li>Delete your account from the bottom of your Account page. Your profile and sign-ups are removed.</li>
          <li>
            To ask what we hold about you, or for anything else, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-mat underline underline-offset-2">
              {CONTACT_EMAIL}
            </a>
            .
          </li>
        </Points>
      </Sheet>
    </div>
  );
}

function Points({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-3 pl-5 text-ink marker:text-line">{children}</ul>;
}
