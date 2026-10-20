/**
 * Intro Hub: Interac e-Transfer forwarder (Google Apps Script)
 *
 * Runs inside the HOST's Google account. Every few minutes it looks for new
 * Interac e-Transfer notification emails in Gmail, pulls out the sender name,
 * amount and message, and POSTs them (HMAC-signed) to the Intro Hub app,
 * which matches them to sign-ups and confirms players automatically.
 * It also forwards "your transfer has been cancelled" / expired emails: the
 * app takes that payment back, puts the player back to unpaid (or releases the
 * spot if their "Hours to pay after signing up" are over) and alerts the hosts.
 *
 * Setup (see README "Payment auto-matching"):
 *   1. script.google.com -> New project -> paste this file.
 *   2. Project Settings -> Script properties:
 *        APP_URL        https://your-app.vercel.app
 *        INGEST_SECRET  same value as INGEST_SECRET in the app's env
 *   3. Run `setup` once and approve the Gmail permissions.
 *      It runs `ingestInteracPayments` every 5 minutes from then on.
 *   4. Run `testParseRecent` to check what the parser sees in your inbox.
 *
 * Test mode (optional, no bank needed):
 *   Add a Script property TEST_SENDER = the address you'll send fake emails
 *   from (e.g. you@gmail.com). Then an email FROM that address whose subject
 *   starts with "TEST INTERAC e-Transfer:" is treated like a real Interac
 *   notification. Everyday mail from that address is still ignored.
 *   Easiest: edit and run `sendTestEmail` below. Remove TEST_SENDER when done.
 *   Test payments are real to the app: use your own test sign-up's code.
 */

// Interac notification emails. Adjust if your bank sends from elsewhere.
var INTERAC_SENDER = 'notify@payments.interac.ca';
var TEST_SUBJECT = 'TEST INTERAC e-Transfer';

/** Gmail search for payment emails; also matches test emails when a test sender is set. */
function gmailQuery(testSender) {
  var real = 'from:(' + INTERAC_SENDER + ')';
  var test = testSender ? ' OR (from:(' + testSender + ') subject:"' + TEST_SUBJECT + '")' : '';
  return '(' + real + test + ') newer_than:3d';
}

// Only incoming money. Outgoing "your transfer to X was deposited" emails are ignored.
// Subjects seen: "X sent you money.", "X sent you $1.00. Claim your deposit!",
// "A money transfer from X has been automatically deposited.", and French.
var INCOMING_SUBJECT = /sent you (?:money|\$)|transfer from .+ (?:has been|was) (?:automatically )?deposited|vous a envoy/i;

// The sender took the money back before it was deposited, or it went unclaimed.
// The real email (Oct 2026) says only: "Your transfer of $14.00 has been
// cancelled. The recent transfer of $14.00 (CAD) sent to you on Oct 19, 2026
// has been cancelled. As a result, you can no longer deposit these funds."
// (no sender name or message). Other wordings are covered too.
var CANCELLED_SUBJECT = /cancell?ed|has expired|expired|annul|a expir/i;
var CANCELLED_BODY = /can no longer deposit|has been cancell?ed|has expired|ne pouvez plus d[ée]poser/i;
var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

var PROCESSED_KEY = 'processedMessageIds';
var MAX_REMEMBERED = 500;

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'ingestInteracPayments') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('ingestInteracPayments').timeBased().everyMinutes(5).create();
  ingestInteracPayments();
}

function ingestInteracPayments() {
  var props = PropertiesService.getScriptProperties();
  var appUrl = props.getProperty('APP_URL');
  var secret = props.getProperty('INGEST_SECRET');
  if (!appUrl || !secret) throw new Error('Set APP_URL and INGEST_SECRET in Script properties');

  var query = gmailQuery(props.getProperty('TEST_SENDER'));
  var me = Session.getEffectiveUser().getEmail();
  var processed = JSON.parse(props.getProperty(PROCESSED_KEY) || '[]');
  var seen = {};
  processed.forEach(function (id) { seen[id] = true; });

  var messages = [];
  GmailApp.search(query, 0, 50).forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var id = msg.getId();
      if (seen[id]) return;
      if (!isPaymentSender(msg.getFrom(), msg.getSubject(), props.getProperty('TEST_SENDER'), msg.getHeader('Authentication-Results'), me)) {
        console.warn('Ignored (sender not verified): ' + msg.getFrom() + ' / ' + msg.getSubject());
        seen[id] = true;
        processed.push(id);
        return;
      }
      var parsed = parseInteracEmail(msg.getSubject(), msg.getPlainBody());
      if (!parsed) {
        seen[id] = true; // not an incoming payment; don't look at it again
        processed.push(id);
        return;
      }
      messages.push({
        id: id,
        kind: parsed.kind,
        senderName: parsed.senderName,
        amountCents: parsed.amountCents,
        memo: parsed.memo,
        reference: parsed.reference,
        sentOn: parsed.sentOn,
        text: msg.getPlainBody().slice(0, 4000),
        receivedAt: msg.getDate().toISOString(),
      });
    });
  });

  if (messages.length > 0) {
    var payload = JSON.stringify({ messages: messages });
    var response = UrlFetchApp.fetch(appUrl.replace(/\/$/, '') + '/api/payments/ingest', {
      method: 'post',
      contentType: 'application/json; charset=utf-8',
      payload: payload,
      headers: { 'x-signature': hmacHex(payload, secret) },
      muteHttpExceptions: true,
    });
    var code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('Ingest failed (' + code + '): ' + response.getContentText());
    }
    console.log('Ingest: ' + response.getContentText());
    messages.forEach(function (m) { processed.push(m.id); });
  }

  props.setProperty(PROCESSED_KEY, JSON.stringify(processed.slice(-MAX_REMEMBERED)));
}

