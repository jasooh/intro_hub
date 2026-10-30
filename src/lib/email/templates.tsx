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
  /** "Add to calendar" links: the .ics file and Google Calendar. */
  calendarUrl?: string;
  googleCalendarUrl?: string;
  /** Optional emails only (the reminder): turns them off. */
  unsubscribeUrl?: string;
  /** session_changed: the time and place before the host changed them. */
  previous?: { when: string; location: string };
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

/** The ref-code panel: dark board with the code in orange LED digits. Asks for what's still owed. */
function PaymentBox({ ctx, amount = ctx.remaining }: { ctx: EmailContext; amount?: string }) {
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

/** Small "Add to calendar: Apple / Outlook · Google" line under the button. */
function CalendarLinks({ ctx }: { ctx: EmailContext }) {
  if (!ctx.calendarUrl || !ctx.googleCalendarUrl) return null;
  const link = { color: c.ink, textDecoration: "underline", textDecorationColor: c.line };
  return (
    <Text style={{ ...s.text, fontSize: 14, color: c.inkSoft, margin: "18px 0 0" }}>
      Add to calendar:{" "}
      <Link href={ctx.calendarUrl} style={link}>
        Apple / Outlook
      </Link>{" "}
      ·{" "}
      <Link href={ctx.googleCalendarUrl} style={link}>
        Google
      </Link>
    </Text>
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
            <CalendarLinks ctx={ctx} />
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
            <CalendarLinks ctx={ctx} />
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
            <CalendarLinks ctx={ctx} />
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
          <Layout
            preview={`See you ${ctx.when}`}
            ctx={ctx}
            footerNote={ctx.unsubscribeUrl && <OptOut unsubscribeUrl={ctx.unsubscribeUrl} settingsUrl={`${new URL(ctx.myUrl).origin}/me`} />}
          >
            <Title>See you tomorrow</Title>
            {hi}
            <Text style={s.text}>
              Reminder: you&apos;re confirmed for <b>{ctx.when}</b> at <b>{ctx.location}</b>.
            </Text>
            {viewButton}
          </Layout>
        ),
      };
    case "hold_reminder":
      return {
        subject: `Payment reminder: ${ctx.sessionTitle} (${ctx.when})`,
        element: (
          <Layout preview={`Send ${ctx.remaining} with code ${ctx.refCode} to keep your spot`} ctx={ctx}>
            <Title>Still holding your spot</Title>
            {hi}
            <Text style={s.text}>
              We haven&apos;t received your payment yet
              {ctx.holdUntil ? (
                <>
                  , and your hold ends <b>{ctx.holdUntil}</b>
                </>
              ) : null}
              . Send it soon so your spot doesn&apos;t go to the waitlist. Already sent it? It can take a few minutes
              to show up, so you can ignore this.
            </Text>
            <PaymentBox ctx={ctx} />
            {viewButton}
          </Layout>
        ),
      };
    case "payment_reversed":
      return {
        subject: `Your e-Transfer was cancelled: ${ctx.sessionTitle} (${ctx.when})`,
        element: (
          <Layout preview={`We didn't get the money. Send ${ctx.remaining} with code ${ctx.refCode} to keep your spot`} ctx={ctx}>
            <Title>Your e-Transfer was cancelled</Title>
            {hi}
            <Text style={s.text}>
              The e-Transfer you sent for this session was cancelled (or expired) before it was deposited, so the money
              didn&apos;t reach us. Your spot is held again
              {ctx.holdUntil ? (
                <>
                  {" "}until <b>{ctx.holdUntil}</b>
                </>
              ) : null}
              . Please send it again before then, or the spot goes to the next person.
            </Text>
            <PaymentBox ctx={ctx} />
            {viewButton}
          </Layout>
        ),
      };
    case "spot_released":
      return {
        subject: `Spot released: ${ctx.sessionTitle} (${ctx.when})`,
        element: (
          <Layout preview="Your e-Transfer was cancelled and your time to pay is over" ctx={ctx}>
            <Title>Your e-Transfer was cancelled</Title>
            {hi}
            <Text style={s.text}>
              The e-Transfer you sent for this session was cancelled (or expired) before it was deposited, so the money
              didn&apos;t reach us. Your time to pay had already run out, so your spot went to the next person. You
              can sign up again (you&apos;ll join the waitlist if it&apos;s full). Think this is a mistake? Message us
              on Instagram or email intro2volleyball@gmail.com.
            </Text>
            {viewButton}
          </Layout>
        ),
      };
    case "session_changed": {
      const moved = ctx.previous && ctx.previous.location !== ctx.location;
      const retimed = !ctx.previous || ctx.previous.when !== ctx.when;
      return {
        subject: `Changed: ${ctx.sessionTitle} is now ${retimed ? ctx.when : `at ${ctx.location}`}`,
        element: (
          <Layout preview={`Now ${ctx.when} at ${ctx.location}`} ctx={ctx}>
            <Title>Session changed</Title>
            {hi}
            <Text style={s.text}>
              The host changed {retimed && moved ? "the time and place" : retimed ? "the time" : "the place"} of a session
              you&apos;re signed up for. Your sign-up stays as it is.
            </Text>
            <Section style={s.note}>
              {ctx.previous && (
                <Text style={{ ...s.text, margin: "0 0 6px", color: c.inkSoft, textDecoration: "line-through" }}>
                  Was: {ctx.previous.when} · {ctx.previous.location}
                </Text>
              )}
              <Text style={{ ...s.text, margin: 0 }}>
                <b>Now: {ctx.when} · {ctx.location}</b>
              </Text>
            </Section>
            <Text style={s.text}>
              Can&apos;t make it any more? Cancel from your sign-ups so someone on the waitlist gets your spot, and message
              the host about a refund.
            </Text>
            {viewButton}
            <CalendarLinks ctx={ctx} />
          </Layout>
        ),
      };
    }
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
  unsubscribeUrl,
}: {
  title: string;
  /** Already sanitized (sanitizePostHtml). */
  bodyHtml: string;
  playerName: string;
  postUrl: string;
  profileUrl: string;
  /** One-click link that turns these emails off (src/lib/unsubscribe.ts). */
  unsubscribeUrl?: string;
}): Built {
  return {
    subject: `${title} · Intro 2 Volleyball`,
    element: (
      <Layout
        preview={title}
        eyebrow="Update from the hosts"
        footerNote={
<OptOut unsubscribeUrl={unsubscribeUrl} settingsUrl={profileUrl} />
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

// ---------------------------------------------------------------------------
// Host message to one session's players
// ---------------------------------------------------------------------------

export function buildSessionMessageEmail({
  subject,
  bodyHtml,
  playerName,
  sessionTitle,
  when,
  sessionUrl,
}: {
  subject: string;
  /** Already sanitized (sanitizePostHtml). */
  bodyHtml: string;
  playerName: string;
  sessionTitle: string;
  when: string;
  sessionUrl: string;
}): Built {
  return {
    subject: `${subject} · ${sessionTitle} (${when})`,
    element: (
      <Layout
        preview={subject}
        eyebrow={`${sessionTitle} · ${when}`}
        footerNote={<>You&apos;re getting this because you signed up for this session.</>}
      >
        <Title>{subject.replace(/[.!?]$/, "")}</Title>
        <Text style={s.text}>Hi {playerName},</Text>
        <div dangerouslySetInnerHTML={{ __html: inlinePostStyles(bodyHtml) }} />
        <Button href={sessionUrl} style={s.button}>
          View session
        </Button>
      </Layout>
    ),
  };
}

// ---------------------------------------------------------------------------
// Inbox messages (host <-> player threads)
// ---------------------------------------------------------------------------

/** A new message in a thread. `toHost` flips the greeting and footer. */
export function buildMessageEmail({
  subject,
  body,
  recipientName,
  senderName,
  threadUrl,
  settingsUrl,
  unsubscribeUrl,
  toHost,
}: {
  subject: string;
  /** Plain text, shown with its line breaks. */
  body: string;
  recipientName: string;
  senderName: string;
  threadUrl: string;
  settingsUrl: string;
  unsubscribeUrl?: string;
  toHost?: boolean;
}): Built {
  return {
    subject: toHost ? `${senderName}: ${subject}` : `${subject} · Intro 2 Volleyball`,
    element: (
      <Layout
        preview={body.slice(0, 90)}
        eyebrow={toHost ? "Message from a player" : "Message from the hosts"}
        footerNote={
          toHost ? (
            <HostFooter settingsUrl={settingsUrl} unsubscribeUrl={unsubscribeUrl} />
          ) : (
            <OptOut unsubscribeUrl={unsubscribeUrl} settingsUrl={settingsUrl} />
          )
        }
      >
        <Title>{subject.replace(/[.!?]$/, "")}</Title>
        <Text style={s.text}>Hi {recipientName},</Text>
        <Text style={s.text}>{senderName} wrote:</Text>
        <Text style={{ ...s.text, whiteSpace: "pre-wrap", borderLeft: `3px solid ${c.line}`, paddingLeft: 12 }}>
          {body}
        </Text>
        <Button href={threadUrl} style={s.button}>
          Reply on Intro Hub
        </Button>
      </Layout>
    ),
  };
}

// ---------------------------------------------------------------------------
// Sign-ups are open (sent to everyone who gets announcements)
// ---------------------------------------------------------------------------

export function buildSessionOpenEmail({
  playerName,
  sessionTitle,
  when,
  location,
  options,
  deposit,
  spotsLeft,
  notes,
  sessionUrl,
  profileUrl,
  unsubscribeUrl,
}: {
  playerName: string;
  sessionTitle: string;
  when: string;
  location: string;
  /** Each sign-up option: label, price, and its times. */
  options: { label: string; price: string; time: string | null }[];
  /** Free session with a refundable deposit (formatted), or null. */
  deposit: string | null;
  spotsLeft: number;
  /** The host's notes on the session. */
  notes: string | null;
  sessionUrl: string;
  profileUrl: string;
  unsubscribeUrl?: string;
}): Built {
  return {
    subject: `Sign-ups open: ${sessionTitle} (${when})`,
    element: (
      <Layout
        preview={`${spotsLeft} spots · ${when} at ${location}`}
        eyebrow="Sign-ups are open"
        footerNote={
<OptOut unsubscribeUrl={unsubscribeUrl} settingsUrl={profileUrl} />
        }
      >
        <Title>{sessionTitle}</Title>
        <Text style={s.text}>Hi {playerName},</Text>
        <Text style={s.text}>
          Sign-ups are open for <b>{when}</b> at{" "}
          <Link href={mapUrl(location)} style={{ color: c.ink, textDecoration: "underline", textDecorationColor: c.line }}>
            {location}
          </Link>
          . <b>{spotsLeft}</b> drop-in spot{spotsLeft === 1 ? "" : "s"} left. Spots go first come, first served.
        </Text>
        <Section style={s.board}>
          {deposit ? (
            <Text style={s.boardText}>
              Free session · <b>{deposit}</b> refundable deposit to hold your spot
            </Text>
          ) : (
            options.map((o) => (
              <Text key={o.label} style={{ ...s.boardText, margin: "0 0 6px" }}>
                <span style={s.step}>{o.price}</span>&nbsp; {o.label}
                {o.time ? ` · ${o.time}` : ""}
              </Text>
            ))
          )}
        </Section>
        {notes && (
          <Section style={s.note}>
            <Text style={{ ...s.text, margin: 0, whiteSpace: "pre-line" }}>
              <b>From the host:</b> {notes}
            </Text>
          </Section>
        )}
        <Button href={sessionUrl} style={s.button}>
          Sign up
        </Button>
      </Layout>
    ),
  };
}

// ---------------------------------------------------------------------------
// Host notifications (digest, session day, instant alerts)
// ---------------------------------------------------------------------------

/** Footer on every host email: why they got it, and where to change it. */
function HostFooter({ settingsUrl, unsubscribeUrl }: { settingsUrl: string; unsubscribeUrl?: string }) {
  return (
    <>
      You&apos;re getting this as a host.{" "}
      <Link href={settingsUrl} style={s.footerLink}>
        Change host emails
      </Link>{" "}
      in your account
      {unsubscribeUrl && (
        <>
          , or{" "}
          <Link href={unsubscribeUrl} style={s.footerLink}>
            unsubscribe
          </Link>
        </>
      )}
      .
    </>
  );
}

/** Footer on optional player emails: unsubscribe in one click, or change settings. */
function OptOut({ unsubscribeUrl, settingsUrl }: { unsubscribeUrl?: string; settingsUrl: string }) {
  return (
    <>
      Don&apos;t want these?{" "}
      {unsubscribeUrl && (
        <>
          <Link href={unsubscribeUrl} style={s.footerLink}>
            Unsubscribe
          </Link>{" "}
          or change{" "}
        </>
      )}
      {!unsubscribeUrl && "Change "}
      <Link href={settingsUrl} style={s.footerLink}>
        your email settings
      </Link>
      . You&apos;ll still get emails about your own sign-ups.
    </>
  );
}

const hostLink = { color: c.ink, textDecoration: "underline", textDecorationColor: c.line };
const label = { fontFamily: display, fontSize: 13, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", color: c.inkSoft } as const;

export type DigestSession = {
  title: string;
  when: string;
  url: string;
  /** "16/18 drop-in · 2 instructional · 3 waiting" */
  status: string;
  /** e.g. { label: "Joined", names: ["Maya T.", "Leo F."] } */
  lines: { label: string; names: string[] }[];
  /** "2 unpaid · $25.00", or null */
  unpaid: string | null;
};

export function buildHostDigestEmail({
  hostName,
  since,
  sessions,
  unmatched,
  paymentsUrl,
  settingsUrl,
  unsubscribeUrl,
}: {
  hostName: string;
  /** "since 3:00 p.m." */
  since: string;
  sessions: DigestSession[];
  /** e-Transfers still waiting to be assigned. */
  unmatched: number;
  paymentsUrl: string;
  settingsUrl: string;
  unsubscribeUrl?: string;
}): Built {
  const changes = sessions.reduce((n, x) => n + x.lines.reduce((m, l) => m + l.names.length, 0), 0);
  return {
    subject: `Host update: ${changes} change${changes === 1 ? "" : "s"} ${since}`,
    element: (
      <Layout preview={sessions.map((x) => `${x.title} ${x.status}`).join(" · ")} eyebrow={`Host update · ${since}`} footerNote={<HostFooter settingsUrl={settingsUrl} unsubscribeUrl={unsubscribeUrl} />}>
        <Title>What changed</Title>
        <Text style={s.text}>Hi {hostName},</Text>
        {sessions.map((x) => (
          <Section key={x.url} style={{ ...s.note, margin: "0 0 18px" }}>
            <Text style={{ ...s.text, margin: "0 0 2px" }}>
              <Link href={x.url} style={hostLink}>
                <b>{x.title}</b> · {x.when}
              </Link>
            </Text>
            <Text style={{ ...s.text, fontSize: 14, color: c.inkSoft, margin: "0 0 6px" }}>{x.status}</Text>
            {x.lines.map((l) => (
              <Text key={l.label} style={{ ...s.text, fontSize: 15, margin: "0 0 2px" }}>
                <span style={label}>{l.label}</span>&nbsp; {l.names.join(", ")}
              </Text>
            ))}
            {x.unpaid && (
              <Text style={{ ...s.text, fontSize: 15, margin: "4px 0 0", color: "#a8590f" }}>Still unpaid: {x.unpaid}</Text>
            )}
          </Section>
        ))}
        {unmatched > 0 && (
          <Text style={s.text}>
            <b>
              {unmatched} e-Transfer{unmatched === 1 ? "" : "s"}
            </b>{" "}
            couldn&apos;t be matched to a sign-up.{" "}
            <Link href={paymentsUrl} style={hostLink}>
              Assign them
            </Link>
            .
          </Text>
        )}
      </Layout>
    ),
  };
}

export type SessionDayPlayer = { name: string; detail: string | null };

export function buildSessionDayEmail({
  hostName,
  sessionTitle,
  when,
  location,
  status,
  roster,
  instructional,
  waitlist,
  owed,
  notes,
  adminUrl,
  settingsUrl,
  unsubscribeUrl,
}: {
  hostName: string;
  sessionTitle: string;
  when: string;
  location: string;
  status: string;
  /** Drop-in players, with what to know (unpaid, first time, note…). */
  roster: SessionDayPlayer[];
  instructional: SessionDayPlayer[];
  waitlist: string[];
  /** "3 unpaid · $40.00", or null */
  owed: string | null;
  notes: string | null;
  adminUrl: string;
  settingsUrl: string;
  unsubscribeUrl?: string;
}): Built {
  const list = (players: SessionDayPlayer[]) =>
    players.map((p, i) => (
      <Text key={`${p.name}-${i}`} style={{ ...s.text, fontSize: 15, margin: "0 0 2px" }}>
        <span style={{ fontFamily: score, fontWeight: 900, color: c.line }}>{String(i + 1).padStart(2, "0")}</span>&nbsp; {p.name}
        {p.detail && <span style={{ color: c.inkSoft }}> · {p.detail}</span>}
      </Text>
    ));
  return {
    subject: `Today: ${sessionTitle} (${when}) · ${status}`,
    element: (
      <Layout preview={`${status}${owed ? ` · ${owed}` : ""}`} eyebrow={`Today · ${when}`} footerNote={<HostFooter settingsUrl={settingsUrl} unsubscribeUrl={unsubscribeUrl} />}>
        <Title>Game day</Title>
        <Text style={s.text}>
          Hi {hostName}, here&apos;s tonight at <b>{location}</b>: <b>{status}</b>.
        </Text>
        {owed && <Text style={{ ...s.text, color: "#a8590f" }}>Still unpaid: {owed}</Text>}
        {notes && (
          <Section style={s.note}>
            <Text style={{ ...s.text, margin: 0, whiteSpace: "pre-line" }}>
              <b>Session notes:</b> {notes}
            </Text>
          </Section>
        )}
        <Text style={{ ...label, margin: "12px 0 6px" }}>Drop-in · {roster.length}</Text>
        {roster.length ? list(roster) : <Text style={{ ...s.text, color: c.inkSoft }}>Nobody yet.</Text>}
        {instructional.length > 0 && (
          <>
            <Text style={{ ...label, margin: "14px 0 6px" }}>Instructional only · {instructional.length}</Text>
            {list(instructional)}
          </>
        )}
        {waitlist.length > 0 && (
          <Text style={{ ...s.text, fontSize: 15, marginTop: 14 }}>
            <span style={label}>Waitlist</span>&nbsp; {waitlist.join(", ")}
          </Text>
        )}
        <Button href={adminUrl} style={s.button}>
          Open the session
        </Button>
      </Layout>
    ),
  };
}

export function buildHostAlertEmail({
  title,
  subject,
  hostName,
  lines,
  buttonLabel,
  buttonUrl,
  settingsUrl,
  unsubscribeUrl,
}: {
  title: string;
  subject: string;
  hostName: string;
  lines: string[];
  buttonLabel: string;
  buttonUrl: string;
  settingsUrl: string;
  unsubscribeUrl?: string;
}): Built {
  return {
    subject,
    element: (
      <Layout preview={lines[0] ?? title} eyebrow="Host alert" footerNote={<HostFooter settingsUrl={settingsUrl} unsubscribeUrl={unsubscribeUrl} />}>
        <Title>{title}</Title>
        <Text style={s.text}>Hi {hostName},</Text>
        {lines.map((l) => (
          <Text key={l} style={s.text}>
            {l}
          </Text>
        ))}
        <Button href={buttonUrl} style={s.button}>
          {buttonLabel}
        </Button>
      </Layout>
    ),
  };
}
