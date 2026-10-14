import "server-only";
import { cookies } from "next/headers";

// One-shot toast messages from server actions. The action sets a short-lived
// cookie; <FlashToaster /> (src/components/flash-toaster.tsx) shows it and
// deletes it. Works whether the action redirects or just revalidates.

export type FlashKind = "success" | "error";

export async function flash(kind: FlashKind, message: string) {
  const payload = JSON.stringify({ k: kind, m: message, id: crypto.randomUUID() });
  (await cookies()).set("flash", Buffer.from(payload).toString("base64url"), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    httpOnly: false, // read and cleared by the browser
  });
}
