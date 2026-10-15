import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Load the Apps Script's pure parser without the Google globals.
const source = readFileSync(join(__dirname, "..", "scripts", "gmail-ingest.gs"), "utf8");
const { parseInteracEmail, gmailQuery, isPaymentSender } = new Function(
  `${source}; return { parseInteracEmail, gmailQuery, isPaymentSender };`,
)() as {
  parseInteracEmail: (subject: string, body: string) => { senderName: string | null; amountCents: number; memo: string | null } | null;
  gmailQuery: (testSender: string | null) => string;
  isPaymentSender: (from: string, subject: string, testSender: string | null) => boolean;
};

describe("parseInteracEmail", () => {
  it("parses the 'sent you money' format", () => {
    const body = `Hi JUSTIN,

JANE DOE has sent you $10.00 (CAD).

Message: VB-7K3Q

To deposit your money, click here: ...`;
    expect(parseInteracEmail("INTERAC e-Transfer: JANE DOE sent you money.", body)).toEqual({
      senderName: "JANE DOE",
      amountCents: 1000,
      memo: "VB-7K3Q",
    });
  });

  it("parses the autodeposit format with labelled fields", () => {
    const body = `Your funds have been automatically deposited.

Sent From: José Álvarez
Amount: $1,012.50 (CAD)
Message: volleyball sat
Reference Number: CAabc123`;
    expect(
      parseInteracEmail("INTERAC e-Transfer: A money transfer from José Álvarez has been automatically deposited.", body),
    ).toEqual({ senderName: "José Álvarez", amountCents: 101250, memo: "volleyball sat" });
  });

  it("returns a null memo when there is no message", () => {
    const result = parseInteracEmail("INTERAC e-Transfer: SAM LEE sent you money.", "SAM LEE has sent you $10.00 (CAD).");
    expect(result).toEqual({ senderName: "SAM LEE", amountCents: 1000, memo: null });
  });

  it("ignores outgoing transfer confirmations", () => {
    expect(
      parseInteracEmail(
        "INTERAC e-Transfer: Your money transfer to JANE DOE was deposited.",
        "Your transfer of $25.00 (CAD) to JANE DOE was deposited.",
      ),
    ).toBeNull();
  });
});

describe("test mode", () => {
  it("only searches for test emails when a test sender is set", () => {
    expect(gmailQuery(null)).toBe("(from:(notify@payments.interac.ca)) newer_than:3d");
    expect(gmailQuery("me@gmail.com")).toBe(
      '(from:(notify@payments.interac.ca) OR (from:(me@gmail.com) subject:"TEST INTERAC e-Transfer")) newer_than:3d',
    );
  });

  it("accepts Interac always, and the test sender only with the test subject", () => {
    const interac = "Interac e-Transfer <notify@payments.interac.ca>";
    expect(isPaymentSender(interac, "INTERAC e-Transfer: JANE sent you money.", null)).toBe(true);
    expect(isPaymentSender("Justin <Me@Gmail.com>", "TEST INTERAC e-Transfer: JANE DOE sent you money.", "me@gmail.com")).toBe(true);
    expect(isPaymentSender("Justin <me@gmail.com>", "Re: lunch?", "me@gmail.com")).toBe(false);
    expect(isPaymentSender("Justin <me@gmail.com>", "TEST INTERAC e-Transfer: JANE DOE sent you money.", null)).toBe(false);
    expect(isPaymentSender("someone@else.com", "TEST INTERAC e-Transfer: JANE DOE sent you money.", "me@gmail.com")).toBe(false);
  });

  it("parses the test email exactly like a real one", () => {
    // Same text sendTestEmail() produces.
    const body = `Hi,

JANE DOE has sent you $10.00 (CAD).

Message: VB-7K3Q

(Test email for Intro Hub.)`;
    expect(parseInteracEmail("TEST INTERAC e-Transfer: JANE DOE sent you money.", body)).toEqual({
      senderName: "JANE DOE",
      amountCents: 1000,
      memo: "VB-7K3Q",
    });
  });
});
