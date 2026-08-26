import { z } from "zod";
import {
  CREATOR_DETECTION_STATUSES,
  DATE_RANGE_PRESETS,
  LINK_STATUSES,
  REEL_SORT_FIELDS,
} from "./enums.js";

export const createInstagramAccountSchema = z
  .object({
    // Both optional: when accessToken is given, the API auto-detects username + Instagram
    // account ID from Instagram itself (the token identifies the account) — see
    // fetchInstagramIdentity. Only needed manually for a mock account (no token).
    instagramId: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
    displayName: z.string().optional(),
    // Leave blank to use the mock provider for this account instead.
    accessToken: z.string().optional(),
    // CLIPPING's internal ID for this account — required before you can submit its Reels,
    // but can be added later via update, so optional at creation time.
    clippingAccountId: z.string().optional(),
    clippingOwnerEmail: z.string().optional(),
    clippingAccountRefId: z.string().optional(),
  })
  .refine((data) => data.accessToken || (data.instagramId && data.username), {
    message: "Provide an access token (auto-detects the account), or both username and Instagram account ID for mock mode.",
  });
export type CreateInstagramAccountInput = z.infer<typeof createInstagramAccountSchema>;

export const updateInstagramAccountSchema = z.object({
  username: z.string().min(1).optional(),
  displayName: z.string().optional(),
  active: z.boolean().optional(),
  accessToken: z.string().optional(),
  clippingAccountId: z.string().optional(),
  clippingOwnerEmail: z.string().optional(),
  clippingAccountRefId: z.string().nullable().optional(),
});
export type UpdateInstagramAccountInput = z.infer<typeof updateInstagramAccountSchema>;

export const createClippingAccountSchema = z.object({
  label: z.string().min(1),
  email: z.string().min(1).optional(),
  // Optional: defaults to CLIPPING_API_URL server-side (CLIPPING has one known domain today;
  // per-account only in case that ever changes).
  apiUrl: z.string().min(1).optional(),
  campaignId: z.string().min(1),
});
export type CreateClippingAccountInput = z.infer<typeof createClippingAccountSchema>;

export const updateClippingAccountSchema = z.object({
  label: z.string().min(1).optional(),
  email: z.string().min(1).nullable().optional(),
  apiUrl: z.string().min(1).optional(),
  campaignId: z.string().min(1).optional(),
  active: z.boolean().optional(),
});
export type UpdateClippingAccountInput = z.infer<typeof updateClippingAccountSchema>;

export const updateClippingSessionCookieSchema = z.object({
  cookie: z.string().min(1),
  // Decoded client-side by the browser extension from the Supabase access token embedded in
  // the cookie (a JWT — readable without any secret, just base64). Identifies which CLIPPING
  // login is currently active in the browser; optional because older extension versions won't
  // send it, and decoding can fail if Supabase changes its cookie/token shape.
  identity: z
    .object({
      userId: z.string().min(1),
      email: z.string().min(1).nullable(),
    })
    .optional(),
});

export const updateClippingIdentitySchema = z
  .object({
    userId: z.string().min(1).nullable().optional(),
    email: z.string().min(1).nullable().optional(),
    displayName: z.string().min(1).nullable().optional(),
  })
  .refine((data) => data.userId || data.email || data.displayName, {
    message: "Provide at least one of userId, email, or displayName.",
  });
export type UpdateClippingIdentityInput = z.infer<typeof updateClippingIdentitySchema>;
export type UpdateClippingSessionCookieInput = z.infer<typeof updateClippingSessionCookieSchema>;

export const reelsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  status: z.enum(LINK_STATUSES).or(z.literal("all")).default("all"),
  creatorId: z.string().optional(),
  instagramAccountId: z.string().optional(),
  creatorDetectionStatus: z.enum(CREATOR_DETECTION_STATUSES).optional(),
  dateRange: z.enum(DATE_RANGE_PRESETS).default("all"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  sort: z.enum(REEL_SORT_FIELDS).default("newest"),
});
export type ReelsQuery = z.infer<typeof reelsQuerySchema>;

export const linkReelSchema = z.object({
  campaignId: z.string().min(1),
  // Optional now: the server resolves a real bounty tag itself (creator identifier, corrected
  // against CLIPPING's actual bounty list) when omitted — see BountyMatchingService.
  bountyTag: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  notes: z.string().optional(),
});
export type LinkReelInput = z.infer<typeof linkReelSchema>;

export const bulkLinkSchema = z.object({
  reelIds: z.array(z.string().min(1)).min(1),
  campaignId: z.string().min(1),
  bountyTag: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
});
export type BulkLinkInput = z.infer<typeof bulkLinkSchema>;

export const updateClippingBountiesSchema = z.object({
  bounties: z
    .array(
      z.object({
        name: z.string().min(1),
        active: z.boolean(),
        rate: z.string().nullable().optional(),
      })
    )
    .min(1),
});
export type UpdateClippingBountiesInput = z.infer<typeof updateClippingBountiesSchema>;
