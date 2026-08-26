import type { ClippingAccount } from "@prisma/client";
import { env, hasRealClippingCredentials } from "../../lib/env.js";
import { HttpClippingProvider } from "./HttpClippingProvider.js";
import { MockClippingProvider } from "./MockClippingProvider.js";
import { clippingBrowserManager } from "./ClippingBrowserManager.js";
import type { ClippingService } from "./ClippingService.js";

// The legacy/global provider — unchanged behavior, still driven by the extension's cookie
// POST + env vars (see routes/clipping.ts, lib/env.ts). This is the "ClippingAccount #1 /
// legacy" path: it keeps working exactly as before for any install with zero real
// ClippingAccount rows, and is the fallback ClippingAccountResolver uses in that case.
export const clippingService: ClippingService = hasRealClippingCredentials()
  ? new HttpClippingProvider({
      apiUrl: env.clipping.apiUrl!,
      campaignId: env.clipping.campaignId!,
      getSessionCookie: async () => env.clipping.sessionCookie!,
    })
  : new MockClippingProvider();

const mockClippingProvider: ClippingService = new MockClippingProvider();

/** Stable mock entry point for tests/dev, independent of how the real-provider factory
 * below evolves. */
export function getMockClippingProvider(): ClippingService {
  return mockClippingProvider;
}

const perAccountProviders = new Map<string, ClippingService>();

/** A Playwright-backed provider for one real ClippingAccount row, cached by account id so
 * repeat calls (e.g. every sync tick) reuse the same instance rather than re-wrapping the
 * browser manager each time. */
export function getClippingProviderForAccount(account: ClippingAccount): ClippingService {
  const cached = perAccountProviders.get(account.id);
  if (cached) return cached;

  const provider = new HttpClippingProvider({
    apiUrl: account.apiUrl,
    campaignId: account.campaignId,
    getSessionCookie: () => clippingBrowserManager.getSessionCookie(account),
    refresh: () => clippingBrowserManager.refreshSession(account),
    healthKey: `clipping:${account.id}`,
  });
  perAccountProviders.set(account.id, provider);
  return provider;
}

export * from "./ClippingService.js";
