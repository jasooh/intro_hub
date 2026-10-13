import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Load the Apps Script's pure parser without the Google globals.
const source = readFileSync(join(__dirname, "..", "scripts", "gmail-ingest.gs"), "utf8");
const { parseInteracEmail } = new Function(`${source}; return { parseInteracEmail };`)() as {
  parseInteracEmail: (subject: string, body: string) => { senderName: string | null; amountCents: number; memo: string | null } | null;
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
