export interface ClippingSubmissionRaw {
  clippingClipId: string;
  socialMediaUsername: string | null;
  videoId: string;
  url: string;
  thumbnailUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  isBeingTracked: boolean;
  bounty: string | null;
  campaignId: string | null;
  dateAdded: Date | null;
  dateCreated: Date | null;
  lastUpdated: Date | null;
}

export interface SubmitClipInput {
  accountId?: string;
  bountyTag: string;
  campaignId: string;
  url: string;
  notes?: string;
}

export class ClippingApiError extends Error {
  constructor(
    message: string,
    public readonly reason: "timeout" | "rate_limit" | "duplicate" | "auth" | "unavailable" | "malformed" | "network" | "unknown"
  ) {
    super(message);
    this.name = "ClippingApiError";
  }
}

/**
 * Abstraction over the CLIPPING integration. No official/public CLIPPING API is documented,
 * so only the interface + a mock provider are wired up by default; a real HTTP provider is
 * written against the observed endpoint shapes but stays isolated behind this interface and is
 * only selected when CLIPPING_API_URL / CLIPPING_SESSION_COOKIE / CLIPPING_CAMPAIGN_ID are
 * configured server-side (see HttpClippingProvider for why it's cookie-based, not a key).
 */
export interface ClippingService {
  getUploadedClips(): Promise<ClippingSubmissionRaw[]>;
  submitClip(input: SubmitClipInput): Promise<ClippingSubmissionRaw>;
  getClip(clippingClipId: string): Promise<ClippingSubmissionRaw | null>;
  checkSubmission(videoId: string): Promise<ClippingSubmissionRaw | null>;
}
