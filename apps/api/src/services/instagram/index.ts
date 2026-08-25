import { MockInstagramProvider } from "./MockInstagramProvider.js";
import { OfficialInstagramProvider } from "./OfficialInstagramProvider.js";
import type { InstagramAccountRef, InstagramService } from "./InstagramService.js";

const mockInstagramProvider = new MockInstagramProvider();
const officialInstagramProvider = new OfficialInstagramProvider();

/**
 * Provider is chosen per-account, not globally: each Instagram account carries its own
 * access token (or none, for a mock/demo account), so whether a given sync call is real or
 * mock depends on that specific account, not one process-wide flag.
 */
export function getInstagramServiceForAccount(account: InstagramAccountRef): InstagramService {
  return account.accessToken ? officialInstagramProvider : mockInstagramProvider;
}

export * from "./InstagramService.js";
