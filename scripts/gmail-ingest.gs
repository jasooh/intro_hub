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
 */

// Interac notification emails. Adjust if your bank sends from elsewhere.
var GMAIL_QUERY = 'from:(notify@payments.interac.ca) newer_than:3d';

// Only incoming money. Outgoing "your transfer to X was deposited" emails are ignored.
var INCOMING_SUBJECT = /sent you money|transfer from .+ (?:has been|was) (?:automatically )?deposited|vous a envoy/i;

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

  var processed = JSON.parse(props.getProperty(PROCESSED_KEY) || '[]');
  var seen = {};
  processed.forEach(function (id) { seen[id] = true; });

  var messages = [];
  GmailApp.search(GMAIL_QUERY, 0, 50).forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var id = msg.getId();
      if (seen[id]) return;
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

/** Logs what the parser extracts from recent Interac emails, without sending anything. */
function testParseRecent() {
  GmailApp.search(GMAIL_QUERY, 0, 10).forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      console.log(msg.getSubject() + '\n  -> ' + JSON.stringify(parseInteracEmail(msg.getSubject(), msg.getPlainBody())));
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
    /e-Transfer\s*:\s*(.+?) sent you money/i,
    /^\s*(?:Hi [^,\n]*,\s*)?([^\n]+?) has sent you \$/im,
    /:\s*(.+?) vous a envoy/i,
  ];
  var senderName = null;
  for (var i = 0; i < senderPatterns.length; i++) {
    var m = text.match(senderPatterns[i]);
    if (m) { senderName = m[1].trim(); break; }
  }

  var memoMatch = body.match(/^\s*Message(?: from sender)?\s*:\s*(.*)$/im);
  var memo = memoMatch ? memoMatch[1].trim() || null : null;

  return { senderName: senderName, amountCents: amountCents, memo: memo };
}

function hmacHex(value, secret) {
  var bytes = Utilities.computeHmacSha256Signature(value, secret, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
