import type { FastifyInstance } from "fastify";
import { syncService } from "../services/sync/SyncService.js";

export async function syncRoutes(app: FastifyInstance) {
  app.post("/api/sync/all", async (request) => {
    return syncService.syncAll(request.user.id);
  });

  app.post("/api/sync/instagram", async (request) => {
    return syncService.syncInstagram(request.user.id);
  });

  app.post("/api/sync/clipping", async (request) => {
    return syncService.syncClipping(request.user.id);
  });
}
