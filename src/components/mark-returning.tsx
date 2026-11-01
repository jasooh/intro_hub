import { SubmitButton } from "@/components/submit-button";

/** Host button under "Attended before": they've seen this player, so they're no longer a first-timer. */
export function MarkReturning({ action, name }: { action: () => Promise<void>; name: string }) {
  return (
    <form action={action} className="mt-2 space-y-1">
      <SubmitButton
        size="sm"
        variant="secondary"
        confirm={{
          title: `Mark ${name} as returning?`,
          description: "Use this if you've seen them before. They lose the First time mark and can't use the Bring a Friend rate.",
          action: "Mark returning",
        }}
      >
        I&apos;ve seen them before
      </SubmitButton>
    </form>
  );
}
