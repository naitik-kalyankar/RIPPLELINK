import "dotenv/config";

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/**
 * Central place external credentials are read from. Nothing here is ever sent to the
 * frontend — routes/services only ever return derived data, never these values.
 */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  // Comma-separated so both the web dev/prod origin and the Tauri webview's origin (a
  // different scheme entirely — e.g. tauri://localhost) can be allow-listed at once.
  corsOrigins: (optional("CORS_ORIGIN") ?? "http://localhost:5173").split(",").map((o) => o.trim()),

  // Used to verify Supabase access tokens via its public JWKS endpoint (see lib/auth.ts) —
  // not a secret itself (same value as the frontend's VITE_SUPABASE_URL), just not bundled
  // into the client here since the backend has no other use for VITE_-prefixed config.
  supabaseUrl: optional("SUPABASE_URL"),

  clipping: {
    apiUrl: optional("CLIPPING_API_URL"),
    // CLIPPING has no official API — the only working auth is replaying a logged-in
    // browser's Supabase session cookie. It expires (~hourly) and must be refreshed by
    // hand; there is no key that "just works" long-term. See HttpClippingProvider.
    sessionCookie: optional("CLIPPING_SESSION_COOKIE"),
    campaignId: optional("CLIPPING_CAMPAIGN_ID"),
    // CLIPPING's per-account accountId lives on InstagramAccount.clippingAccountId now, not
    // here — each Instagram account maps to a different one, same reasoning as Instagram's
    // per-account access tokens below.
  },
};

// Instagram credentials live per-account in the database now (InstagramAccount.accessToken),
// not as a single global env var — see services/instagram/index.ts's getInstagramServiceForAccount.

// A function, not a const: env.clipping.sessionCookie can be updated at runtime (see
// routes/clipping.ts's session-cookie endpoint, used by the cookie-sync browser extension),
// so credential presence must be re-checked live rather than frozen at process startup.
export function hasRealClippingCredentials(): boolean {
  return Boolean(env.clipping.apiUrl && env.clipping.sessionCookie && env.clipping.campaignId);
}
