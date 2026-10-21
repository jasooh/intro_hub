import Link from "next/link";
import { blockPlayer, deleteAccount, setPlayerRating, setRole, unblockPlayer, updateEtransferNames } from "@/app/admin/actions";
import { SkillRating } from "@/components/skill-rating";
import { PlayerDetails } from "@/components/player-details";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, inputClass, Mark } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { Profile } from "@/lib/types";

export type PlayerStats = {
  played: number;
  upcoming: number;
  lastPlayed: string | null;
  memberSince: string;
  /** Still owed across their sign-ups (see /admin/owed). */
  owedCents: number;
};

/** A compact player row; the name opens the details modal with host actions. */
export function PlayerRow({
  p,
  stats,
  complete,
  isMe,
  rating,
  block,
}: {
  p: Profile;
  stats: PlayerStats;
  complete: boolean;
  isMe: boolean;
  /** Host's 1–5 skill rating, if set. */
  rating: number | null;
  /** Set when hosts blocked them from signing up. */
  block: { reason: string | null; at: string } | null;
}) {
  const name = p.display_name ?? p.full_name ?? p.email;
  const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ");

  const actions = (
    <div className="space-y-4">
      <form action={updateEtransferNames.bind(null, p.id)} className="flex items-end gap-3">
        <label className="block flex-1 space-y-1">
          <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">e-Transfer names</span>
          <input
            name="etransfer_names"
            defaultValue={p.etransfer_names.join(", ")}
            placeholder="Names their e-Transfers come from, comma separated"
            className={`${inputClass} text-base`}
          />
        </label>
        <SubmitButton size="sm" variant="secondary" requireChange>
          Save
        </SubmitButton>
      </form>
      {!isMe && p.role !== "admin" && (
        block ? (
          <div className="space-y-2 border-l-4 border-bad pl-3">
            <p className="text-sm">
              <b className="text-bad">Blocked from signing up</b> since {block.at.slice(0, 10)}
              {block.reason && <span className="block text-ink-soft [overflow-wrap:anywhere]">Why: {block.reason}</span>}
            </p>
            <form action={unblockPlayer.bind(null, p.id)}>
              <SubmitButton size="sm" variant="secondary">
                Unblock
              </SubmitButton>
            </form>
          </div>
        ) : (
          <form action={blockPlayer.bind(null, p.id)} className="flex items-end gap-3">
            <label className="block flex-1 space-y-1">
              <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">Block from signing up</span>
              <input name="reason" maxLength={500} placeholder="Why (only hosts see this)" className={`${inputClass} text-base`} />
            </label>
            <SubmitButton
              size="sm"
              variant="danger"
              confirm={{
                title: `Block ${name}?`,
                description:
                  "They won't be able to sign up for sessions and are told to contact the hosts. Sign-ups they already have stay: remove those from the session roster if needed. You can unblock them any time.",
                action: "Block",
              }}
            >
              Block
            </SubmitButton>
          </form>
        )
      )}
      {!isMe && (
        <div className="flex flex-wrap gap-3">
        <form action={setRole.bind(null, p.id, p.role === "admin" ? "player" : "admin")}>
          <SubmitButton
            size="sm"
            variant={p.role === "admin" ? "danger" : "secondary"}
            confirm={
              p.role === "admin"
                ? { title: `Remove ${name} as a host?`, description: "They'll lose access to the admin dashboard." }
                : {
                    title: `Make ${name} a host?`,
                    description: "They'll get full access to the admin dashboard: sessions, payments, refunds and players.",
                  }
            }
          >
            {p.role === "admin" ? "Remove host" : "Make host"}
          </SubmitButton>
        </form>
        {p.role !== "admin" && (
          <form action={deleteAccount.bind(null, p.id)}>
            <SubmitButton
              size="sm"
              variant="danger"
              confirm={{
                title: `Delete ${name}'s account?`,
                description:
                  "This removes their sign-in, profile and all their sign-ups, and can't be undone. Any spot they hold goes to the waitlist. Their payment records stay, unlinked. They could still sign in again with Google as a new player.",
                action: "Delete account",
              }}
            >
              Delete account
            </SubmitButton>
          </form>
        )}
        </div>
      )}
    </div>
  );

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <Avatar name={name} src={p.avatar_url} size={36} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate">
          <PlayerDetails
            data={{ profile: p, history: stats }}
            actions={actions}
            rating={<SkillRating action={setPlayerRating.bind(null, p.id, "/admin/players")} rating={rating} skill={p.skill_level} />}
          >
            {name}
          </PlayerDetails>
          {fullName && fullName !== name && <span className="text-ink-soft"> · {fullName}</span>}
        </p>
        <p className="truncate text-sm text-ink-soft">
          {p.email}
          {p.phone && ` · ${p.phone}`}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {p.role === "admin" && (
            <Mark tone="line" glyph="★">
              Host
            </Mark>
          )}
          {block && (
            <Mark tone="bad" glyph="⊘">
              Blocked
            </Mark>
          )}
          {!complete && (
            <Mark tone="warn" glyph="!">
              Profile incomplete
            </Mark>
          )}
          {stats.played === 0 && complete && (
            <Mark tone="mat" glyph="○">
              New
            </Mark>
          )}
          {p.media_consent === false && (
            <Mark tone="bad" glyph="✕">
              No photos
            </Mark>
          )}
          {stats.owedCents > 0 && (
            <Link
              href={`/admin/owed?q=${encodeURIComponent(p.email)}`}
              className="underline decoration-warn decoration-2 underline-offset-4"
            >
              <Mark tone="warn" glyph="$">
                Owes {formatMoney(stats.owedCents)}
              </Mark>
            </Link>
          )}
        </div>
      </div>
      <div className="text-right">
        <p className="font-score text-2xl leading-none font-black">{stats.played}</p>
        <p className="font-display text-xs font-bold tracking-[0.15em] text-ink-soft uppercase">
          {stats.played === 1 ? "session" : "sessions"}
        </p>
        <p className="text-xs text-ink-soft">{stats.lastPlayed ? `last ${stats.lastPlayed}` : "never played"}</p>
      </div>
    </li>
  );
}
