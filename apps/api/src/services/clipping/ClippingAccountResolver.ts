import { prisma } from "../../lib/db.js";
import { getClippingProviderForAccount } from "./index.js";
import { ClippingApiError, type ClippingService } from "./ClippingService.js";

interface InstagramAccountRef {
  clippingAccountRefId: string | null;
}

/**
 * The single seam SyncService/SubmissionService go through to pick which CLIPPING session
 * (which ClippingAccount's Playwright context) should handle a given Instagram account's
 * clips. The old extension-cookie-driven global fallback is gone — every Instagram account
 * must be linked to a real ClippingAccount now (see ClippingAccountGate, which blocks the app
 * until at least one exists).
 */
class ClippingAccountResolver {
  async resolveProviderForInstagramAccount(igAccount: InstagramAccountRef): Promise<ClippingService> {
    if (!igAccount.clippingAccountRefId) {
      throw new ClippingApiError(
        "This Instagram account isn't linked to a CLIPPING account yet — link one in Settings before syncing or submitting.",
        "auth"
      );
    }

    const account = await prisma.clippingAccount.findUnique({ where: { id: igAccount.clippingAccountRefId } });
    if (!account) {
      throw new ClippingApiError(
        `This Instagram account is linked to a CLIPPING account that no longer exists (${igAccount.clippingAccountRefId}).`,
        "auth"
      );
    }
    return getClippingProviderForAccount(account);
  }
}

export const clippingAccountResolver = new ClippingAccountResolver();
