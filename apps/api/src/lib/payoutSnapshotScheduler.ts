import type { Prisma, ClippingAccount } from "@prisma/client";
import { prisma } from "./db.js";
import { clippingBrowserManager } from "../services/clipping/ClippingBrowserManager.js";
import { computeAccountPayments } from "../routes/payouts.js";

// Same cadence class as the app's own hourly update check — frequent enough that
// lastAdminPayoutSnapshot stays reasonably current without opening Admin Payouts, infrequent
// enough not to hammer CLIPPING or keep Playwright busy in the background.
const INTERVAL_MS = 30 * 60 * 1000;
// Give the sidecar (and its Playwright contexts) a moment to settle after boot before the first
// run, rather than competing with everything else that happens right when the app opens.
const FIRST_RUN_DELAY_MS = 60 * 1000;

// Mirrors the shape /api/admin/payouts persists (see routes/admin.ts) — kept as a plain literal
// here rather than importing that route's local interface, so this file has no reason to change
// whenever that route's response shape does for reasons unrelated to what gets stored.
type StoredSnapshot = {
  pendingEstimate: number | null;
  paidTotal: number;
  pendingTotal: number;
  paymentMethod: Awaited<ReturnType<typeof computeAccountPayments>>["paymentMethod"];
  history: Awaited<ReturnType<typeof computeAccountPayments>>["history"];
  mock: boolean;
};

async function refreshOne(account: ClippingAccount): Promise<void> {
  // No session file on THIS machine for this account — every user runs their own local apps/api
  // (see main.rs's sidecar), so an account logged into elsewhere can never succeed here. Skipping
  // outright avoids a pointless Playwright launch and the error noise that'd otherwise repeat
  // every interval forever for accounts this machine will never be able to reach.
  if (!clippingBrowserManager.hasLocalSession(account)) return;

  try {
    const payments = await computeAccountPayments(account);
    const snapshot: StoredSnapshot = {
      pendingEstimate: payments.pendingEstimate?.total ?? null,
      paidTotal: payments.paidTotal,
      pendingTotal: payments.pendingTotal,
      paymentMethod: payments.paymentMethod,
      history: payments.history,
      mock: payments.mock,
    };
    await prisma.clippingAccount.update({
      where: { id: account.id },
      data: { lastAdminPayoutSnapshot: snapshot as unknown as Prisma.InputJsonValue, lastAdminPayoutSnapshotAt: new Date() },
    });
  } catch {
    // Same fallback behavior as the admin route itself: a failed refresh (dead session, CLIPPING
    // briefly down, network blip) just leaves whatever was last known-good in place rather than
    // clearing it — nothing to do here, the next interval tries again.
  }
}

async function tick(): Promise<void> {
  const accounts = await prisma.clippingAccount.findMany({ where: { active: true } });
  // Sequential, not Promise.all — each refresh drives a real Playwright context, and there's no
  // upside to running several at once for a background job with no one waiting on the result.
  for (const account of accounts) {
    await refreshOne(account);
  }
}

let started = false;

/** Called once from server.ts at boot. Entirely silent — no route, no client-visible state, no
 * notification — it only ever shows up as apps/admin's Payout page having fresher numbers than
 * whoever's looking would otherwise expect from a page they haven't opened yet. */
export function startPayoutSnapshotScheduler(): void {
  if (started) return;
  started = true;
  setTimeout(() => {
    tick().catch(() => {});
    setInterval(() => {
      tick().catch(() => {});
    }, INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);
}