/**
 * Only real email from Interac, or (in test mode) the test sender with the test subject.
 *
 * Anyone can put "notify@payments.interac.ca" in their display name, so this
 * compares the actual address and requires Gmail's authentication result
 * (DMARC or DKIM pass for that address's domain): a forged sender can't pass.
 * `authResults` is the message's Authentication-Results header. Email sent from
 * this Gmail account to itself (sendTestEmail) has none, so in test mode it's
 * accepted only when it's from `ownAddress`, this account.
 * Gmail search matches whole threads, so each message is checked again here.
 */
function isPaymentSender(from, subject, testSender, authResults, ownAddress) {
  var address = addressOf(from);
  if (address === INTERAC_SENDER) return isAuthenticated(authResults, address);
  if (!testSender || address !== testSender.toLowerCase() || (subject || '').indexOf(TEST_SUBJECT) !== 0) return false;
  if (authResults) return isAuthenticated(authResults, address);
  return Boolean(ownAddress) && address === ownAddress.toLowerCase();
}

/** The bare address from a From header: `"Name" <a@b.c>` -> `a@b.c`. */
function addressOf(from) {
  var m = /<([^<>\s]+@[^<>\s]+)>\s*$/.exec(from || '');
  return (m ? m[1] : (from || '')).trim().toLowerCase();
}

/**
 * True when Gmail's Authentication-Results show DMARC pass for the address's
 * domain, or a DKIM pass signed by that domain or a parent of it (e.g. a
 * signature from interac.ca for payments.interac.ca).
 * e.g. "mx.google.com; dkim=pass header.i=@payments.interac.ca ...; dmarc=pass (p=REJECT) header.from=payments.interac.ca"
 */
function isAuthenticated(authResults, address) {
  var domain = address.split('@')[1] || '';
  if (!authResults || !domain) return false;
  return authResults.split(';').some(function (clause) {
    clause = clause.trim().toLowerCase();
    if (/^dmarc=pass\b/.test(clause)) {
      var from = /header\.from=([^\s;]+)/.exec(clause);
      return Boolean(from) && from[1] === domain;
    }
    if (/^dkim=pass\b/.test(clause)) {
      var signer = /header\.(?:i|d)=@?([^\s;]+)/.exec(clause);
      if (!signer) return false;
      var d = signer[1].replace(/^.*@/, '');
      return d.indexOf('.') !== -1 && (domain === d || domain.slice(-(d.length + 1)) === '.' + d);
    }
    return false;
  });
}

/**
 * Test mode helper: sends a fake Interac notification from this account to
 * itself. Edit the three values, run it, then wait for the 5-minute trigger
 * (or run ingestInteracPayments). Needs TEST_SENDER = this account's address.
 */
function sendTestEmail() {
  var senderName = 'JANE DOE';
  var amount = '10.00';
  var code = 'VB-XXXX'; // the ref code from your own test sign-up
  var me = Session.getActiveUser().getEmail();
  GmailApp.sendEmail(
    me,
    TEST_SUBJECT + ': ' + senderName + ' sent you money.',
    'Hi,\n\n' + senderName + ' has sent you $' + amount + ' (CAD).\n\nMessage: ' + code + '\n\n(Test email for Intro Hub.)',
  );
  console.log('Sent a test payment email to ' + me + '. It will be picked up on the next run.');
}

/**
 * Test mode helper: a fake "your transfer has been cancelled" email, worded
 * like the real one (it keeps the transfer's message). Use the amount and
 * code of a test payment sent today.
 */
function sendTestCancellation() {
  var amount = '10.00';
  var code = 'VB-XXXX'; // the ref code you paid with
  var me = Session.getActiveUser().getEmail();
  var today = Utilities.formatDate(new Date(), 'America/Toronto', 'MMM d, yyyy');
  GmailApp.sendEmail(
    me,
    TEST_SUBJECT + ': Your transfer of $' + amount + ' has been cancelled.',
    'Hi Intro 2 Volleyball,\n\nYour transfer of $' + amount + ' has been cancelled.\n\nThe recent transfer of $' + amount +
      ' (CAD) sent to you on ' + today + ' has been cancelled. As a result, you can no longer deposit these funds.\n\nMessage: ' + code + '\n\n(Test email for Intro Hub.)',
  );
  console.log('Sent a test cancellation email to ' + me + '. It will be picked up on the next run.');
}

