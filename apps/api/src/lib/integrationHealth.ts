type IntegrationKey = "instagram" | "clipping";

interface IntegrationHealth {
  lastError: { message: string; at: string } | null;
  lastSuccessAt: string | null;
}

const state: Record<IntegrationKey, IntegrationHealth> = {
  instagram: { lastError: null, lastSuccessAt: null },
  clipping: { lastError: null, lastSuccessAt: null },
};

/** Tracks real request outcomes so the UI can show "is this actually working right now",
 * not just "are credentials configured" — a stale/expired cookie still has credentials set. */
export function recordIntegrationSuccess(key: IntegrationKey) {
  state[key] = { lastError: null, lastSuccessAt: new Date().toISOString() };
}

export function recordIntegrationError(key: IntegrationKey, message: string) {
  state[key] = { ...state[key], lastError: { message, at: new Date().toISOString() } };
}

export function getIntegrationHealth() {
  return state;
}
