import type { FastifyInstance } from "fastify";
import { syncService } from "../services/sync/SyncService.js";

export async function syncRoutes(app: FastifyInstance) {
  app.post("/api/sync/all", async () => {
    return syncService.syncAll();
  });

  app.post("/api/sync/instagram", async () => {
    return syncService.syncInstagram();
  });

  app.post("/api/sync/clipping", async () => {
    return syncService.syncClipping();
  });
}
