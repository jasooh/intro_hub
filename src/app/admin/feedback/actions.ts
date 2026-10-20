"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { flash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

/** Mark a piece of feedback as handled (moves it to the Handled tab), or back to New. */
export async function setFeedbackHandled(feedbackId: string, handled: boolean) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .update({ handled_at: handled ? new Date().toISOString() : null })
    .eq("id", feedbackId);
  if (error) redirect(`/admin/feedback?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/feedback");
  await flash("success", handled ? "Marked as handled" : "Moved back to New");
}
