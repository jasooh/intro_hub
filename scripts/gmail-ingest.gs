/**
 * Intro Hub: Interac e-Transfer forwarder (Google Apps Script)
 *
 * Runs inside the HOST's Google account. Every few minutes it looks for new
 * Interac e-Transfer notification emails in Gmail, pulls out the sender name,
 * amount and message, and POSTs them (HMAC-signed) to the Intro Hub app,
 * which matches them to sign-ups and confirms players automatically.
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
        senderName: parsed.senderName,
        amountCents: parsed.amountCents,
        memo: parsed.memo,
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
 * Extracts { senderName, amountCents, memo } from an Interac notification,
 * or returns null if it isn't an incoming payment.
 */
function parseInteracEmail(subject, body) {
  subject = subject || '';
  body = (body || '').replace(/\r/g, '');
  if (!INCOMING_SUBJECT.test(subject)) return null;
  var text = subject + '\n' + body;

  var amountMatch = text.match(/\$\s?([\d,]+\.\d{2})/);
  if (!amountMatch) return null;
  var amountCents = Math.round(parseFloat(amountMatch[1].replace(/,/g, '')) * 100);

  var senderPatterns = [
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

  // "Message: ...", "Message from sender: ..." or "Message from JANE DOE: ...".
  var memoMatch = body.match(/^\s*Message(?: from [^:\n]*)?\s*:\s*(.*)$/im);
  var memo = memoMatch ? memoMatch[1].trim() || null : null;
  // No message line found, but the email mentions a ref code somewhere: use that.
  if (!memo) {
    var code = text.match(/\bVB-?[A-HJ-NP-Z2-9]{4}\b/i);
    if (code) memo = code[0].toUpperCase();
  }

  return { senderName: senderName, amountCents: amountCents, memo: memo };
}

function hmacHex(value, secret) {
  var bytes = Utilities.computeHmacSha256Signature(value, secret, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
