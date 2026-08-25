import { env } from "../../lib/env.js";
import { recordIntegrationError, recordIntegrationSuccess } from "../../lib/integrationHealth.js";
import type {
  ClippingService,
  ClippingSubmissionRaw,
  SubmitClipInput,
} from "./ClippingService.js";
import { ClippingApiError } from "./ClippingService.js";

/**
 * CLIPPING has no official/public API. This talks to the same two endpoints CLIPPING's own
 * web dashboard calls, authenticated by replaying a logged-in browser session (a Supabase
 * auth cookie) rather than an API key — there is no other working auth mechanism. This is
 * inherently fragile:
 *
 *   - The session cookie is a short-lived Supabase access token (~1hr). CLIPPING_SESSION_COOKIE
 *     must be refreshed by hand (copy the `Cookie` request header from devtools) whenever
 *     requests start failing with 401s. There is no auto-refresh here by design — see the
 *     project decision log for why.
 *   - Endpoint shapes below were observed directly from the browser, not from documentation,
 *     and may change without notice.
 *
 *   POST {CLIPPING_API_URL}/api/clipper/clips
 *   { accountId, bountyTag, campaignId, isBountySubmission, isSpecialUpload, notes,
 *     platform, specialUploadTag, url }
 *   -> { success, data: { _id, socialMediaUsername, socialMedia, videoId, url, thumbnailUrl,
 *        views, likes, comments, isBeingTracked, bounty, cycleId, dateAdded, dateCreated,
 *        lastUpdated }, message }
 *
 *   GET {CLIPPING_API_URL}/api/campaigns/{CLIPPING_CAMPAIGN_ID}/clips
 *       ?page=1&limit=20&search=&sortBy=dateCreated&sortOrder=desc
 *       &minViews=0&maxViews=1000000000&dateRange=all&status=all
 *   -> { success, data: { clips: [ { _id, videoId, url, thumbnailUrl, socialMediaUsername,
 *        bounty, views, likes, comments, isBeingTracked, dateAdded, dateCreated, lastUpdated,
 *        ... } ], pagination: { page, limit, total, totalPages, hasNext, hasPrev } }, message }
 *
 * No single-clip-by-id endpoint has been observed, so `getClip` stays unimplemented rather
 * than guessing one — it isn't on the critical path (duplicate checks use `checkSubmission`,
 * which scans the list endpoint instead).
 */
