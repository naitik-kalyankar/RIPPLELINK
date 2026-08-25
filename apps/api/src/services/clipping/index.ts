import { hasRealClippingCredentials } from "../../lib/env.js";
import { HttpClippingProvider } from "./HttpClippingProvider.js";
import { MockClippingProvider } from "./MockClippingProvider.js";
import type { ClippingService } from "./ClippingService.js";

export const clippingService: ClippingService = hasRealClippingCredentials()
  ? new HttpClippingProvider()
  : new MockClippingProvider();

export * from "./ClippingService.js";
