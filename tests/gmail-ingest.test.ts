import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Load the Apps Script's pure parser without the Google globals.
const source = readFileSync(join(__dirname, "..", "scripts", "gmail-ingest.gs"), "utf8");
const { parseInteracEmail, gmailQuery, isPaymentSender } = new Function(
  `${source}; return { parseInteracEmail, gmailQuery, isPaymentSender };`,
)() as {
  parseInteracEmail: (
    subject: string,
    body: string,
  ) => {
    kind: "received" | "cancelled";
    senderName: string | null;
    amountCents: number | null;
    memo: string | null;
    reference: string | null;
    sentOn: string | null;
  } | null;
  gmailQuery: (testSender: string | null) => string;
  isPaymentSender: (
    from: string,
    subject: string,
    testSender: string | null,
    authResults: string | null,
    ownAddress: string | null,
  ) => boolean;
};

// Authentication-Results headers as Gmail writes them.
const INTERAC_AUTH =
  "mx.google.com; dkim=pass header.i=@payments.interac.ca header.s=s1 header.b=abc123; spf=pass (google.com: domain of bounce@payments.interac.ca designates 1.2.3.4 as permitted sender) smtp.mailfrom=bounce@payments.interac.ca; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=payments.interac.ca";
const GMAIL_AUTH = "mx.google.com; dkim=pass header.i=@gmail.com header.s=20230601 header.b=xyz; spf=pass smtp.mailfrom=me@gmail.com; dmarc=pass (p=NONE sp=QUARANTINE dis=NONE) header.from=gmail.com";
const ATTACKER_AUTH = "mx.google.com; dkim=pass header.i=@gmail.com header.s=20230601 header.b=evil; dmarc=pass (p=NONE sp=QUARANTINE dis=NONE) header.from=gmail.com";
const SPOOFED_AUTH = "mx.google.com; spf=fail smtp.mailfrom=notify@payments.interac.ca; dmarc=fail (p=REJECT sp=REJECT dis=QUARANTINE) header.from=payments.interac.ca";
const PAYMENT_SUBJECT = "INTERAC e-Transfer: JANE sent you money.";
const TEST = "TEST INTERAC e-Transfer: JANE DOE sent you money.";

