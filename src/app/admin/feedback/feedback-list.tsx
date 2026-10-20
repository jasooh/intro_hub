import { CheckToggle } from "@/components/check-toggle";
import { EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { setFeedbackHandled } from "./actions";

export type FeedbackRow = {
  id: string;
  message: string;
  name: string | null;
  email: string | null;
  created_at: string;
  handled_at: string | null;
  profile: { display_name: string | null; email: string } | null;
};

/** Contact-page feedback as ruled rows, newest first, each with a Handled checkbox. */
export function FeedbackList({ rows, empty }: { rows: FeedbackRow[]; empty: string }) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className="divide-y divide-ink/20">
      {rows.map((f) => {
        const handled = f.handled_at !== null;
        const anonymous = !f.name && !f.email && !f.profile;
        return (
          <li key={f.id} className="flex items-start gap-4 py-4">
            <form action={setFeedbackHandled.bind(null, f.id, !handled)} className="pt-0.5">
              <CheckToggle checked={handled} label={handled ? "Move back to New" : "Mark as handled"} />
            </form>
            <div className={`min-w-0 flex-1 space-y-1.5 ${handled ? "text-ink-soft" : ""}`}>
              <p className="text-sm text-ink-soft">
                <span className="font-display font-bold tracking-wide text-ink uppercase">{formatDateTime(f.created_at)}</span>
                {" · "}
                {anonymous ? (
                  <span className="italic">Anonymous</span>
                ) : (
                  <span className="[overflow-wrap:anywhere]">
                    {[f.name, f.email].filter(Boolean).join(" · ")}
                    {f.profile && (
                      <>
                        {f.name || f.email ? " · " : ""}
                        account {f.profile.display_name ?? f.profile.email}
                      </>
                    )}
                  </span>
                )}
                {f.handled_at && <> · handled {formatDateTime(f.handled_at)}</>}
              </p>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{f.message}</p>
              {f.email && (
                <a
                  href={`mailto:${f.email}?subject=${encodeURIComponent("Re: your Intro 2 Volleyball feedback")}`}
                  className="inline-block font-display text-sm font-bold tracking-wide text-mat uppercase underline underline-offset-2"
                >
                  Reply by email
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
