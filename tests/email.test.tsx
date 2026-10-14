import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { buildEmail, type EmailContext } from "@/lib/email/templates";
import type { RegistrationEvent } from "@/lib/types";

const ctx: EmailContext = {
  playerName: "Jane",
  sessionTitle: "Intro 2 Volleyball",
  when: "Sat, Oct 17, 6:00 p.m.",
  location: "Downtown Gym",
  price: "$10.00",
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
