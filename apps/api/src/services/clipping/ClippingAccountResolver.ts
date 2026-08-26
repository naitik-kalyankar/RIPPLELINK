import { prisma } from "../../lib/db.js";
import { clippingService, getClippingProviderForAccount } from "./index.js";
import { ClippingApiError, type ClippingService } from "./ClippingService.js";

interface InstagramAccountRef {
  clippingAccountRefId: string | null;
}

/**
 * The single seam SyncService/SubmissionService go through to pick which CLIPPING session
 * (which ClippingAccount's Playwright context) should handle a given Instagram account's
 * clips. Falls back to the legacy global provider when no real ClippingAccount rows exist
 * yet, so a fresh/legacy install behaves exactly as it did before multi-account support.
 */
class ClippingAccountResolver {
  async resolveProviderForInstagramAccount(igAccount: InstagramAccountRef): Promise<ClippingService> {
    if (igAccount.clippingAccountRefId) {
      const account = await prisma.clippingAccount.findUnique({ where: { id: igAccount.clippingAccountRefId } });
      if (!account) {
        throw new ClippingApiError(
          `This Instagram account is linked to a CLIPPING account that no longer exists (${igAccount.clippingAccountRefId}).`,
          "auth"
        );
      }
      return getClippingProviderForAccount(account);
    }

    // Not linked to a real ClippingAccount yet — keep using the legacy global session,
    // exactly as before multi-account support, regardless of whether OTHER Instagram
    // accounts have already been migrated. This is what makes the rollout incremental:
    // linking one account to its own ClippingAccount must never block submissions for
    // another Instagram account that hasn't been migrated yet.
    return clippingService;
  }
}

export const clippingAccountResolver = new ClippingAccountResolver();
