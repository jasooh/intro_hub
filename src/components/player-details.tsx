"use client";

import type { ReactNode } from "react";
import { OptionMark } from "@/components/option-mark";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, Mark } from "@/components/ui";
import { SkillBadge } from "@/components/skill-rank";
import { HEARD_LABELS, OPTION_LABELS } from "@/lib/profile";
import type { Profile, Registration } from "@/lib/types";

export type PlayerDetailsData = {
  profile: Pick<
    Profile,
    | "display_name"
    | "full_name"
    | "first_name"
    | "last_name"
    | "email"
    | "phone"
    | "emergency_name"
    | "emergency_phone"
    | "avatar_url"
    | "skill_level"
    | "attended_before"
    | "learning_goals"
    | "hype_song"
    | "heard_about"
    | "heard_about_other"
    | "media_consent"
    | "waiver_accepted_at"
  >;
  /** Present when opened from a session roster. */
  registration?: Pick<Registration, "option" | "amount_cents" | "ref_code" | "note" | "status">;
  /** Pre-formatted on the server (timezone-aware). */
  paid?: string | null;
  teamName?: string | null;
  /** Players they asked to be teamed with. */
  teammates?: string[];
  /** Present when opened from the Players page. lastPlayed is pre-formatted. */
  history?: { played: number; upcoming: number; lastPlayed: string | null; memberSince: string; owedCents?: number };
};

/** The player's name; clicking it opens everything they told the host, plus optional host actions. */
export function PlayerDetails({
  data,
  actions,
  rating,
  children,
}: {
  data: PlayerDetailsData;
  actions?: ReactNode;
  /** Host's 1–5 skill rating picker (hosts only; players never see it). */
  rating?: ReactNode;
  children: ReactNode;
}) {
  const p = data.profile;
  const r = data.registration;
  const name = p.display_name ?? p.full_name ?? p.email;
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ");
  const heard = p.heard_about === "other" ? `Other: ${p.heard_about_other ?? "—"}` : p.heard_about ? HEARD_LABELS[p.heard_about] : null;

  return (
    <Dialog>
      <DialogTrigger className="-my-1.5 py-1.5 text-left font-semibold decoration-line decoration-2 underline-offset-4 hover:underline">
        {children}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-2 bg-[#f7ecd6] shadow-[6px_6px_0_var(--ink)] sm:max-w-lg">
        <DialogHeader className="flex-row items-center gap-4 text-left">
          <Avatar name={name} src={p.avatar_url} size={56} />
          <div className="min-w-0">
            <DialogTitle className="truncate font-display text-3xl leading-none font-black uppercase">{name}</DialogTitle>
            <DialogDescription className="truncate text-base text-ink-soft">{fullName || p.email}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {r && <OptionMark option={r.option} />}
          {p.attended_before === false && (
            <Mark tone="line" glyph="★">
              First time
            </Mark>
          )}
          {p.media_consent === false && (
            <Mark tone="bad" glyph="✕">
              No photos
            </Mark>
          )}
          {data.teamName && (
            <Mark tone="ok" glyph="●">
              {data.teamName}
            </Mark>
          )}
        </div>

        {r?.note && (
          <Section title="Note to the host">
            <p className="border-l-4 border-line pl-3 text-lg whitespace-pre-line">{r.note}</p>
          </Section>
        )}

        {data.teammates && data.teammates.length > 0 && (
          <Section title="Team request">
            <Rows>
              <Row label="Wants to play with">{data.teammates.join(", ")}</Row>
            </Rows>
          </Section>
        )}

        <Section title="Contact">
          <Rows>
            <Row label="Email">
              <a href={`mailto:${p.email}`} className="text-mat underline underline-offset-2">
                {p.email}
              </a>
            </Row>
            <Row label="Phone">
              {p.phone ? (
                <a href={`tel:${p.phone}`} className="text-mat underline underline-offset-2">
                  {p.phone}
                </a>
              ) : null}
            </Row>
            <Row label="Emergency">
              {p.emergency_name || p.emergency_phone ? (
                <>
                  {p.emergency_name}
                  {p.emergency_phone && (
                    <>
                      {" · "}
                      <a href={`tel:${p.emergency_phone}`} className="text-mat underline underline-offset-2">
                        {p.emergency_phone}
                      </a>
                    </>
                  )}
                </>
              ) : null}
            </Row>
          </Rows>
        </Section>

        {data.history && (
          <Section title="History">
            <Rows>
              <Row label="Played">{`${data.history.played} session${data.history.played === 1 ? "" : "s"}`}</Row>
              <Row label="Last played">{data.history.lastPlayed}</Row>
              <Row label="Signed up for">{data.history.upcoming ? `${data.history.upcoming} upcoming` : null}</Row>
              <Row label="Member since">{data.history.memberSince}</Row>
              <Row label="Owes">
                {data.history.owedCents ? (
                  <a
                    href={`/admin/owed?q=${encodeURIComponent(p.email)}`}
                    className="font-score font-black text-warn underline decoration-2 underline-offset-4"
                  >
                    ${(data.history.owedCents / 100).toFixed(2)}
                  </a>
                ) : null}
              </Row>
            </Rows>
          </Section>
        )}

        {r && (
        <Section title="This session">
          <Rows>
            <Row label="Option">{OPTION_LABELS[r.option]}</Row>
            <Row label="Owes">
              <span className="font-score font-black">${(r.amount_cents / 100).toFixed(2)}</span>
            </Row>
            <Row label="Ref code">
              <span className="font-score font-black">{r.ref_code}</span>
            </Row>
            <Row label="Paid">{data.paid}</Row>
          </Rows>
        </Section>
        )}

        <Section title="About them">
          <Rows>
            <Row label="Their pick">{p.skill_level ? <SkillBadge value={p.skill_level} /> : null}</Row>
            {rating && (
              <Row label="Host rating">
                {rating}
                <span className="mt-1 block text-sm text-ink-soft">Used for team balancing. Players never see it.</span>
              </Row>
            )}
            <Row label="Attended before">{p.attended_before == null ? null : p.attended_before ? "Yes" : "No, first time"}</Row>
            <Row label="Wants to learn">{p.learning_goals}</Row>
            <Row label="Hype song">{p.hype_song}</Row>
            <Row label="Heard via">{heard}</Row>
          </Rows>
        </Section>

        <Section title="Agreements">
          <Rows>
            <Row label="Media release">
              {p.media_consent == null ? null : p.media_consent ? "Agreed" : <b className="text-bad">Declined: keep out of photos</b>}
            </Row>
            <Row label="Waiver">{p.waiver_accepted_at ? `Accepted ${p.waiver_accepted_at.slice(0, 10)}` : null}</Row>
          </Rows>
        </Section>
        {actions && <Section title="Manage">{actions}</Section>}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t-2 border-ink pt-3">
      <h3 className="font-display text-sm font-bold tracking-[0.2em] text-ink-soft uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-4 [overflow-wrap:anywhere] gap-y-1.5">{children}</dl>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-display font-bold tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className="min-w-0 break-words">{children ?? <span className="text-ink-soft">—</span>}</dd>
    </>
  );
}
