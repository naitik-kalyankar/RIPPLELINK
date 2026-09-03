import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { computeAccountPayments } from "./payouts.js";

// What actually gets persisted to ClippingAccount.lastAdminPayoutSnapshot — a plain-data subset
// of computeAccountPayments' return value (payout method + totals + history), narrow enough to
// round-trip cleanly through JSONB without needing a migration every time that function's shape
// grows for reasons the admin view doesn't care about.
interface AdminPayoutSnapshot {
  pendingEstimate: number | null;
  paidTotal: number;
  pendingTotal: number;
  paymentMethod: Awaited<ReturnType<typeof computeAccountPayments>>["paymentMethod"];
  history: Awaited<ReturnType<typeof computeAccountPayments>>["history"];
  mock: boolean;
}

/**
 * The entire "admin dashboard" backend: a handful of read-only routes gated by
 * request.user.isAdmin (see lib/auth.ts) instead of a privileged Supabase key. This works
 * because apps/api already holds a trusted Prisma connection for its own use — admin access is
 * just an authorization check on top of infrastructure that already exists, not a second,
 * more-powerful credential. No route here writes another user's data; that stays owner-only.
 */
export async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    if (!request.user.isAdmin) {
      reply.status(403).send({ error: "forbidden", message: "Admin access required." });
    }
  });

  app.get("/api/admin/users", async () => {
    const profiles = await prisma.profile.findMany({ orderBy: { createdAt: "desc" } });
    const counts = await Promise.all(
      profiles.map(async (profile) => ({
        instagramAccounts: await prisma.instagramAccount.count({ where: { userId: profile.id } }),
        clippingAccounts: await prisma.clippingAccount.count({ where: { userId: profile.id } }),
        reels: await prisma.reel.count({ where: { userId: profile.id } }),
      }))
    );

    return {
      items: profiles.map((profile, i) => ({
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        isAdmin: profile.isAdmin,
        subscriptionTier: profile.subscriptionTier,
        subscriptionStatus: profile.subscriptionStatus,
        createdAt: profile.createdAt.toISOString(),
        ...counts[i],
      })),
    };
  });

  // Every active CLIPPING account across EVERY RIPPLELINK user, with its own payout numbers —
  // the one place an admin can see total money owed/paid across the whole product without
  // logging into each person's account individually. Reuses computeAccountPayments (the exact
  // same computation the owner's own Payout page runs), just fanned out across every user's
  // accounts instead of one user's.
  //
  // Two modes, both under this one route:
  //  - Plain GET (page load): reads whatever's already stored, no Playwright involved at all —
  //    was previously a live fetch across EVERY account on every page load/revisit, launching a
  //    Playwright context per account all at once. That's what a "Refresh" button is for now
  //    instead — opening the page should be instant and free, not kick off a small stampede.
  //  - GET ?refresh=true (the button): the real live fetch, unchanged from before. A fresh
  //    successful result overwrites lastAdminPayoutSnapshot; a failed one (dead session, network
  //    blip, CLIPPING briefly down, or a mock/placeholder result — see computeAccountPayments)
  //    never clears it, falling back to whatever was last known-good instead of blanking to
  //    zero or showing fabricated numbers. `stale`/`fetchedAt`/`error` say how old/why.
  app.get("/api/admin/payouts", async (request) => {
    const { refresh } = request.query as { refresh?: string };
    const live = refresh === "true";

    const accounts = await prisma.clippingAccount.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
    const profiles = await prisma.profile.findMany({
      where: { id: { in: Array.from(new Set(accounts.map((a) => a.userId))) } },
      select: { id: true, email: true, displayName: true },
    });
    const ownerById = new Map(profiles.map((p) => [p.id, p]));

    const buildFromCache = (account: (typeof accounts)[number], base: Record<string, unknown>, error: string | null) => {
      const cached = account.lastAdminPayoutSnapshot as unknown as AdminPayoutSnapshot | null;
      if (cached) {
        return { ...base, ...cached, stale: true, fetchedAt: account.lastAdminPayoutSnapshotAt?.toISOString() ?? null, error };
      }
      // Never successfully fetched even once — nothing to fall back to.
      return {
        ...base,
        pendingEstimate: null,
        paidTotal: 0,
        pendingTotal: 0,
        paymentMethod: null,
        history: [],
        mock: false,
        stale: true,
        fetchedAt: null,
        error,
      };
    };

    const items = await Promise.all(
      accounts.map(async (account) => {
        const owner = ownerById.get(account.userId);
        const base = {
          accountId: account.id,
          label: account.label,
          email: account.email,
          ownerId: account.userId,
          ownerEmail: owner?.email ?? null,
          ownerDisplayName: owner?.displayName ?? null,
        };

        if (!live) return buildFromCache(account, base, null);

        try {
          const payments = await computeAccountPayments(account);
          // Mock is fabricated placeholder data (see computeAccountPayments — it exists so the
          // OWNER's own Payout page has something to look at before real numbers exist), never a
          // genuine result. Routing it through the same catch-and-fall-back-to-cached path below
          // as a real failure would is what keeps this route's two guarantees actually true: real
          // stored numbers never get overwritten by fake ones, and an admin never sees invented
          // numbers dressed up as real — either the last known-good snapshot, or an honest "never
          // fetched" empty state, but never mock.
          if (payments.mock) throw new Error("No real payout data available yet.");
          const snapshot: AdminPayoutSnapshot = {
            pendingEstimate: payments.pendingEstimate?.total ?? null,
            paidTotal: payments.paidTotal,
            pendingTotal: payments.pendingTotal,
            paymentMethod: payments.paymentMethod,
            history: payments.history,
            mock: payments.mock,
          };
          const fetchedAt = new Date();
          await prisma.clippingAccount.update({
            where: { id: account.id },
            data: { lastAdminPayoutSnapshot: snapshot as unknown as Prisma.InputJsonValue, lastAdminPayoutSnapshotAt: fetchedAt },
          });
          return { ...base, ...snapshot, stale: false, fetchedAt: fetchedAt.toISOString(), error: null as string | null };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to read payments.";
          return buildFromCache(account, base, message);
        }
      })
    );

    const totals = items.reduce(
      (sum, item) => ({
        pendingEstimate: sum.pendingEstimate + (item.pendingEstimate ?? 0),
        paidTotal: sum.paidTotal + item.paidTotal,
        pendingTotal: sum.pendingTotal + item.pendingTotal,
      }),
      { pendingEstimate: 0, paidTotal: 0, pendingTotal: 0 }
    );

    return { items, totals };
  });

  app.get("/api/admin/users/:id/activity", async (request) => {
    const { id } = request.params as { id: string };
    const items = await prisma.activityLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { items };
  });
}
