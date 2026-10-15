import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { buildAnnouncementEmail, buildEmail, type EmailContext } from "@/lib/email/templates";
import type { RegistrationEvent } from "@/lib/types";

const ctx: EmailContext = {
  playerName: "Jane",
  sessionTitle: "Intro 2 Volleyball",
  when: "Sat, Oct 17, 6:00 p.m.",
  location: "Downtown Gym",
  price: "$10.00",
  paid: "$6.00",
  remaining: "$4.00",
  refCode: "VB-7K3Q",
  holdUntil: "Sat, Oct 17, 9:00 a.m.",
  waitlistPosition: 3,
  etransferEmail: "host@example.com",
  sessionUrl: "https://example.com/s/1",
  myUrl: "https://example.com/me",
};

const kinds: RegistrationEvent["event"][] = [
  "signed_up",
  "waitlisted",
  "promoted",
  "confirmed",
  "partial_payment",
  "expired",
  "reminder",
  "session_cancelled",
];

describe("email templates", () => {
  it.each(kinds)("%s renders", async (kind) => {
    const { subject, element } = buildEmail(kind, ctx);
    expect(subject).toContain("Intro 2 Volleyball");
    const text = await render(element, { plainText: true });
    expect(text).toContain("Hi Jane");
  });

  it("payment emails include the ref code and e-Transfer address", async () => {
    for (const kind of ["signed_up", "promoted"] as const) {
      const text = await render(buildEmail(kind, ctx).element, { plainText: true });
      expect(text).toContain("VB-7K3Q");
      expect(text).toContain("host@example.com");
    }
  });

  it("cancellation emails include the host's message only when given", async () => {
    const withReason = await render(
      buildEmail("session_cancelled", { ...ctx, cancelReason: "Gym double-booked, sorry!" }).element,
      { plainText: true },
    );
    expect(withReason).toContain("Gym double-booked, sorry!");
    const without = await render(buildEmail("session_cancelled", ctx).element, { plainText: true });
    expect(without).not.toContain("Message from the host");
  });
});

describe("partial payment email", () => {
  it("says what arrived and asks for exactly what's left, with the same code", async () => {
    const { subject, element } = buildEmail("partial_payment", ctx);
    expect(subject).toContain("$4.00 left");
    const text = await render(element, { plainText: true });
    expect(text).toContain("received $6.00 of $10.00");
    expect(text).toContain("Send $4.00 by Interac e-Transfer");
    expect(text).toContain("VB-7K3Q");
  });
});

describe("email footer", () => {
  it.each(kinds)("%s says replies aren't monitored", async (kind) => {
    const text = await render(buildEmail(kind, ctx).element, { plainText: true });
    expect(text).toContain("Please do not reply. This inbox is not monitored for replies.");
  });

  it("no email asks people to reply", async () => {
    for (const kind of kinds) {
      const text = await render(buildEmail(kind, ctx).element, { plainText: true });
      expect(text.toLowerCase()).not.toContain("reply to this email");
    }
  });
});

describe("announcement email", () => {
  const built = () =>
    buildAnnouncementEmail({
      title: "Gym change this week",
      bodyHtml: "<p>We're in <strong>Gym 3</strong>.</p><ul><li>Same time</li></ul>",
      playerName: "Jane",
      postUrl: "https://example.com/updates#post-1",
      profileUrl: "https://example.com/me",
    });

  it("renders the post with inline styles, the opt-out line and the do-not-reply notice", async () => {
    const { subject, element } = built();
    expect(subject).toContain("Gym change this week");
    const html = await render(element);
    expect(html).toContain('<strong>Gym 3</strong>');
    expect(html).toMatch(/<li style="[^"]+">Same time<\/li>/);
    const text = await render(element, { plainText: true });
    expect(text).toContain("Hi Jane");
    expect(text).toContain("Turn off announcement emails");
    expect(text).toContain("Please do not reply. This inbox is not monitored for replies.");
  });
});
