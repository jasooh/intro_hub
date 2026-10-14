import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { mapUrl } from "@/lib/maps";
import type { ReactNode } from "react";
import type { RegistrationEvent } from "@/lib/types";

export type EmailContext = {
  playerName: string;
  sessionTitle: string;
  when: string;        // formatted start time
  location: string;
  price: string;       // formatted price
  refCode: string;
  holdUntil: string | null;
  waitlistPosition: number | null;
  etransferEmail: string;
  sessionUrl: string;
  myUrl: string;
  /** Host's optional message when a session is cancelled. */
  cancelReason?: string | null;
};

const styles = {
  body: { backgroundColor: "#f4f4f5", fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif", padding: "24px 0" },
  container: { backgroundColor: "#ffffff", borderRadius: 12, padding: 32, maxWidth: 480 },
  heading: { fontSize: 22, margin: "0 0 16px" },
  text: { fontSize: 15, lineHeight: "24px", color: "#27272a" },
  box: { backgroundColor: "#fef3c7", borderRadius: 8, padding: "12px 16px", margin: "16px 0" },
  code: { fontFamily: "monospace", fontSize: 18, fontWeight: 700, letterSpacing: 1 },
  button: { backgroundColor: "#ea580c", color: "#ffffff", borderRadius: 8, padding: "12px 20px", fontWeight: 600 },
  muted: { fontSize: 13, color: "#71717a" },
};

function Layout({ preview, children, ctx }: { preview: string; children: ReactNode; ctx: EmailContext }) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {children}
          <Hr />
          <Text style={styles.muted}>
            {ctx.sessionTitle} · {ctx.when} · <a href={mapUrl(ctx.location)}>{ctx.location}</a>
            <br />
            Can&apos;t make it? Cancel from <a href={ctx.myUrl}>your sign-ups</a> so someone on the waitlist gets your spot.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function PaymentBox({ ctx }: { ctx: EmailContext }) {
  return (
    <Section style={styles.box}>
      <Text style={{ ...styles.text, margin: 0 }}>
        Send <b>{ctx.price}</b> by Interac e-Transfer to <b>{ctx.etransferEmail}</b> and put this code in the message:
      </Text>
      <Text style={{ ...styles.code, margin: "8px 0" }}>{ctx.refCode}</Text>
      {ctx.holdUntil && (
        <Text style={{ ...styles.text, margin: 0 }}>
          Your spot is held until <b>{ctx.holdUntil}</b>. After that it goes to the next person on the waitlist.
        </Text>
      )}
    </Section>
  );
}

type Built = { subject: string; element: ReactNode };

export function buildEmail(kind: RegistrationEvent["event"], ctx: EmailContext): Built {
  const hi = <Text style={styles.text}>Hi {ctx.playerName},</Text>;
  const viewButton = (
    <Button href={ctx.sessionUrl} style={styles.button}>
      View session
    </Button>
  );

  switch (kind) {
    case "signed_up":
      return {
        subject: `Spot held: ${ctx.sessionTitle} (${ctx.when}) — payment needed`,
        element: (
          <Layout preview={`Pay ${ctx.price} with code ${ctx.refCode} to lock in your spot`} ctx={ctx}>
            <Heading style={styles.heading}>You&apos;ve got a spot 🏐</Heading>
            {hi}
            <Text style={styles.text}>We&apos;re holding a spot for you. It&apos;s confirmed once your payment arrives.</Text>
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
            <Heading style={styles.heading}>A spot opened up! 🎉</Heading>
            {hi}
            <Text style={styles.text}>You&apos;ve moved off the waitlist. Pay soon to keep the spot.</Text>
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
            <Heading style={styles.heading}>You&apos;re on the waitlist</Heading>
            {hi}
            <Text style={styles.text}>
              The session is full, so you&apos;re <b>#{ctx.waitlistPosition ?? "?"}</b> on the waitlist. If a spot
              opens up you&apos;ll get an email right away with payment instructions. Don&apos;t send money yet.
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
            <Heading style={styles.heading}>You&apos;re in ✅</Heading>
            {hi}
            <Text style={styles.text}>
              Payment received. See you at <b>{ctx.location}</b> on <b>{ctx.when}</b>.
            </Text>
            {viewButton}
          </Layout>
        ),
      };
    case "expired":
      return {
        subject: `Spot released: ${ctx.sessionTitle} (${ctx.when})`,
        element: (
          <Layout preview="We didn't receive payment in time" ctx={ctx}>
            <Heading style={styles.heading}>Your hold expired</Heading>
            {hi}
            <Text style={styles.text}>
              We didn&apos;t receive your e-Transfer in time, so your spot went to the next person. If you already sent
              it, reply to this email and the host will sort it out. You can also sign up again (you&apos;ll join the
              waitlist if it&apos;s full).
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
            <Heading style={styles.heading}>See you soon 🏐</Heading>
            {hi}
            <Text style={styles.text}>
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
            <Heading style={styles.heading}>Session cancelled</Heading>
            {hi}
            <Text style={styles.text}>
              The host cancelled this session. If you already paid, the host will refund you.
            </Text>
            {ctx.cancelReason && (
              <Section style={styles.box}>
                <Text style={{ ...styles.text, margin: 0 }}>
                  <b>Message from the host:</b> {ctx.cancelReason}
                </Text>
              </Section>
            )}
          </Layout>
        ),
      };
  }
}
