/**
 * Sends a fake Interac e-Transfer to the local app, signed the same way
 * scripts/gmail-ingest.gs signs real ones, so payment matching can be tested
 * on dev without real emails.
 *
 *   npm run test-payment -- VB-7KQ2 15
 *   npm run test-payment -- 15 "Jane Doe"            (no ref: match by name + amount)
 *   npm run test-payment -- VB-7KQ2 10 "Jane Doe"    (partial payment)
 *
 * Arguments can go in any order: a VB-XXXX ref code (the message), an amount
 * in dollars, and the sender's name. Posts to http://localhost:3000 (start
 * `npm run dev` first) using INGEST_SECRET from .env.local. Pass
 * --url=https://... to post somewhere else.
 */
import { createHmac } from "node:crypto";

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith("--url="));
const rest = args.filter((a) => a !== urlArg);

const ref = rest.find((a) => /^VB-[A-Z0-9]{4}$/i.test(a));
const amount = rest.find((a) => a !== ref && /^\$?\d+(\.\d{1,2})?$/.test(a));
const name = rest.filter((a) => a !== ref && a !== amount).join(" ") || null;

if (!amount) {
  console.error('Usage: npm run test-payment -- [VB-XXXX] <amount> ["Sender Name"] [--url=...]');
  process.exit(1);
}
const secret = process.env.INGEST_SECRET;
if (!secret) {
  console.error("INGEST_SECRET isn't set in .env.local");
  process.exit(1);
}

const baseUrl = (urlArg ? urlArg.slice("--url=".length) : "http://localhost:3000").replace(/\/$/, "");
const amountCents = Math.round(Number(amount.replace("$", "")) * 100);
const message = {
  id: `test-${Date.now()}`, // stands in for the Gmail message id, so every run is a new payment
  senderName: name ? name.toUpperCase() : null, // Interac sends names in caps
  amountCents,
  memo: ref ? ref.toUpperCase() : null,
  text: null,
  receivedAt: new Date().toISOString(),
};

const payload = JSON.stringify({ messages: [message] });
const signature = createHmac("sha256", secret).update(payload).digest("hex");

console.log(
  `Sending $${(amountCents / 100).toFixed(2)} from ${message.senderName ?? "(no name)"}, message ${message.memo ?? "(none)"} -> ${baseUrl}`,
);
let res;
try {
  res = await fetch(`${baseUrl}/api/payments/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", "x-signature": signature },
    body: payload,
  });
} catch {
  console.error(`Couldn't reach ${baseUrl}. Is \`npm run dev\` running?`);
  process.exit(1);
}

const body = await res.json().catch(() => null);
if (!res.ok) {
  console.error(`Failed (${res.status}):`, body?.error ?? body);
  process.exit(1);
}
console.log(
  body.matched
    ? "Matched. Check the sign-up (confirmed, or partial if it was short) and Admin -> Payments."
    : "Not matched. It's in Admin -> Payments under Needs attention, with the reason.",
);
