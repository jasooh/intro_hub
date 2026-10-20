import { render } from "@react-email/components";
import { beforeEach, describe, expect, it } from "vitest";
import { buildHostAlertEmail, buildHostDigestEmail, buildSessionDayEmail } from "@/lib/email/templates";
import { digestDue, digestSince, localParts, sessionDayDue } from "@/lib/host-schedule";
import { asService, asUser, createDb, createSession, createUser, type Db } from "./db-harness";

const TZ = "America/Toronto";
// 2026-10-24 is EDT (UTC-4): local hour = UTC hour - 4.
const at = (localHour: number, day = 24) => new Date(Date.UTC(2026, 9, day, localHour + 4, 0, 0));

describe("when host emails are due", () => {
  it("reads local day and hour in the club's time zone", () => {
    expect(localParts(at(23), TZ)).toEqual({ day: "2026-10-24", hour: 23 });
  });

  it("3-hourly: first one any time it's not night, then every 3 hours, never overnight", () => {
    expect(digestDue("3h", null, at(12), TZ)).toBe(true);
    expect(digestDue("3h", at(12), at(14), TZ)).toBe(false);
    expect(digestDue("3h", at(12), at(15), TZ)).toBe(true);
    expect(digestDue("3h", at(18), at(23), TZ)).toBe(false); // 11pm: held
    expect(digestDue("3h", at(18), at(6, 25), TZ)).toBe(false); // 6am: held
    expect(digestDue("3h", at(18), at(7, 25), TZ)).toBe(true);
    expect(digestDue("off", null, at(12), TZ)).toBe(false);
  });

  it("daily: once a day from 8am", () => {
    expect(digestDue("daily", null, at(7), TZ)).toBe(false);
    expect(digestDue("daily", null, at(8), TZ)).toBe(true);
    expect(digestDue("daily", at(8), at(20), TZ)).toBe(false);
    expect(digestDue("daily", at(8), at(8, 25), TZ)).toBe(true);
  });

  it("the first digest covers the last period", () => {
    expect(digestSince("3h", null, at(12)).getTime()).toBe(at(9).getTime());
    expect(digestSince("daily", at(8), at(8, 25))).toEqual(at(8));
  });

  it("session day: from 9am on the day, until the start", () => {
    const start = at(20);
    expect(sessionDayDue(start, at(8), TZ)).toBe(false);
    expect(sessionDayDue(start, at(9), TZ)).toBe(true);
    expect(sessionDayDue(start, at(21), TZ)).toBe(false);
    expect(sessionDayDue(start, at(12, 23), TZ)).toBe(false); // the day before
  });
});

describe("host_activity log", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb();
  });
  const kinds = async () =>
    (await db.query<{ kind: string; late: boolean }>(`select kind, late from public.host_activity order by id`)).rows;

  it("records joins, waitlist, moving up, payments and cancellations", async () => {
    const sid = await createSession(db, { capacity: 1 });
    const host = await createUser(db, "Host", { admin: true });
    const [a, b] = [await createUser(db, "A"), await createUser(db, "B")];
    await asUser(db, a, `select public.register_for_session($1)`, [sid]);
    await asUser(db, b, `select public.register_for_session($1)`, [sid]);
    const regA = (await db.query<{ id: string }>(`select id from public.registrations where profile_id = $1`, [a])).rows[0].id;
    const regB = (await db.query<{ id: string }>(`select id from public.registrations where profile_id = $1`, [b])).rows[0].id;
    await asUser(db, a, `select public.cancel_registration($1)`, [regA]);
    await asUser(db, host, `select public.admin_mark_paid($1)`, [regB]);
    expect((await kinds()).map((k) => k.kind)).toEqual(["joined", "waitlisted", "cancelled", "promoted", "paid"]);
    expect((await kinds()).every((k) => !k.late)).toBe(true); // session is 3 days away
  });

  it("flags cancellations within 24 hours of the start", async () => {
    const sid = await createSession(db, { startsInHours: 5 });
    const a = await createUser(db, "A");
    await asUser(db, a, `select public.register_for_session($1)`, [sid]);
    const reg = (await db.query<{ id: string }>(`select id from public.registrations where profile_id = $1`, [a])).rows[0].id;
    await asUser(db, a, `select public.cancel_registration($1)`, [reg]);
    expect((await kinds()).at(-1)).toEqual({ kind: "cancelled", late: true });
  });

  it("records e-Transfers that arrive without a sign-up, and is hosts-only to read", async () => {
    const host = await createUser(db, "Host", { admin: true });
    const a = await createUser(db, "A");
    await asService(db, `insert into public.payments (gmail_message_id, sender_name, amount_cents) values ('m1', 'M CHEN', 1500)`);
    expect((await kinds()).map((k) => k.kind)).toEqual(["unmatched_payment"]);
    expect((await asUser(db, host, `select id from public.host_activity`)).rows).toHaveLength(1);
    expect((await asUser(db, a, `select id from public.host_activity`)).rows).toHaveLength(0);
  });
});

describe("host email templates", () => {
  const settingsUrl = "https://example.com/me#host-notifications";

  it("digest lists each session's changes and the unpaid total", async () => {
    const { subject, element } = buildHostDigestEmail({
      hostName: "Sam",
      since: "since 3:00 p.m.",
      sessions: [
        {
          title: "Intro 2 Volleyball",
          when: "Sat, Oct 24, 8:00 p.m.",
          url: "https://example.com/admin/sessions/1",
          status: "16/18 drop-in · 3 waiting",
          lines: [
            { label: "Joined", names: ["Maya T.", "Leo F."] },
            { label: "Cancelled late", names: ["Chris P."] },
          ],
          unpaid: "2 · $25.00",
        },
      ],
      unmatched: 1,
      paymentsUrl: "https://example.com/admin/payments",
      settingsUrl,
    });
    expect(subject).toBe("Host update: 3 changes since 3:00 p.m.");
    const text = await render(element, { plainText: true });
    for (const bit of ["Maya T., Leo F.", "Cancelled late", "Still unpaid: 2 · $25.00", "1 e-Transfer", "Change host emails"]) {
      expect(text).toContain(bit);
    }
  });

  it("session-day email has the roster, the waitlist and what's owed", async () => {
    const { element } = buildSessionDayEmail({
      hostName: "Sam",
      sessionTitle: "Intro 2 Volleyball",
      when: "Sat, Oct 24, 8:00 p.m.",
      location: "Aaniin",
      status: "18/18 drop-in",
      roster: [{ name: "Maya T.", detail: "owes $15.00 · first time" }],
      instructional: [{ name: "Zara A.", detail: null }],
      waitlist: ["Isabel R."],
      owed: "1 · $15.00",
      notes: "Gym 2",
      adminUrl: "https://example.com/admin/sessions/1",
      settingsUrl,
    });
    const text = await render(element, { plainText: true });
    for (const bit of ["Maya T.", "owes $15.00", "Zara A.", "Isabel R.", "Still unpaid: 1 · $15.00", "Gym 2"]) {
      expect(text).toContain(bit);
    }
  });

  it("alerts say what happened and link to it", async () => {
    const { subject, element } = buildHostAlertEmail({
      title: "Late cancellation",
      subject: "Late cancel: Chris P.",
      hostName: "Sam",
      lines: ["Chris P. cancelled about 3 hours before it starts."],
      buttonLabel: "Open the session",
      buttonUrl: "https://example.com/admin/sessions/1",
      settingsUrl,
    });
    expect(subject).toBe("Late cancel: Chris P.");
    expect(await render(element)).toContain("https://example.com/admin/sessions/1");
  });
});
