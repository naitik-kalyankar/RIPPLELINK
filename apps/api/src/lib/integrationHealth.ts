interface IntegrationHealth {
  lastError: { message: string; at: string } | null;
  lastSuccessAt: string | null;
}

// "instagram"/"clipping" are the well-known global keys (still what the legacy singleton
// providers report under). Per-ClippingAccount health lives under "clipping:<accountId>",
// added lazily by whichever HttpClippingProvider instance is configured with that key — see
// HttpClippingProviderConfig.healthKey.
const state: Record<string, IntegrationHealth> = {
  instagram: { lastError: null, lastSuccessAt: null },
  clipping: { lastError: null, lastSuccessAt: null },
};

/** Tracks real request outcomes so the UI can show "is this actually working right now",
 * not just "are credentials configured" — a stale/expired cookie still has credentials set. */
export function recordIntegrationSuccess(key: string) {
  state[key] = { lastError: null, lastSuccessAt: new Date().toISOString() };
}

export function recordIntegrationError(key: string, message: string) {
  state[key] = { ...(state[key] ?? { lastError: null, lastSuccessAt: null }), lastError: { message, at: new Date().toISOString() } };
}

export function getIntegrationHealth() {
  return state;
}

export function getClippingAccountHealth(accountId: string): IntegrationHealth {
  return state[`clipping:${accountId}`] ?? { lastError: null, lastSuccessAt: null };
}

export function getInstagramAccountHealth(accountId: string): IntegrationHealth {
  return state[`instagram:${accountId}`] ?? { lastError: null, lastSuccessAt: null };
}
