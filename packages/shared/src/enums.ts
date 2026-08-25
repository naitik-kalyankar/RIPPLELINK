export const CREATOR_DETECTION_STATUSES = ["detected", "mapped", "unknown", "failed"] as const;
export type CreatorDetectionStatus = (typeof CREATOR_DETECTION_STATUSES)[number];

export const LINK_STATUSES = ["linked", "unlinked", "submitting", "failed", "unknown"] as const;
export type LinkStatus = (typeof LINK_STATUSES)[number];

export const SUBMISSION_ATTEMPT_STATUSES = [
  "ready",
  "uploading",
  "uploaded",
  "failed",
  "already_linked",
] as const;
export type SubmissionAttemptStatus = (typeof SUBMISSION_ATTEMPT_STATUSES)[number];

export const ACTIVITY_LOG_LEVELS = ["info", "warning", "error"] as const;
export type ActivityLogLevel = (typeof ACTIVITY_LOG_LEVELS)[number];

export const REEL_SORT_FIELDS = [
  "newest",
  "oldest",
  "creator",
  "instagram_account",
  "linked_status",
  "views",
  "likes",
  "comments",
] as const;
export type ReelSortField = (typeof REEL_SORT_FIELDS)[number];

export const DATE_RANGE_PRESETS = ["today", "yesterday", "last_7_days", "last_30_days", "custom", "all"] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];
