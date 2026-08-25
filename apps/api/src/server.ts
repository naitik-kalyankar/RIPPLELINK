import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./lib/env.js";
import { prisma } from "./lib/db.js";
import { registerErrorHandler } from "./plugins/errorHandler.js";
import { reelsRoutes } from "./routes/reels.js";
import { creatorsRoutes } from "./routes/creators.js";
import { instagramRoutes } from "./routes/instagram.js";
import { clippingRoutes } from "./routes/clipping.js";
import { syncRoutes } from "./routes/sync.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { integrationsRoutes } from "./routes/integrations.js";

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: env.corsOrigin });
  registerErrorHandler(app);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(reelsRoutes);
  await app.register(creatorsRoutes);
  await app.register(instagramRoutes);
  await app.register(clippingRoutes);
  await app.register(syncRoutes);
  await app.register(dashboardRoutes);
  await app.register(integrationsRoutes);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  await app.listen({ port: env.port, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
