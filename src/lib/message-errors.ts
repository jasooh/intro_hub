/** Plain-English versions of the errors the message functions raise. */
export const MESSAGE_ERRORS: Record<string, string> = {
  empty_message: "Write a subject and a message first.",
  message_too_long: "That message is too long (4000 characters at most, subjects 120).",
  rate_limited: "You've sent a lot of messages. Please wait a bit and try again.",
  profile_incomplete: "Finish your profile before messaging the hosts.",
  no_recipients: "Pick at least one person to message.",
  not_found: "That conversation doesn't exist anymore.",
  forbidden: "You can't do that.",
};

export function messageError(message: string): string {
  return Object.entries(MESSAGE_ERRORS).find(([k]) => message.includes(k))?.[1] ?? message;
}

export const MESSAGE_MAX = 4000;
export const SUBJECT_MAX = 120;
