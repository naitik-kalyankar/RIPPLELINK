import type { FastifyInstance } from "fastify";
import { getIntegrationHealth } from "../lib/integrationHealth.js";
import { hasRealClippingCredentials, env } from "../lib/env.js";
import { prisma } from "../lib/db.js";

export async function integrationsRoutes(app: FastifyInstance) {
  app.get("/api/integrations/status", async () => {
    const health = getIntegrationHealth();

    // Instagram credentials are per-account now, not a single global flag — "live" means at
    // least one active account has its own access token configured.
    const liveAccountCount = await prisma.instagramAccount.count({
      where: { active: true, accessToken: { not: null } },
    });
    const instagramLive = liveAccountCount > 0;
    const clippingLive = hasRealClippingCredentials();

    return {
      instagram: {
        mode: instagramLive ? "live" : "mock",
        // Mock mode is trivially "healthy" — nothing to fail. In live mode, healthy means
        // the most recent real request succeeded (recordIntegrationSuccess clears lastError).
        healthy: instagramLive ? health.instagram.lastError === null : true,
        lastError: health.instagram.lastError,
        lastSuccessAt: health.instagram.lastSuccessAt,
        liveAccountCount,
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
