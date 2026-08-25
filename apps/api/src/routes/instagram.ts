import type { FastifyInstance } from "fastify";
import { createInstagramAccountSchema, updateInstagramAccountSchema } from "@kick-manager/shared";
import { prisma } from "../lib/db.js";
import { syncService } from "../services/sync/SyncService.js";
import { activityLogService } from "../services/activity/ActivityLogService.js";
import { fetchInstagramIdentity } from "../services/instagram/OfficialInstagramProvider.js";

function serializeAccount(account: {
  id: string;
  instagramId: string;
  username: string;
  displayName: string | null;
  active: boolean;
  accessToken: string | null;
  clippingAccountId: string | null;
  clippingOwnerEmail: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: account.id,
    instagramId: account.instagramId,
    username: account.username,
    displayName: account.displayName,
    active: account.active,
    // accessToken itself is never included — only whether one is set.
    hasAccessToken: Boolean(account.accessToken),
    clippingAccountId: account.clippingAccountId,
    clippingOwnerEmail: account.clippingOwnerEmail,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

export async function instagramRoutes(app: FastifyInstance) {
  app.get("/api/instagram/accounts", async () => {
    const accounts = await prisma.instagramAccount.findMany({ orderBy: { createdAt: "desc" } });
    return { items: accounts.map(serializeAccount) };
  });

  app.post("/api/instagram/accounts", async (request, reply) => {
    const body = createInstagramAccountSchema.parse(request.body);

    let instagramId = body.instagramId;
    let username = body.username;

    // The access token identifies its own account — auto-detect rather than making the user
    // hunt down and paste a numeric ID they may not even know offhand.
    if (body.accessToken && (!instagramId || !username)) {
      try {
        const identity = await fetchInstagramIdentity(body.accessToken);
        instagramId = instagramId ?? identity.id;
        username = username ?? identity.username;
      } catch (error) {
        reply.status(400).send({
          error: "identity_detection_failed",
          message: error instanceof Error ? error.message : "Could not verify this access token with Instagram.",
        });
        return;
      }
    }

    if (!instagramId || !username) {
      reply.status(400).send({
        error: "missing_identity",
        message: "Could not determine the Instagram account ID/username. Provide an access token or fill both in manually.",
      });
      return;
    }

    const account = await prisma.instagramAccount.create({
      data: {
        instagramId,
        username,
        displayName: body.displayName,
        accessToken: body.accessToken,
        clippingAccountId: body.clippingAccountId,
        clippingOwnerEmail: body.clippingOwnerEmail,
      },
    });
    await activityLogService.log(
      `Added Instagram account @${account.username}${body.accessToken ? " (live)" : " (mock)"}.`
    );
    reply.status(201);
    return serializeAccount(account);
  });

  app.patch("/api/instagram/accounts/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = updateInstagramAccountSchema.parse(request.body);
    const account = await prisma.instagramAccount.update({ where: { id }, data: body });
    return serializeAccount(account);
  });

  app.post("/api/instagram/accounts/:id/sync", async (request) => {
    const { id } = request.params as { id: string };
    const account = await prisma.instagramAccount.findUniqueOrThrow({ where: { id } });

    await syncService.syncAccount(account);

    const updated = await prisma.instagramAccount.findUniqueOrThrow({ where: { id } });
    return serializeAccount(updated);
  });
}
