import type { FastifyInstance } from "fastify";
import { getIntegrationHealth, getInstagramAccountHealth } from "../lib/integrationHealth.js";
import { hasRealClippingCredentials, env } from "../lib/env.js";
import { prisma } from "../lib/db.js";

export async function integrationsRoutes(app: FastifyInstance) {
  app.get("/api/integrations/status", async () => {
    // Instagram credentials — and health — are per-account now (see
    // OfficialInstagramProvider's per-account healthKey), not a single global flag: "live"
    // means at least one active account has its own access token configured, and this
    // top-level summary is healthy only if EVERY live account's last request succeeded, so one
    // broken account can't be masked by another one's success (or vice versa).
    const liveAccounts = await prisma.instagramAccount.findMany({
      where: { active: true, accessToken: { not: null } },
      select: { id: true },
    });
    const accountHealths = liveAccounts.map((a) => getInstagramAccountHealth(a.id));
    const instagramLive = liveAccounts.length > 0;
    const instagramError = accountHealths.find((h) => h.lastError !== null)?.lastError ?? null;
    const instagramLastSuccessAt = accountHealths
      .map((h) => h.lastSuccessAt)
      .filter((t): t is string => t !== null)
      .sort()
      .at(-1) ?? null;
    const clippingLive = hasRealClippingCredentials();
    const health = getIntegrationHealth();

    return {
      instagram: {
        mode: instagramLive ? "live" : "mock",
        // Mock mode is trivially "healthy" — nothing to fail.
        healthy: instagramLive ? instagramError === null : true,
        lastError: instagramError,
        lastSuccessAt: instagramLastSuccessAt,
        liveAccountCount: liveAccounts.length,
      },
      clipping: {
        mode: clippingLive ? "live" : "mock",
        healthy: clippingLive ? health.clipping.lastError === null : true,
        lastError: health.clipping.lastError,
        lastSuccessAt: health.clipping.lastSuccessAt,
        campaignId: env.clipping.campaignId ?? null,
      },
    };
  });
}
