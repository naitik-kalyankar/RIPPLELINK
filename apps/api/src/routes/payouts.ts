import type { FastifyInstance } from "fastify";
import type { ClippingAccount } from "@prisma/client";
import { createPayoutSplitSchema, updatePayoutSplitSchema } from "@kick-manager/shared";
import { prisma } from "../lib/db.js";
import { clippingBrowserManager } from "../services/clipping/ClippingBrowserManager.js";
import { ClippingApiError } from "../services/clipping/ClippingService.js";

// Deterministic per-account seed (not crypto — just needs to be stable across reloads for the
// same account, same reasoning as MockInstagramProvider's seeded thumbnails).
function seededRandom(seed: string) {
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    x = (x * 1103515245 + 12345) >>> 0;
    return (x % 10000) / 10000;
  };
}

const MOCK_BOUNTY_TAGS = ["n3on", "adinross", "larrywheels", "xqc", "cgeezy"];

/** Placeholder payment history so the Payout page has something to look at before a real
 * CLIPPING session/payout cycle exists — used only when there's truly nothing real yet (no
 * cached pending estimate AND no finalized history), same "fall back to something
 * demonstrable" reasoning as MockInstagramProvider. */
function generateMockPayments(account: { id: string; campaignId: string }) {
  const rand = seededRandom(account.id);
  const now = Date.now();
  const DAY_MS = 86_400_000;

  const history = Array.from({ length: 5 }, (_, i) => {
    const amount = Math.round((20 + rand() * 180) * 100) / 100;
    const isPaid = i >= 2; // first two cycles pending, the rest already paid — mirrors a real timeline
    const finalizedAt = new Date(now - (i + 1) * 12 * DAY_MS);
    return {
      cycleId: `mock-${account.id}-${i}`,
      campaignId: account.campaignId,
      campaignName: "Kick Clipping",
      cycleLabel: `Kick Clipping - ${MOCK_BOUNTY_TAGS[i % MOCK_BOUNTY_TAGS.length]} #${i + 1}`,
      bountyTag: MOCK_BOUNTY_TAGS[i % MOCK_BOUNTY_TAGS.length],
      amount,
      paidAt: isPaid ? new Date(finalizedAt.getTime() + 2 * DAY_MS).toISOString() : null,
      finalizedAt: finalizedAt.toISOString(),
      totalViews: Math.round(50_000 + rand() * 400_000),
      totalClips: Math.round(5 + rand() * 40),
      status: (isPaid ? "paid" : "pending") as "paid" | "pending",
    };
  });

  const paidTotal = Math.round(history.filter((e) => e.status === "paid").reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
  const pendingTotal = Math.round(history.filter((e) => e.status === "pending").reduce((sum, e) => sum + e.amount, 0) * 100) / 100;

  return { paidTotal, pendingTotal, history, mock: true };
}

function serializeSplit(split: { id: string; clippingAccountId: string; name: string; percentage: number; createdAt: Date; updatedAt: Date }) {
  return {
    id: split.id,
    clippingAccountId: split.clippingAccountId,
    name: split.name,
    percentage: split.percentage,
    createdAt: split.createdAt.toISOString(),
    updatedAt: split.updatedAt.toISOString(),
  };
}

/** Everything the Payout page needs for one account — factored out of the route handler so the
 * cross-account splits summary (below) can reuse the exact same computation instead of
 * duplicating it. */
export async function computeAccountPayments(account: ClippingAccount) {
  // Two genuinely different numbers from CLIPPING, both scoped to Kick Clipping:
  //  - pendingEstimate: still-accruing, not yet finalized into a payout cycle — CLIPPING's
  //    campaign page (ClippingAccount.lastPayout/lastPayoutBountyBreakdown, refreshed every
  //    sync — see SyncService.syncPayoutForAccount). This is the number that actually has
  //    data for a new/still-running cycle, which is the common case.
  //  - history: FINALIZED cycles (paid or awaiting payment) from CLIPPING's real payment
  //    ledger (GET /api/clipper/earnings) — empty until Kick Clipping has actually closed
  //    a cycle for this account, which can be true for a while even with a healthy pending
  //    estimate above.
  const liveEarnings = await clippingBrowserManager.getEarnings(account).catch(() => null);
  const history = liveEarnings?.history.filter((entry) => entry.campaignId === account.campaignId) ?? [];

  // "The payment method used by Kick" — turns out CLIPPING DOES declare this per campaign
  // (confirmed by hand on the Kick Clipping campaign page itself: a real
  // `"paymentMethod":"usdt"` field), so that's the authoritative answer whenever it's
  // available — takes priority over guessing from a clipper's own paid history, which is
  // only a fallback for the (unlikely) case the campaign page didn't have it.
  const [settings, campaignPageData] = await Promise.all([
    clippingBrowserManager.getPaymentSettings(account).catch(() => null),
    clippingBrowserManager.getCampaignPageData(account).catch(() => null),
  ]);
  let paymentMethod: { type: string; value: string } | null = null;
  if (settings) {
    const campaignMethod = campaignPageData?.paymentMethod;
    const mostRecentPaid = (liveEarnings?.history ?? [])
      .filter((e) => e.paidAt && e.paymentMethod)
      .sort((a, b) => new Date(b.paidAt!).getTime() - new Date(a.paidAt!).getTime())[0];
    const method = campaignMethod ?? mostRecentPaid?.paymentMethod;

    if (method === "paypal" && settings.paypalEmail) {
      paymentMethod = { type: "paypal", value: settings.paypalEmail.email };
    } else if (method === "usdt" && settings.usdtAddress) {
      paymentMethod = { type: "usdt", value: settings.usdtAddress };
    } else if (method === "usdc" && settings.usdcAddress) {
      paymentMethod = { type: "usdc", value: settings.usdcAddress };
    } else if (settings.usdtAddress && settings.usdcAddress && settings.usdtAddress === settings.usdcAddress && !settings.paypalEmail) {
      // Same wallet address saved for both USDT and USDC (common — one address serves
      // both tokens on the same chain) — that's one real destination, not two ambiguous
      // ones, so show it even with no paid history to disambiguate from.
      paymentMethod = { type: "usdt/usdc", value: settings.usdtAddress };
    } else {
      // No paid history to go on yet — only surface a method if exactly one is saved,
      // since with more than one genuinely different one there's no way to tell which is
      // actually active.
      const saved = [
        settings.paypalEmail ? { type: "paypal", value: settings.paypalEmail.email } : null,
        settings.usdtAddress ? { type: "usdt", value: settings.usdtAddress } : null,
        settings.usdcAddress ? { type: "usdc", value: settings.usdcAddress } : null,
      ].filter((s): s is { type: string; value: string } => s !== null);
      paymentMethod = saved.length === 1 ? saved[0] : null;
    }
  }

  const breakdown = Array.isArray(account.lastPayoutBountyBreakdown)
    ? (account.lastPayoutBountyBreakdown as unknown as Array<{
        bounty: string;
        views: number;
        rate: number;
        payout: number;
        minViewsRequired: number;
        minViewsReached: boolean;
      }>)
    : [];
  const pendingEstimate =
    account.lastPayout !== null
      ? { total: account.lastPayout, fetchedAt: account.lastPayoutFetchedAt?.toISOString() ?? null, breakdown }
      : null;

  // Mock only when there's truly nothing real yet — no cached estimate AND no finalized
  // history — rather than whenever history alone happens to be empty (the common case for
  // an account with a healthy pending estimate but no closed cycles yet).
  if (!pendingEstimate && history.length === 0) {
    return { ...generateMockPayments(account), pendingEstimate: null, paymentMethod };
  }

  const paidTotal = Math.round(history.filter((e) => e.paidAt).reduce((sum, e) => sum + e.amount, 0) * 100) / 100;
  const pendingTotal = Math.round(history.filter((e) => !e.paidAt).reduce((sum, e) => sum + e.amount, 0) * 100) / 100;

  return {
    pendingEstimate,
    paymentMethod,
    paidTotal,
    pendingTotal,
    history: history.map((e) => ({ ...e, status: e.paidAt ? ("paid" as const) : ("pending" as const) })),
    mock: false,
  };
}

export async function payoutsRoutes(app: FastifyInstance) {
  // CLIPPING's own real payment history for one account, filtered to that account's own
  // campaign (the "only kick payout" ask — every account in this app is on the Kick Clipping
  // campaign, identified by its own configured campaignId, so filtering to that IS filtering
  // to Kick specifically without hardcoding a campaign name/id here).
  app.get("/api/clipping-accounts/:id/payments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    const account = await prisma.clippingAccount.findUnique({ where: { id, userId } });
    if (!account) {
      reply.status(404).send({ error: "not_found", message: "CLIPPING account not found." });
      return;
    }

    try {
      reply.status(200).send(await computeAccountPayments(account));
    } catch (error) {
      const message = error instanceof ClippingApiError ? error.message : "Failed to read payments from CLIPPING.";
      reply.status(400).send({ error: "payments_failed", message });
    }
  });

  // Every payout split, across every CLIPPING account, aggregated by person — the one chart at
  // the top of the Payout page. A name is matched case-insensitively/trimmed across accounts
  // (so "Mine" on Riyaan and "mine" on Snipey are the same person), summing each person's cut
  // of every account they're split into.
  app.get("/api/payouts/splits-summary", async (request, reply) => {
    const userId = request.user.id;
    const accounts = await prisma.clippingAccount.findMany({ where: { active: true, userId } });

    const perAccount = await Promise.all(
      accounts.map(async (account) => {
        const [splits, payments] = await Promise.all([
          prisma.payoutSplit.findMany({ where: { clippingAccountId: account.id, userId } }),
          computeAccountPayments(account).catch(() => null),
        ]);
        return { account, splits, payments };
      })
    );

    const byName = new Map<string, { name: string; pendingEstimate: number; paid: number; pending: number }>();
    for (const { splits, payments } of perAccount) {
      if (!payments) continue;
      for (const split of splits) {
        const key = split.name.trim().toLowerCase();
        const entry = byName.get(key) ?? { name: split.name.trim(), pendingEstimate: 0, paid: 0, pending: 0 };
        const share = split.percentage / 100;
        entry.pendingEstimate += (payments.pendingEstimate?.total ?? 0) * share;
        entry.paid += payments.paidTotal * share;
        entry.pending += payments.pendingTotal * share;
        byName.set(key, entry);
      }
    }

    const items = Array.from(byName.values())
      .map((e) => ({
        name: e.name,
        pendingEstimate: Math.round(e.pendingEstimate * 100) / 100,
        paid: Math.round(e.paid * 100) / 100,
        pending: Math.round(e.pending * 100) / 100,
        total: Math.round((e.pendingEstimate + e.paid + e.pending) * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total);

    reply.status(200).send({ items });
  });

  app.get("/api/clipping-accounts/:id/payout-splits", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    const account = await prisma.clippingAccount.findUnique({ where: { id, userId } });
    if (!account) {
      reply.status(404).send({ error: "not_found", message: "CLIPPING account not found." });
      return;
    }
    const splits = await prisma.payoutSplit.findMany({
      where: { clippingAccountId: id, userId },
      orderBy: { createdAt: "asc" },
    });
    reply.status(200).send({ items: splits.map(serializeSplit) });
  });

  app.post("/api/clipping-accounts/:id/payout-splits", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    const body = createPayoutSplitSchema.parse(request.body);
    const account = await prisma.clippingAccount.findUnique({ where: { id, userId } });
    if (!account) {
      reply.status(404).send({ error: "not_found", message: "CLIPPING account not found." });
      return;
    }
    const split = await prisma.payoutSplit.create({
      data: { userId, clippingAccountId: id, name: body.name, percentage: body.percentage },
    });
    reply.status(201).send(serializeSplit(split));
  });

  app.patch("/api/payout-splits/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    const body = updatePayoutSplitSchema.parse(request.body);
    const existing = await prisma.payoutSplit.findUnique({ where: { id, userId } });
    if (!existing) {
      reply.status(404).send({ error: "not_found", message: "Payout split not found." });
      return;
    }
    const split = await prisma.payoutSplit.update({ where: { id }, data: body });
    reply.status(200).send(serializeSplit(split));
  });

  app.delete("/api/payout-splits/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    const existing = await prisma.payoutSplit.findUnique({ where: { id, userId } });
    if (!existing) {
      reply.status(404).send({ error: "not_found", message: "Payout split not found." });
      return;
    }
    await prisma.payoutSplit.delete({ where: { id } });
    reply.status(204).send();
  });
}