/**
 * Logs, for recent Interac (and test) emails, whether the sender is verified
 * and what the parser extracts, without sending anything.
 */
function testParseRecent() {
  var testSender = PropertiesService.getScriptProperties().getProperty('TEST_SENDER');
  var me = Session.getEffectiveUser().getEmail();
  GmailApp.search(gmailQuery(testSender), 0, 10).forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var auth = msg.getHeader('Authentication-Results');
      if (!isPaymentSender(msg.getFrom(), msg.getSubject(), testSender, auth, me)) {
        console.log('IGNORED (sender not verified): ' + msg.getFrom() + ' / ' + msg.getSubject() + '\n  auth: ' + (auth || '(none)'));
        return;
      }
      console.log('VERIFIED: ' + msg.getSubject() + '\n  -> ' + JSON.stringify(parseInteracEmail(msg.getSubject(), msg.getPlainBody())));
    });
  });
}

/**
 * Extracts { kind, senderName, amountCents, memo, reference, sentOn } from an
 * Interac notification, or returns null if it's neither an incoming payment
 * nor a cancelled / expired one. kind is "received" or "cancelled". A
 * cancellation may name nobody and may not say the amount (null); sentOn is
 * the day the cancelled transfer was sent ("2026-10-19"), when it says.
 */
function parseInteracEmail(subject, body) {
  subject = subject || '';
  body = (body || '').replace(/\r/g, '');
  var incoming = INCOMING_SUBJECT.test(subject);
  var cancelled = !incoming && !/deposited/i.test(subject) && (CANCELLED_SUBJECT.test(subject) || CANCELLED_BODY.test(body));
  if (!incoming && !cancelled) return null;
  // Money the host sent and cancelled themselves isn't a player's payment.
  if (cancelled && /\btransfer to\b|virement à/i.test(subject)) return null;
  var text = subject + '\n' + body;

  var amountMatch = text.match(/\$\s?([\d,]+\.\d{2})/);
  if (!amountMatch && !cancelled) return null;
  var amountCents = amountMatch ? Math.round(parseFloat(amountMatch[1].replace(/,/g, '')) * 100) : null;

  var senderPatterns = cancelled
    ? [
        /^\s*Sent From:\s*(.+?)\s*$/im,
        /transfer from (.+?) (?:has been|was) cancell?ed/i,
        /transfer from (.+?) (?:has|had) expired/i,
        /e-Transfer\s*:\s*(.+?) (?:has )?cancell?ed/i,
        /virement de (.+?) a (?:expir|été annul)/i,
        /:\s*(.+?) a annul/i,
      ]
    : [
        /^\s*Sent From:\s*(.+?)\s*$/im,
        /transfer from (.+?) (?:has been|was) (?:automatically )?deposited/i,
        /e-Transfer\s*:\s*(.+?) sent you (?:money|\$)/i,
        /^\s*(?:Hi [^,\n]*,\s*)?([^\n]+?) has sent you \$/im,
        /:\s*(.+?) vous a envoy/i,
      ];
  var senderName = null;
  for (var i = 0; i < senderPatterns.length; i++) {
    var m = text.match(senderPatterns[i]);
    if (m) { senderName = m[1].trim(); break; }
  }
  // "Your transfer of $14.00 has been cancelled" names nobody.
  if (senderName && /^(?:your|the|a|an)\b|\$/i.test(senderName)) senderName = null;

  // "Message: ...", "Message from sender: ..." or "Message from JANE DOE: ...".
  var memoMatch = body.match(/^\s*Message(?: from [^:\n]*)?\s*:\s*(.*)$/im);
  var memo = memoMatch ? memoMatch[1].trim() || null : null;
  // No message line found, but the email mentions a ref code somewhere: use that.
  if (!memo) {
    var code = text.match(/\bVB-?[A-HJ-NP-Z2-9]{4}\b/i);
    if (code) memo = code[0].toUpperCase();
  }

  // Interac's own id for the transfer; the same on the payment and its cancellation.
  var refMatch = body.match(/^\s*(?:Reference Number|Reference #|Numéro de référence)\s*:?\s*([A-Za-z0-9]+)\s*$/im);
  var reference = refMatch ? refMatch[1] : null;

  // When the cancelled transfer was sent: "sent to you on Oct 19, 2026" -> "2026-10-19".
  var sentOn = null;
  if (cancelled) {
    var on = text.match(/sent to you on\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i);
    var month = on ? MONTHS[on[1].toLowerCase()] : null;
    if (month) sentOn = on[3] + '-' + ('0' + month).slice(-2) + '-' + ('0' + on[2]).slice(-2);
  }

  return {
    kind: cancelled ? 'cancelled' : 'received',
    senderName: senderName,
    amountCents: amountCents,
    memo: memo,
    reference: reference,
    sentOn: sentOn,
  };
}

function hmacHex(value, secret) {
  var bytes = Utilities.computeHmacSha256Signature(value, secret, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