export class HttpClippingProvider implements ClippingService {
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    try {
      const body = await this.requestInner<T>(path, init);
      recordIntegrationSuccess("clipping");
      return body;
    } catch (error) {
      if (error instanceof ClippingApiError) recordIntegrationError("clipping", error.message);
      throw error;
    }
  }

  private async requestInner<T>(path: string, init: RequestInit): Promise<T> {
    if (!env.clipping.apiUrl || !env.clipping.sessionCookie || !env.clipping.campaignId) {
      throw new ClippingApiError(
        "CLIPPING_API_URL / CLIPPING_SESSION_COOKIE / CLIPPING_CAMPAIGN_ID are not configured.",
        "auth"
      );
    }

    let response: Response;
    try {
      response = await fetch(`${env.clipping.apiUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Cookie: env.clipping.sessionCookie,
          ...init.headers,
        },
      });
    } catch {
      throw new ClippingApiError("Network error contacting CLIPPING.", "network");
    }

    if (response.status === 401 || response.status === 403) {
      throw new ClippingApiError(
        "CLIPPING session expired or invalid — refresh CLIPPING_SESSION_COOKIE with a fresh " +
          "value copied from your logged-in browser session (devtools → Network → any " +
          "clipping.net request → Request Headers → Cookie).",
        "auth"
      );
    }
    if (response.status === 429) {
      throw new ClippingApiError("CLIPPING rate limit exceeded.", "rate_limit");
    }
    if (!response.ok) {
      let detail = "";
      try {
        const errorBody = (await response.json()) as { message?: string; error?: string };
        detail = errorBody.message ?? errorBody.error ?? "";
      } catch {
        // response body wasn't JSON — fall back to the bare status
      }
      throw new ClippingApiError(
        `CLIPPING request failed with status ${response.status}${detail ? `: ${detail}` : "."}`,
        response.status === 400 ? "malformed" : "unavailable"
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ClippingApiError("CLIPPING returned a malformed response.", "malformed");
    }
    return body as T;
  }

  async submitClip(input: SubmitClipInput): Promise<ClippingSubmissionRaw> {
    interface SubmitResponse {
      success?: boolean;
      data?: RawClip;
      message?: string;
    }

    const body = await this.request<SubmitResponse>("/api/clipper/clips", {
      method: "POST",
      body: JSON.stringify({
        accountId: input.accountId ?? null,
        bountyTag: input.bountyTag,
        campaignId: input.campaignId,
        isBountySubmission: true,
        isSpecialUpload: false,
        notes: input.notes ?? "",
        platform: "instagram",
        specialUploadTag: null,
        url: input.url,
      }),
    });

    if (!body?.success || !body.data?.videoId || !body.data?._id) {
      throw new ClippingApiError(body?.message ?? "CLIPPING submission response was malformed.", "malformed");
    }

    return toSubmissionRaw(body.data, input.campaignId, input.url, input.bountyTag);
  }

  async getUploadedClips(): Promise<ClippingSubmissionRaw[]> {
    interface ListResponse {
      success?: boolean;
      data?: { clips?: RawClip[]; pagination?: { hasNext?: boolean } };
      message?: string;
    }

    const collected: ClippingSubmissionRaw[] = [];
    let page = 1;

    // Follow pagination dynamically rather than assuming a fixed total (spec §39).
    while (true) {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        search: "",
        sortBy: "dateCreated",
        sortOrder: "desc",
        minViews: "0",
        maxViews: "1000000000",
        dateRange: "all",
        status: "all",
      });

      const body = await this.request<ListResponse>(
        `/api/campaigns/${env.clipping.campaignId}/clips?${params.toString()}`
      );

      if (!body?.success || !body.data) {
        throw new ClippingApiError(body?.message ?? "CLIPPING clips list response was malformed.", "malformed");
      }

      for (const raw of body.data.clips ?? []) {
        if (!raw.videoId || !raw._id) continue; // skip malformed rows rather than crash the whole sync
        collected.push(toSubmissionRaw(raw, env.clipping.campaignId ?? null, raw.url ?? "", raw.bounty ?? null));
      }

      if (!body.data.pagination?.hasNext) break;
      page += 1;
    }

    return collected;
  }

  async getClip(): Promise<ClippingSubmissionRaw | null> {
    throw new ClippingApiError(
      "HttpClippingProvider.getClip is pending: no single-clip endpoint has been confirmed yet.",
      "unavailable"
    );
  }

  async checkSubmission(videoId: string): Promise<ClippingSubmissionRaw | null> {
    const all = await this.getUploadedClips();
    return all.find((clip) => clip.videoId === videoId) ?? null;
  }
}

interface RawClip {
  _id?: string;
  socialMediaUsername?: string;
  videoId?: string;
  url?: string;
  thumbnailUrl?: string;
  views?: number;
  likes?: number;
  comments?: number;
  isBeingTracked?: boolean;
  bounty?: string;
  dateAdded?: string;
  dateCreated?: string;
  lastUpdated?: string;
}

function toSubmissionRaw(
  raw: RawClip,
  campaignId: string | null,
  fallbackUrl: string,
  fallbackBounty: string | null
): ClippingSubmissionRaw {
  return {
    clippingClipId: raw._id!,
    socialMediaUsername: raw.socialMediaUsername ?? null,
    videoId: raw.videoId!,
    url: raw.url ?? fallbackUrl,
    thumbnailUrl: raw.thumbnailUrl ?? null,
    views: raw.views ?? null,
    likes: raw.likes ?? null,
    comments: raw.comments ?? null,
    isBeingTracked: raw.isBeingTracked ?? true,
    bounty: raw.bounty ?? fallbackBounty,
    campaignId,
    dateAdded: raw.dateAdded ? new Date(raw.dateAdded) : null,
    dateCreated: raw.dateCreated ? new Date(raw.dateCreated) : null,
    lastUpdated: raw.lastUpdated ? new Date(raw.lastUpdated) : null,
  };
}
