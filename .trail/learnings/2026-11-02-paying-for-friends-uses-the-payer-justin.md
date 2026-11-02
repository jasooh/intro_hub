---
title: "Paying for friends uses the payer's own code for one transfer, not several codes in the message"
author: Justin
date: 2026-11-02
branch: dev
cost: { minutes: 1, tokens: 1162 }
id: l-12a99b94
scope: repo
status: active
src: agent
touches:
  - docs/superpowers/specs/2026-11-02-pay-for-friends-design.md
---

## Decided
- A player pays for friends in the same session with one e-Transfer and their own VB- code. They pick friends' unpaid sign-ups first; the site splits the money payer first, then friends.
- Any unpaid sign-up in the same session can be covered, with no consent step. The friend gets a one-time pop-up (like the no-show one) and can choose "I'll pay myself".
- No new group code: the payer's existing code covers the group.

## Tried and ruled out
- Typing several VB- codes in one message: players would have to collect and type each code, and a typo or wrong total lands on the host.
- Asking the friend to agree first: extra steps for little gain.
- Covering sign-ups in other sessions: out of scope.

## Watch out
- Matching by code ignores the sender, so a separate transfer with the friend's own code also pays for them.
- In the code: the spec is docs/superpowers/specs/2026-11-02-pay-for-friends-design.md. Planned columns are registrations.covered_by (sign-up to sign-up, keeping one FK to profiles), registrations.covered_seen and payments.split_from.
