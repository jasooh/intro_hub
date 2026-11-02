import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentInstructions } from "@/components/payment-instructions";
import type { Registration } from "@/lib/types";

const reg = (over: Partial<Registration> = {}) =>
  ({
    id: "r1",
    status: "pending_payment",
    amount_cents: 1500,
    paid_cents: 0,
    ref_code: "VB-GG22",
    hold_expires_at: null,
    covered_by: null,
    covered_seen: false,
    ...over,
  }) as Registration;

/** Rendered text with tags stripped and whitespace collapsed. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ");

describe("PaymentInstructions, paying for friends", () => {
  it("adds friends to the total with a breakdown", () => {
    const out = text(renderToStaticMarkup(<PaymentInstructions registration={reg()} covering={[{ name: "Sam", dueCents: 1500 }]} />));
    expect(out).toContain("$30.00");
    expect(out).toContain("you $15.00 · Sam $15.00");
    expect(out).toContain("VB-GG22");
  });

  it("asks only for the friends once the payer's own spot is paid", () => {
    const out = text(
      renderToStaticMarkup(
        <PaymentInstructions registration={reg({ status: "confirmed", paid_cents: 1500 })} covering={[{ name: "Sam", dueCents: 1500 }]} />,
      ),
    );
    expect(out).toContain("Send $15.00");
    expect(out).toContain("Sam $15.00");
    expect(out).not.toContain("you $");
  });

  it("tells a covered friend there's nothing to send, and keeps their code", () => {
    const out = text(renderToStaticMarkup(<PaymentInstructions registration={reg()} coveredBy="Alex" />));
    expect(out).toContain("Alex is paying for your spot");
    expect(out).toContain("VB-GG22");
  });

  it("is unchanged without friends", () => {
    const out = text(renderToStaticMarkup(<PaymentInstructions registration={reg()} />));
    expect(out).toContain("Send $15.00");
    expect(out).not.toContain("·");
  });
});
