import { FormGroup as Group } from "@/components/ui";

export type HostChoices = { options: { id: string; name: string }[]; selected: string[] };

/** "Hosted by" boxes on the session and weekly-schedule forms: posts `host_id` for each ticked host. */
export function HostPicker({ choices, hint }: { choices: HostChoices; hint: string }) {
  if (choices.options.length === 0) return null;
  return (
    <Group title="Hosted by" hint={hint}>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {choices.options.map((h) => (
          <label key={h.id} className="flex items-center gap-3">
            <input
              type="checkbox"
              name="host_id"
              value={h.id}
              defaultChecked={choices.selected.includes(h.id)}
              className="size-5 shrink-0 accent-[var(--line)]"
            />
            <span className="[overflow-wrap:anywhere]">{h.name}</span>
          </label>
        ))}
      </div>
    </Group>
  );
}
