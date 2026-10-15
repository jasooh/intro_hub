import { Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";
import { mapUrl } from "@/lib/maps";
import type { RegistrationEvent } from "@/lib/types";

export type EmailContext = {
  playerName: string;
  sessionTitle: string;
  when: string;        // formatted start time
  location: string;
  price: string;       // formatted price
  paid: string;        // formatted total received so far
  remaining: string;   // formatted amount still owed
  /** Free session: the payment is a refundable deposit. */
  deposit?: boolean;
  refCode: string;
  holdUntil: string | null;
  waitlistPosition: number | null;
  etransferEmail: string;
  sessionUrl: string;
  myUrl: string;
  /** Host's optional message when a session is cancelled. */
  cancelReason?: string | null;
};

// The site's "gym-floor scoreboard" look, in email-safe inline styles. Web fonts
// load in Apple Mail / iOS; Gmail and Outlook fall back to the system stacks.
const c = {
  maple: "#F2E3C6",
  paper: "#FBF3E3",
  ink: "#1B1612",
  inkSoft: "#5B4F45",
  line: "#E8541E",
  board: "#141210",
  led: "#FF6A2B",
};
const display = "'Big Shoulders', 'Arial Narrow', Impact, sans-serif";
const score = "Doto, 'Courier New', monospace";
const sans = "'Atkinson Hyperlegible Next', Verdana, Arial, sans-serif";

const s = {
  body: { backgroundColor: c.maple, fontFamily: sans, margin: 0, padding: "24px 12px" },
  card: { backgroundColor: c.paper, border: `2px solid ${c.ink}`, boxShadow: `6px 6px 0 ${c.ink}`, maxWidth: 520 },
  masthead: { backgroundColor: c.board, padding: "14px 24px", borderBottom: `4px solid ${c.line}` },
  brand: { fontFamily: display, fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px", color: c.maple, margin: 0 },
  content: { padding: "28px 24px 24px" },
  eyebrow: {
    fontFamily: display,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: "3px",
    textTransform: "uppercase",
    color: c.line,
    margin: "0 0 8px",
  },
  heading: {
    fontFamily: display,
    fontSize: 38,
    lineHeight: "36px",
    fontWeight: 900,
    textTransform: "uppercase",
    color: c.ink,
    margin: "0 0 20px",
  },
  text: { fontFamily: sans, fontSize: 16, lineHeight: "25px", color: c.ink, margin: "0 0 16px" },
  board: { backgroundColor: c.board, padding: "18px 20px", margin: "8px 0 20px", borderBottom: `4px solid ${c.line}` },
  boardText: { fontFamily: sans, fontSize: 15, lineHeight: "23px", color: c.maple, margin: 0 },
  step: { fontFamily: score, fontWeight: 900, color: c.led },
  code: { fontFamily: score, fontSize: 40, lineHeight: "44px", fontWeight: 900, letterSpacing: "4px", color: c.led, margin: "10px 0" },
  note: { borderLeft: `4px solid ${c.ink}`, padding: "4px 0 4px 14px", margin: "4px 0 20px" },
  button: {
    backgroundColor: c.line,
    border: `2px solid ${c.ink}`,
    boxShadow: `3px 3px 0 ${c.ink}`,
    color: "#FFF8EE",
    fontFamily: display,
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: "1px",
    textTransform: "uppercase",
    padding: "10px 22px",
  },
  footer: { backgroundColor: c.board, padding: "18px 24px" },
  footerText: { fontFamily: sans, fontSize: 13, lineHeight: "20px", color: c.maple, margin: "0 0 10px" },
  footerLink: { color: c.led, textDecoration: "underline" },
  disclaimer: {
    fontFamily: sans,
    fontSize: 12,
    lineHeight: "18px",
    color: "rgba(242, 227, 198, 0.6)",
    margin: 0,
    paddingTop: 10,
    borderTop: "1px solid rgba(242, 227, 198, 0.2)",
  },
} satisfies Record<string, CSSProperties>;

const fonts = [
  {
    family: "Big Shoulders",
    url: "https://fonts.gstatic.com/s/bigshoulders/v4/qFdR35CPh40oITJ69S3GFqy5-BQAcbz7z7beObrv_Nahg9U.woff2",
  },
  {
    family: "Doto",
    url: "https://fonts.gstatic.com/s/doto/v3/t5tJIRMbNJ6TQG7Il_EKPqP9zTnvqqGNcuvLMt1JIphFkeWuyE-T.woff2",
  },
  {
    family: "Atkinson Hyperlegible Next",
    url: "https://fonts.gstatic.com/s/atkinsonhyperlegiblenext/v7/NaPNcYPdHfdVxJw0IfIP0lvYFqijb-UxCtm5_wdGseiJn3o.woff2",
  },
];
const fontFaces = fonts
  .map(
    (f) =>
      `@font-face{font-family:'${f.family}';font-style:normal;font-weight:100 900;font-display:swap;src:url(${f.url}) format('woff2');}`,
  )
  .join("");

/** Big condensed heading ending in the orange period, like PageTitle on the site. */
function Title({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" style={s.heading}>
      {children}
      <span style={{ color: c.line }}>.</span>
    </Heading>
  );
}

function Layout({
  preview,
  children,
  ctx,
  eyebrow,
  footerNote,
}: {
  preview: string;
  children: ReactNode;
  /** Session emails: adds the session line, map link and cancel link. */
  ctx?: EmailContext;
  eyebrow?: string;
  footerNote?: ReactNode;
}) {
  const top = eyebrow ?? (ctx ? `${ctx.sessionTitle} · ${ctx.when}` : null);
  return (
    <Html lang="en">
      <Head>
        {/* @font-face only. react-email's <Font> also sets `* { font-family }`, which overrides inline styles. */}
        <style>{fontFaces}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={s.body}>
        <Container style={s.card}>
          <Section style={s.masthead}>
            <Text style={s.brand}>
              INTRO<span style={{ color: c.line }}>/</span>HUB
            </Text>
          </Section>

          <Section style={s.content}>
            {top && <Text style={s.eyebrow}>{top}</Text>}
            {children}
          </Section>

          <Section style={s.footer}>
            {ctx && (
              <Text style={s.footerText}>
                {ctx.sessionTitle} · {ctx.when} ·{" "}
                <Link href={mapUrl(ctx.location)} style={s.footerLink}>
                  {ctx.location}
                </Link>
                <br />
                Can&apos;t make it? Cancel from{" "}
                <Link href={ctx.myUrl} style={s.footerLink}>
                  your sign-ups
                </Link>{" "}
                so someone on the waitlist gets your spot.
              </Text>
            )}
            {footerNote && <Text style={s.footerText}>{footerNote}</Text>}
            <Text style={s.disclaimer}>
              Please do not reply. This inbox is not monitored for replies. Questions? Message us on Instagram{" "}
              <Link href="https://www.instagram.com/intro2volleyball/" style={s.footerLink}>
                @intro2volleyball
              </Link>{" "}
              or email{" "}
              <Link href="mailto:intro2volleyball@gmail.com" style={s.footerLink}>
                intro2volleyball@gmail.com
              </Link>
              .
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/** The ref-code panel: dark board with the code in orange LED digits. `amount` defaults to the full price. */
function PaymentBox({ ctx, amount = ctx.price }: { ctx: EmailContext; amount?: string }) {
  return (
    <Section style={s.board}>
      <Text style={s.boardText}>
        <span style={s.step}>01</span>&nbsp; Send <b>{amount}</b> by Interac e-Transfer to <b>{ctx.etransferEmail}</b>
        <br />
        <span style={s.step}>02</span>&nbsp; Put this code in the message:
      </Text>
      <Text style={s.code}>{ctx.refCode}</Text>
      {ctx.deposit && (
        <Text style={{ ...s.boardText, color: "rgba(242, 227, 198, 0.75)", fontSize: 14 }}>
          This is a refundable deposit: the session is free, and you&apos;ll get it back after it.
        </Text>
      )}
      {ctx.holdUntil && (
        <Text style={{ ...s.boardText, color: "rgba(242, 227, 198, 0.75)", fontSize: 14 }}>
          Your spot is held until <b style={{ color: c.maple }}>{ctx.holdUntil}</b>. After that it goes to the next
          person on the waitlist.
        </Text>
      )}
    </Section>
  );
}

type Built = { subject: string; element: ReactNode };

export function buildEmail(kind: RegistrationEvent["event"], ctx: EmailContext): Built {
  const hi = <Text style={s.text}>Hi {ctx.playerName},</Text>;
  const viewButton = (
    <Button href={ctx.sessionUrl} style={s.button}>
      View session
    </Button>
  );

  switch (kind) {
    case "signed_up":
      return {
        subject: `Spot held: ${ctx.sessionTitle} (${ctx.when}) · payment needed`,
        element: (
          <Layout preview={`Pay ${ctx.price} with code ${ctx.refCode} to lock in your spot`} ctx={ctx}>
            <Title>You&apos;ve got a spot</Title>
            {hi}
            <Text style={s.text}>We&apos;re holding a spot for you. It&apos;s confirmed once your payment arrives.</Text>
            <PaymentBox ctx={ctx} />
            {viewButton}
          </Layout>
        ),
      };
    case "promoted":
      return {
        subject: `You're off the waitlist: ${ctx.sessionTitle} (${ctx.when})`,
        element: (
          <Layout preview={`A spot opened up. Pay ${ctx.price} with code ${ctx.refCode} to claim it`} ctx={ctx}>
            <Title>A spot opened up</Title>
            {hi}
            <Text style={s.text}>You&apos;ve moved off the waitlist. Pay soon to keep the spot.</Text>
            <PaymentBox ctx={ctx} />
            {viewButton}
          </Layout>
        ),
      };
    case "waitlisted":
      return {
        subject: `Waitlisted (#${ctx.waitlistPosition ?? "?"}): ${ctx.sessionTitle} (${ctx.when})`,
        element: (
          <Layout preview={`You're #${ctx.waitlistPosition ?? "?"} on the waitlist`} ctx={ctx}>
            <Title>You&apos;re on the waitlist</Title>
            {hi}
            <Text style={s.text}>
              The session is full, so you&apos;re{" "}
              <span style={{ fontFamily: score, fontWeight: 900, color: c.line }}>#{ctx.waitlistPosition ?? "?"}</span>{" "}
              on the waitlist. If a spot opens up you&apos;ll get an email right away with payment instructions.
              Don&apos;t send money yet.
            </Text>
            {viewButton}
          </Layout>
        ),
      };
    case "confirmed":
      return {
        subject: `Confirmed: ${ctx.sessionTitle} (${ctx.when})`,
        element: (
          <Layout preview="Payment received. You're in!" ctx={ctx}>
            <Title>You&apos;re in</Title>
            {hi}
            <Text style={s.text}>
              Payment received. See you at <b>{ctx.location}</b> on <b>{ctx.when}</b>.
            </Text>
            {viewButton}
          </Layout>
        ),
      };
    case "partial_payment":
      return {
        subject: `Almost there: ${ctx.remaining} left for ${ctx.sessionTitle} (${ctx.when})`,
        element: (
          <Layout preview={`We got ${ctx.paid} of ${ctx.price}. Send the remaining ${ctx.remaining} to lock in your spot`} ctx={ctx}>
            <Title>Almost there</Title>
            {hi}
            <Text style={s.text}>
              We received <b>{ctx.paid}</b> of <b>{ctx.price}</b>. Send the remaining <b>{ctx.remaining}</b> with the same
              code and your spot is confirmed. We&apos;re holding it for you a little longer in the meantime.
            </Text>
            <PaymentBox ctx={ctx} amount={ctx.remaining} />
            {viewButton}
          </Layout>
        ),
      };
    case "expired":
      return {
        subject: `Spot released: ${ctx.sessionTitle} (${ctx.when})`,
        element: (
          <Layout preview="We didn't receive payment in time" ctx={ctx}>
            <Title>Your hold expired</Title>
            {hi}
            <Text style={s.text}>
              We didn&apos;t receive your e-Transfer in time, so your spot went to the next person. If you already sent
              it, message us on Instagram or email intro2volleyball@gmail.com and the host will sort it out. You can
              also sign up again (you&apos;ll join the waitlist if it&apos;s full).
            </Text>
            {viewButton}
          </Layout>
        ),
      };
    case "reminder":
      return {
        subject: `Tomorrow: ${ctx.sessionTitle} at ${ctx.location}`,
        element: (
          <Layout preview={`See you ${ctx.when}`} ctx={ctx}>
            <Title>See you tomorrow</Title>
            {hi}
            <Text style={s.text}>
              Reminder: you&apos;re confirmed for <b>{ctx.when}</b> at <b>{ctx.location}</b>.
            </Text>
            {viewButton}
          </Layout>
        ),
      };
    case "session_cancelled":
      return {
        subject: `Cancelled: ${ctx.sessionTitle} (${ctx.when})`,
        element: (
          <Layout preview="This session has been cancelled" ctx={ctx}>
            <Title>Session cancelled</Title>
            {hi}
            <Text style={s.text}>The host cancelled this session. If you already paid, the host will refund you.</Text>
            {ctx.cancelReason && (
              <Section style={s.note}>
                <Text style={{ ...s.text, margin: 0 }}>
                  <b>Message from the host:</b> {ctx.cancelReason}
                </Text>
              </Section>
            )}
          </Layout>
        ),
      };
  }
}

// ---------------------------------------------------------------------------
// Host announcements (Updates board posts emailed to players)
// ---------------------------------------------------------------------------

const POST_STYLES: Record<string, CSSProperties> = {
  p: { ...s.text },
  h2: { fontFamily: display, fontSize: 26, lineHeight: "28px", fontWeight: 900, textTransform: "uppercase", color: c.ink, margin: "20px 0 10px" },
  h3: { fontFamily: display, fontSize: 21, lineHeight: "24px", fontWeight: 900, textTransform: "uppercase", color: c.ink, margin: "18px 0 8px" },
  ul: { fontFamily: sans, fontSize: 16, lineHeight: "25px", color: c.ink, margin: "0 0 16px", paddingLeft: 22 },
  ol: { fontFamily: sans, fontSize: 16, lineHeight: "25px", color: c.ink, margin: "0 0 16px", paddingLeft: 22 },
  li: { margin: "0 0 4px" },
  blockquote: { borderLeft: `4px solid ${c.ink}`, margin: "0 0 16px", padding: "2px 0 2px 14px", color: c.inkSoft },
  a: { color: c.ink, textDecoration: "underline", textDecorationColor: c.line },
};

const cssText = (style: CSSProperties) =>
  Object.entries(style)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${typeof v === "number" ? `${v}px` : v}`)
    .join(";");

/** Inline the email styles onto sanitized post HTML (email clients ignore <style> rules). */
function inlinePostStyles(html: string): string {
  return html.replace(/<(p|h2|h3|ul|ol|li|blockquote|a)(\s[^>]*)?>/g, (_m, tag: string, attrs = "") => {
    return `<${tag}${attrs} style="${cssText(POST_STYLES[tag])}">`;
  });
}

export function buildAnnouncementEmail({
  title,
  bodyHtml,
  playerName,
  postUrl,
  profileUrl,
}: {
  title: string;
  /** Already sanitized (sanitizePostHtml). */
  bodyHtml: string;
  playerName: string;
  postUrl: string;
  profileUrl: string;
}): Built {
  return {
    subject: `${title} · Intro 2 Volleyball`,
    element: (
      <Layout
        preview={title}
        eyebrow="Update from the hosts"
        footerNote={
          <>
            Don&apos;t want these? Turn off announcement emails in{" "}
            <Link href={profileUrl} style={s.footerLink}>
              your profile
            </Link>
            . You&apos;ll still get emails about your own sign-ups.
          </>
        }
      >
        <Title>{title.replace(/[.!?]$/, "")}</Title>
        <Text style={s.text}>Hi {playerName},</Text>
        <div dangerouslySetInnerHTML={{ __html: inlinePostStyles(bodyHtml) }} />
        <Button href={postUrl} style={s.button}>
          Read on the site
        </Button>
      </Layout>
    ),
  };
}
