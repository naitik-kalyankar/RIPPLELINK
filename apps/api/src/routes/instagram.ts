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
  clippingAccountRefId: string | null;
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
    clippingAccountRefId: account.clippingAccountRefId,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

// clippingAccountRefId is client-suppliable (used to link an Instagram account to one of the
// user's own ClippingAccount rows) — without this check, a guessed/leaked id belonging to a
// DIFFERENT user would silently make this account's submissions go through that other user's
// CLIPPING login (see ClippingAccountResolver, which trusts this field once set).
async function validateClippingAccountRefId(userId: string, clippingAccountRefId: string | null | undefined) {
  if (!clippingAccountRefId) return true;
  const owned = await prisma.clippingAccount.findUnique({ where: { id: clippingAccountRefId, userId } });
  return owned !== null;
}

export async function instagramRoutes(app: FastifyInstance) {
  app.get("/api/instagram/accounts", async (request) => {
    const accounts = await prisma.instagramAccount.findMany({
      where: { userId: request.user.id },
      orderBy: { createdAt: "desc" },
    });
    return { items: accounts.map(serializeAccount) };
  });

  app.post("/api/instagram/accounts", async (request, reply) => {
    const body = createInstagramAccountSchema.parse(request.body);
    const userId = request.user.id;

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

    if (!(await validateClippingAccountRefId(userId, body.clippingAccountRefId))) {
      reply.status(400).send({ error: "invalid_clipping_account", message: "That CLIPPING account wasn't found." });
      return;
    }

    const account = await prisma.instagramAccount.create({
      data: {
        userId,
        instagramId,
        username,
        displayName: body.displayName,
        accessToken: body.accessToken,
        clippingAccountId: body.clippingAccountId,
        clippingOwnerEmail: body.clippingOwnerEmail,
        clippingAccountRefId: body.clippingAccountRefId,
      },
    });
    await activityLogService.log(
      userId,
      `Added Instagram account @${account.username}${body.accessToken ? " (live)" : " (mock)"}.`
    );
    reply.status(201);
    return serializeAccount(account);
  });

  app.patch("/api/instagram/accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    const body = updateInstagramAccountSchema.parse(request.body);
    const existing = await prisma.instagramAccount.findUnique({ where: { id, userId } });
    if (!existing) {
      reply.status(404).send({ error: "not_found", message: "Instagram account not found." });
      return;
    }

    if (!(await validateClippingAccountRefId(userId, body.clippingAccountRefId))) {
      reply.status(400).send({ error: "invalid_clipping_account", message: "That CLIPPING account wasn't found." });
      return;
    }

    const data: typeof body = { ...body };
    // A new access token identifies its own account, same as at creation — without this, a
    // token pasted for the WRONG account (an easy mistake with several accounts open) would
    // silently keep the old instagramId/username, so every future sync would fetch a different
    // account's Reels under this one's identity.
    if (body.accessToken) {
      try {
        const identity = await fetchInstagramIdentity(body.accessToken);
        data.instagramId = body.instagramId ?? identity.id;
        data.username = body.username ?? identity.username;
        if (identity.username.toLowerCase() !== existing.username.toLowerCase()) {
          await activityLogService.log(
            userId,
            `New access token for "${existing.username}" actually belongs to @${identity.username} — updated to match. Double-check this was the intended account.`,
            "warning"
          );
        }
      } catch (error) {
        reply.status(400).send({
          error: "identity_detection_failed",
          message: error instanceof Error ? error.message : "Could not verify this access token with Instagram.",
        });
        return;
      }
    }

    const account = await prisma.instagramAccount.update({ where: { id }, data });
    return serializeAccount(account);
  });

  // A real, hard delete — not the same as the Enable/Disable toggle (which just flips `active`
  // and keeps the row, and its Reel history, around so it can be turned back on). This is for
  // "get this account and everything under it out of my app": Reel has onDelete: Cascade on its
  // instagramAccount relation, so this also removes every Reel (and their submissions/attempts)
  // synced under it. Deliberately a separate action from Disable, not a stronger version of it.
  app.delete("/api/instagram/accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    const existing = await prisma.instagramAccount.findUnique({ where: { id, userId } });
    if (!existing) {
      reply.status(404).send({ error: "not_found", message: "Instagram account not found." });
      return;
    }

    await prisma.instagramAccount.delete({ where: { id } });
    await activityLogService.log(userId, `Removed Instagram account @${existing.username}.`);
    reply.status(204).send();
  });

  app.post("/api/instagram/accounts/:id/sync", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    const account = await prisma.instagramAccount.findUnique({ where: { id, userId } });
    if (!account) {
      reply.status(404).send({ error: "not_found", message: "Instagram account not found." });
      return;
    }

    await syncService.syncAccount(userId, account);

    const updated = await prisma.instagramAccount.findUniqueOrThrow({ where: { id } });
    return serializeAccount(updated);
  });
}
