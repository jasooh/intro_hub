function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: () => required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  // APP_URL is set for production; Vercel preview deployments fall back to their own branch URL.
  appUrl: () =>
    (
      process.env.APP_URL ??
      (process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : "http://localhost:3000")
    ).replace(/\/$/, ""),
  timezone: () => process.env.APP_TIMEZONE ?? "America/Toronto",
  adminEmails: () =>
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  etransferEmail: () => process.env.ETRANSFER_EMAIL ?? "(ask the host)",
  cronSecret: () => required("CRON_SECRET"),
  ingestSecret: () => required("INGEST_SECRET"),
  /** Roughly how many emails Gmail lets the host's account send in 24 hours (500 for a personal Gmail, 2000 for Workspace). */
  emailDailyLimit: () => Number(process.env.EMAIL_DAILY_LIMIT) || 500,
  /** Optional: the host's Spotify playlist link, shown on the home page. */
  spotifyPlaylistUrl: () => process.env.SPOTIFY_PLAYLIST_URL?.trim() || null,
};
