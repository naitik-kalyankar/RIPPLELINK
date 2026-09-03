import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./lib/env.js";
import { prisma } from "./lib/db.js";
import { requireAuth } from "./lib/auth.js";
import { registerErrorHandler } from "./plugins/errorHandler.js";
import { reelsRoutes } from "./routes/reels.js";
import { creatorsRoutes } from "./routes/creators.js";
import { instagramRoutes } from "./routes/instagram.js";
import { clippingRoutes } from "./routes/clipping.js";
import { clippingAccountsRoutes } from "./routes/clippingAccounts.js";
import { syncRoutes } from "./routes/sync.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { integrationsRoutes } from "./routes/integrations.js";
import { adminRoutes } from "./routes/admin.js";
import { payoutsRoutes } from "./routes/payouts.js";
import { clippingBrowserManager } from "./services/clipping/ClippingBrowserManager.js";

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: env.corsOrigins });
  registerErrorHandler(app);

  app.get("/health", async () => ({ status: "ok" }));

  // Verifies every request's Supabase session and attaches request.user — registered before
  // the route plugins below so it runs first for all of them (see lib/auth.ts; /health is
  // exempted inside requireAuth itself, not here, since a root-level hook still fires for
  // every route regardless of registration order).
  app.addHook("onRequest", requireAuth);

  await app.register(reelsRoutes);
  await app.register(creatorsRoutes);
  await app.register(instagramRoutes);
  await app.register(clippingRoutes);
  await app.register(clippingAccountsRoutes);
  await app.register(syncRoutes);
  await app.register(dashboardRoutes);
  await app.register(integrationsRoutes);
  await app.register(adminRoutes);
  await app.register(payoutsRoutes);

  app.addHook("onClose", async () => {
    await clippingBrowserManager.shutdown();
    await prisma.$disconnect();
  });

  await app.listen({ port: env.port, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