describe("parseInteracEmail", () => {
  it("parses the 'sent you money' format", () => {
    const body = `Hi JUSTIN,

JANE DOE has sent you $10.00 (CAD).

Message: VB-7K3Q

To deposit your money, click here: ...`;
    expect(parseInteracEmail("INTERAC e-Transfer: JANE DOE sent you money.", body)).toMatchObject({
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
    ).toMatchObject({ kind: "received", senderName: "José Álvarez", amountCents: 101250, memo: "volleyball sat" });
  });

  it("parses the 'sent you $X. Claim your deposit!' format", () => {
    const body = `Hi Intro 2 Volleyball,

JUSTIN ABUYUAN sent you $1.00 (CAD) and the money is waiting for you.

Message: VB-7K3Q

Claim your deposit: ...`;
    expect(parseInteracEmail("Interac e-Transfer: JUSTIN ABUYUAN sent you $1.00. Claim your deposit!", body)).toMatchObject({
      senderName: "JUSTIN ABUYUAN",
      amountCents: 100,
      memo: "VB-7K3Q",
    });
  });

  it("reads 'Message from NAME:' lines, or a ref code anywhere in the email", () => {
    expect(
      parseInteracEmail("Interac e-Transfer: SAM LEE sent you $15.00. Claim your deposit!", "Message from SAM LEE: VB-9MZP thanks!")
        ?.memo,
    ).toBe("VB-9MZP thanks!");
    expect(
      parseInteracEmail("Interac e-Transfer: SAM LEE sent you $15.00. Claim your deposit!", "Your note: vb-9mzp for saturday")?.memo,
    ).toBe("VB-9MZP");
  });

  it("reads cancelled e-Transfers, with the reference number", () => {
    const body = `Hi Intro 2 Volleyball,

JANE DOE has cancelled the Interac e-Transfer they sent you.

Amount: $15.00 (CAD)
Message: VB-7K3Q
Reference Number: CAqXk3Zm9Tt2`;
    expect(parseInteracEmail("INTERAC e-Transfer: JANE DOE cancelled the transfer.", body)).toEqual({
      kind: "cancelled",
      senderName: "JANE DOE",
      amountCents: 1500,
      memo: "VB-7K3Q",
      reference: "CAqXk3Zm9Tt2",
      sentOn: null,
    });
  });

  it("reads the real cancellation email: amount and the day it was sent, no sender", () => {
    const body = `Hi Intro 2 Volleyball,
Your transfer of $14.00 has been cancelled.
The recent transfer of $14.00 (CAD) sent to you on Oct 19, 2026 has been cancelled. As a result, you can no longer deposit these funds.`;
    for (const subject of ["Interac e-Transfer: Your transfer of $14.00 has been cancelled.", "INTERAC e-Transfer notification"]) {
      expect(parseInteracEmail(subject, body)).toEqual({
        kind: "cancelled",
        senderName: null,
        amountCents: 1400,
        memo: null,
        reference: null,
        sentOn: "2026-10-19",
      });
    }
  });

  it("a received payment is never read as cancelled because of its body", () => {
    expect(
      parseInteracEmail("Interac e-Transfer: JANE sent you $5.00. Claim your deposit!", "If you don't deposit it, it has expired after 30 days."),
    ).toMatchObject({ kind: "received", senderName: "JANE" });
  });

  it("reads expired and 'has been cancelled' transfers, even without an amount", () => {
    expect(
      parseInteracEmail("INTERAC e-Transfer: The money transfer from SAM LEE has expired.", "The transfer of $10.00 (CAD) expired."),
    ).toMatchObject({ kind: "cancelled", senderName: "SAM LEE", amountCents: 1000 });
    expect(
      parseInteracEmail("INTERAC e-Transfer: The money transfer from SAM LEE has been cancelled.", "It can no longer be deposited."),
    ).toMatchObject({ kind: "cancelled", senderName: "SAM LEE", amountCents: null });
    expect(parseInteracEmail("Virement INTERAC : SAM LEE a annulé le virement", "Montant : 10,00 $")).toMatchObject({
      kind: "cancelled",
      senderName: "SAM LEE",
    });
  });

  it("keeps the reference number on received payments too", () => {
    expect(
      parseInteracEmail(
        "INTERAC e-Transfer: A money transfer from JANE DOE has been automatically deposited.",
        "Sent From: JANE DOE\nAmount: $15.00 (CAD)\nReference Number: CAqXk3Zm9Tt2",
      ),
    ).toMatchObject({ kind: "received", reference: "CAqXk3Zm9Tt2" });
  });

  it("returns a null memo when there is no message", () => {
    const result = parseInteracEmail("INTERAC e-Transfer: SAM LEE sent you money.", "SAM LEE has sent you $10.00 (CAD).");
    expect(result).toMatchObject({ kind: "received", senderName: "SAM LEE", amountCents: 1000, memo: null });
  });

  it("ignores cancelling a transfer the host sent", () => {
    expect(
      parseInteracEmail("INTERAC e-Transfer: Your money transfer to JANE DOE was cancelled.", "Amount: $25.00 (CAD)"),
    ).toBeNull();
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

  it("accepts the test sender only with the test subject, and only when verified", () => {
    // Delivered from outside: needs a passing DMARC/DKIM result.
    expect(isPaymentSender("Justin <Me@Gmail.com>", TEST, "me@gmail.com", GMAIL_AUTH, "host@gmail.com")).toBe(true);
    expect(isPaymentSender("Justin <me@gmail.com>", "Re: lunch?", "me@gmail.com", GMAIL_AUTH, "host@gmail.com")).toBe(false);
    expect(isPaymentSender("Justin <me@gmail.com>", TEST, null, GMAIL_AUTH, "host@gmail.com")).toBe(false);
    expect(isPaymentSender("someone@else.com", TEST, "me@gmail.com", GMAIL_AUTH, "host@gmail.com")).toBe(false);
    // sendTestEmail(): this account to itself, so no Authentication-Results at all.
    expect(isPaymentSender("Host <host@gmail.com>", TEST, "host@gmail.com", "", "host@gmail.com")).toBe(true);
    expect(isPaymentSender("Justin <me@gmail.com>", TEST, "me@gmail.com", "", "host@gmail.com")).toBe(false);
  });
});

describe("sender verification (no faking a payment email)", () => {
  it("accepts real Interac email", () => {
    expect(isPaymentSender("Interac e-Transfer <notify@payments.interac.ca>", PAYMENT_SUBJECT, null, INTERAC_AUTH, "host@gmail.com")).toBe(true);
    // A DKIM signature from the parent domain also counts.
    const parentDkim = "mx.google.com; dkim=pass header.i=@interac.ca header.s=s1 header.b=x; spf=neutral";
    expect(isPaymentSender("<notify@payments.interac.ca>", PAYMENT_SUBJECT, null, parentDkim, "host@gmail.com")).toBe(true);
  });

  it("rejects Interac's address used as a display name", () => {
    expect(isPaymentSender('"notify@payments.interac.ca" <attacker@gmail.com>', PAYMENT_SUBJECT, null, ATTACKER_AUTH, "host@gmail.com")).toBe(
      false,
    );
    expect(isPaymentSender("notify@payments.interac.ca <attacker@gmail.com>", PAYMENT_SUBJECT, null, ATTACKER_AUTH, "host@gmail.com")).toBe(
      false,
    );
  });

  it("rejects a forged From address that fails authentication", () => {
    expect(isPaymentSender("Interac e-Transfer <notify@payments.interac.ca>", PAYMENT_SUBJECT, null, SPOOFED_AUTH, "host@gmail.com")).toBe(false);
    // No Authentication-Results means it didn't arrive from outside; never trusted for Interac.
    expect(isPaymentSender("Interac e-Transfer <notify@payments.interac.ca>", PAYMENT_SUBJECT, null, "", "host@gmail.com")).toBe(false);
    // A pass for some other domain doesn't count.
    expect(isPaymentSender("Interac e-Transfer <notify@payments.interac.ca>", PAYMENT_SUBJECT, null, ATTACKER_AUTH, "host@gmail.com")).toBe(false);
    // Look-alike domains don't count either.
    const lookalike = "mx.google.com; dkim=pass header.i=@evilinterac.ca; dmarc=pass header.from=payments.interac.ca.evil.com";
    expect(isPaymentSender("<notify@payments.interac.ca>", PAYMENT_SUBJECT, null, lookalike, "host@gmail.com")).toBe(false);
  });

  it("rejects someone faking the test sender while test mode is on", () => {
    expect(isPaymentSender('"me@gmail.com" <attacker@gmail.com>', TEST, "me@gmail.com", ATTACKER_AUTH, "host@gmail.com")).toBe(false);
    const forged = "mx.google.com; dmarc=fail (p=NONE) header.from=gmail.com";
    expect(isPaymentSender("Justin <me@gmail.com>", TEST, "me@gmail.com", forged, "host@gmail.com")).toBe(false);
  });
  it("parses the test email exactly like a real one", () => {
    // Same text sendTestEmail() produces.
    const body = `Hi,

JANE DOE has sent you $10.00 (CAD).

Message: VB-7K3Q

(Test email for Intro Hub.)`;
    expect(parseInteracEmail("TEST INTERAC e-Transfer: JANE DOE sent you money.", body)).toMatchObject({
      senderName: "JANE DOE",
      amountCents: 1000,
      memo: "VB-7K3Q",
    });
  });
});
