import type { Instrumentation } from "next";

/** Server errors go to the app_errors table (shown in /dev-tools). Never throws. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { logServerError } = await import("@/lib/app-errors");
    await logServerError(err, request, context);
  } catch (logErr) {
    console.error("Couldn't log server error", logErr);
  }
};
