import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Dropdown } from "@/components/dropdown";
import { SubmitButton } from "@/components/submit-button";
import { BackLink, PageSpinner, PageTitle, reveal, Sheet, StatusMark } from "@/components/ui";
import { requireDevTools } from "@/lib/auth";
import { isEditableTable, EDITABLE_TABLES, type ColumnInfo } from "@/lib/dev-tools";
import { createClient } from "@/lib/supabase/server";
import type { RegistrationStatus } from "@/lib/types";
import { deleteRow, forceStatus, saveRow } from "../../../actions";
import { RowFields } from "./row-fields";

export const metadata: Metadata = {
  title: "Edit row",
};

const STATUSES: RegistrationStatus[] = ["pending_payment", "confirmed", "waitlisted", "expired", "cancelled"];

export default function DevToolsRowPage(props: PageProps<"/dev-tools/data/[table]/[id]">) {
  return (
    <Suspense fallback={<PageSpinner />}>
      <RowView params={props.params} />
    </Suspense>
  );
}

async function RowView({ params }: { params: PageProps<"/dev-tools/data/[table]/[id]">["params"] }) {
  await requireDevTools();
  const { table, id } = await params;
  if (!isEditableTable(table)) notFound();

  const supabase = await createClient();
  const [{ data: columns, error: colError }, { data: row, error: rowError }] = await Promise.all([
    supabase.rpc("devtools_table_columns", { p_table: table }),
    supabase.rpc("devtools_get_row", { p_table: table, p_id: id }),
  ]);
  if (colError || rowError) throw colError ?? rowError;
  if (!row) notFound();
  const r = row as Record<string, unknown>;

  // Shortcuts to the rows this one points at.
  const links: { href: string; label: string }[] = [];
  if (table === "profiles") links.push({ href: `/dev-tools/players/${id}`, label: "View as player" });
  if (table === "sessions") links.push({ href: `/admin/sessions/${id}`, label: "Session in admin" });
  if (typeof r.profile_id === "string") {
    links.push({ href: `/dev-tools/data/profiles/${r.profile_id}`, label: "Player row" });
    links.push({ href: `/dev-tools/players/${r.profile_id}`, label: "View as player" });
  }
  if (typeof r.session_id === "string") {
    links.push({ href: `/dev-tools/data/sessions/${r.session_id}`, label: "Session row" });
    links.push({ href: `/admin/sessions/${r.session_id}`, label: "Session in admin" });
  }
  if (typeof r.registration_id === "string") {
    links.push({ href: `/dev-tools/data/registrations/${r.registration_id}`, label: "Sign-up row" });
  }

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <BackLink href={`/dev-tools/data?table=${table}`}>{EDITABLE_TABLES[table].label}</BackLink>
        <PageTitle eyebrow={table} sub={<span className="font-score text-sm break-all">{id}</span>}>
          Edit row
        </PageTitle>
        {links.length > 0 && (
          <p className="flex flex-wrap gap-x-5 gap-y-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="underline decoration-line decoration-2 underline-offset-4">
                {l.label}
              </Link>
            ))}
          </p>
        )}
      </div>

      {table === "registrations" && (
        <Sheet label="Status" className="reveal" style={reveal(1)}>
          <form action={forceStatus.bind(null, id)} className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <p className="text-sm text-ink-soft">Now</p>
              <StatusMark status={r.status as RegistrationStatus} />
            </div>
            <Dropdown
              name="status"
              defaultValue={String(r.status)}
              label="New status"
              className="w-48"
              options={STATUSES.map((st) => ({ value: st, label: st }))}
            />
            <SubmitButton
              requireChange
              confirm={{
                title: "Force this status?",
                description:
                  "Sets the hold, waitlist and confirmed times to match, then moves the waitlist up if a spot opened (those players get emailed). Use this instead of editing the status field by hand.",
                action: "Set status",
              }}
            >
              Set status
            </SubmitButton>
          </form>
        </Sheet>
      )}

      <Sheet label="Fields" className="reveal" style={reveal(2)}>
        <form action={saveRow.bind(null, table, id)} className="space-y-6">
          <RowFields columns={columns as ColumnInfo[]} row={r} />
          <div className="border-t-2 border-ink pt-5">
            <SubmitButton
              requireChange
              confirm={{
                title: "Save these changes?",
                description: "This writes straight to the database, skipping the app's usual checks. The old values go to the audit log.",
                action: "Save",
              }}
            >
              Save
            </SubmitButton>
          </div>
        </form>
      </Sheet>

      <Sheet label="Delete" className="reveal" style={reveal(3)}>
        <form action={deleteRow.bind(null, table, id)} className="flex flex-wrap items-center gap-4">
          <p className="min-w-0 flex-1 text-ink-soft">
            {table === "profiles"
              ? "Deletes the whole account: sign-in, profile and sign-ups. Payments stay, unlinked."
              : table === "sessions"
                ? "Deletes the session with its sign-ups and teams. Payments stay, unlinked."
                : "Deletes this row. Rows that depend on it may go too."}
          </p>
          <SubmitButton
            variant="danger"
            confirm={{
              title: table === "profiles" ? "Delete this account?" : "Delete this row?",
              description: "The old values are kept in the audit log, but this can't be undone from the app.",
              action: "Delete",
            }}
          >
            Delete
          </SubmitButton>
        </form>
      </Sheet>
    </div>
  );
}
