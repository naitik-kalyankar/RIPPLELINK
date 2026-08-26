import type {
  ActivityLogLevel,
  CreatorDetectionStatus,
  LinkStatus,
  SubmissionAttemptStatus,
} from "./enums.js";

export interface InstagramAccount {
  id: string;
  instagramId: string;
  username: string;
  displayName: string | null;
  active: boolean;
  // The access token is never serialized to the frontend; this just says whether one is set,
  // so the UI can show "Live" vs "Mock" per account without exposing the credential.
  hasAccessToken: boolean;
  // CLIPPING's internal ID for this Instagram account — not a secret, safe to send as-is.
  clippingAccountId: string | null;
  // Which CLIPPING login (by email) this Instagram account is registered under — manually
  // tagged for now. Not a secret.
  clippingOwnerEmail: string | null;
  // Which ClippingAccount (real row, Playwright-backed session) this account is linked to.
  // Additive alongside clippingOwnerEmail above — null means "use the legacy singleton".
  clippingAccountRefId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClippingAccount {
  id: string;
  label: string;
  email: string | null;
  apiUrl: string;
  campaignId: string;
  active: boolean;
  lastUsedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Creator {
  id: string;
  detectedIdentifier: string;
  displayName: string;
  active: boolean;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ClippingSubmission {
  id: string;
  reelId: string | null;
  clippingClipId: string;
  videoId: string;
  campaignId: string | null;
  bountyTag: string | null;
  clippingUrl: string | null;
  status: string;
  isBeingTracked: boolean;
  views: number | null;
  likes: number | null;
  comments: number | null;
  dateAdded: string | null;
  dateCreated: string | null;
  lastUpdated: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionAttempt {
  id: string;
  reelId: string;
  status: SubmissionAttemptStatus;
  errorMessage: string | null;
  attemptedAt: string;
}

export interface Reel {
  id: string;
  instagramAccountId: string;
  instagramAccount: {
    id: string;
    username: string;
    displayName: string | null;
  };
  instagramReelId: string;
  instagramUrl: string;
  thumbnailUrl: string;
  publishedAt: string | null;
  views: number | null;
  creatorId: string | null;
  creator: Creator | null;
  creatorDetectionStatus: CreatorDetectionStatus;
  linkStatus: LinkStatus;
  clippingSubmission: ClippingSubmission | null;
  latestAttempt: SubmissionAttempt | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLogEntry {
  id: string;
  message: string;
  level: ActivityLogLevel;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export interface DashboardStats {
  totalReels: number;
  linked: number;
  unlinked: number;
  creators: number;
  instagramAccounts: number;
  failedSubmissions: number;
  // Sum of (views / 100,000) * bounty rate across submissions whose bountyTag matches a known
  // ClippingBounty rate (format "$X/100K", scraped from CLIPPING's campaign page). Submissions
  // with no views yet or an unrecognized/missing bounty tag are excluded, not treated as $0.
  // In "live" mode, a submission under 1,000 views is also excluded (hasn't cleared CLIPPING's
  // own qualifying threshold yet).
  estimatedPayout: number;
  // Sum of views across exactly the submissions counted into estimatedPayout above — lets the
  // UI show what the payout figure was actually computed from.
  qualifyingViews: number;
}

export interface ClippingBounty {
  id: string;
  name: string;
  active: boolean;
  rate: string | null;
  lastSeenAt: string;
}

export interface SyncResult {
  instagramReelsFetched: number;
  instagramReelsUpserted: number;
  creatorsDetected: number;
  clippingSubmissionsFetched: number;
  clippingSubmissionsUpserted: number;
  newlyLinked: number;
  newlyUnlinked: number;
  errors: string[];
}
