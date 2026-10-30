import { SubmitButton } from "@/components/submit-button";
import { Avatar, cn, inputClass } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { MESSAGE_MAX } from "@/lib/message-errors";
import type { MessageView } from "@/lib/message-data";

/** A conversation as ruled rows, oldest first. Host messages carry a blue (mat) rule and a "Host" tag. */
export function MessageThread({ messages }: { messages: MessageView[] }) {
  return (
    <ol className="divide-y divide-ink/20 border-y-2 border-ink">
      {messages.map((m) => (
        <li key={m.id} className={cn("flex gap-3 py-4 pl-3", m.from_host ? "border-l-4 border-mat" : "border-l-4 border-transparent")}>
          <Avatar name={m.authorName} src={m.authorAvatar} size={36} />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-display text-base font-bold tracking-wide uppercase [overflow-wrap:anywhere]">{m.authorName}</span>
              {m.from_host && <span className="font-display text-xs font-bold tracking-[0.15em] text-mat uppercase">Host</span>}
              <time dateTime={m.created_at} className="text-ink-soft">
                {formatDateTime(m.created_at)}
              </time>
            </p>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The reply box under a conversation. `action` is the reply server action bound to the thread. */
export function ReplyForm({ action, placeholder = "Write a reply…" }: { action: (formData: FormData) => Promise<void>; placeholder?: string }) {
  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1">
        <span className="font-display text-sm font-bold tracking-[0.15em] uppercase">Reply</span>
        <textarea
          name="body"
          required
          rows={4}
          maxLength={MESSAGE_MAX}
          placeholder={placeholder}
          className={cn(inputClass, "resize-y")}
        />
      </label>
      <SubmitButton>Send reply</SubmitButton>
    </form>
  );
}
