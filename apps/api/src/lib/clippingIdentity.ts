interface ClippingIdentity {
  userId: string | null;
  email: string | null;
  displayName: string | null;
  updatedAt: string;
}

// Live/in-memory only, not persisted — this reflects "whichever CLIPPING account is currently
// logged into the browser via the extension right now", which is only meaningful while the
// process is running and the extension is actively syncing. Populated from two independent
// sources that each report whatever they can see: userId from decoding the Supabase access
// token (a JWT) out of the session cookie; email/displayName from scraping the account
// switcher CLIPPING renders directly into its own page HTML. Merged rather than overwritten so
// one source reporting doesn't blank out a field only the other one provides.
let activeIdentity: ClippingIdentity | null = null;

export function updateActiveClippingIdentity(partial: {
  userId?: string | null;
  email?: string | null;
  displayName?: string | null;
}): ClippingIdentity {
  activeIdentity = {
    userId: partial.userId ?? activeIdentity?.userId ?? null,
    email: partial.email ?? activeIdentity?.email ?? null,
    displayName: partial.displayName ?? activeIdentity?.displayName ?? null,
    updatedAt: new Date().toISOString(),
  };
  return activeIdentity;
}

export function getActiveClippingIdentity(): ClippingIdentity | null {
  return activeIdentity;
}

export function clearActiveClippingIdentity(): void {
  activeIdentity = null;
}
