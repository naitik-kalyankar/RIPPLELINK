import { extractReelShortcode } from "@kick-manager/shared";
import { recordIntegrationError, recordIntegrationSuccess } from "../../lib/integrationHealth.js";
import type { FetchedReel, InstagramAccountRef, InstagramService } from "./InstagramService.js";

const GRAPH_BASE = "https://graph.instagram.com/v26.0";
const MEDIA_FIELDS = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp";

interface MediaNode {
  id: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
}

interface MediaPage {
  data?: MediaNode[];
  paging?: { next?: string };
  error?: { message?: string; type?: string; code?: number };
}

/**
 * Real Instagram Graph API integration (Instagram API with Instagram Login —
 * graph.instagram.com), documented at developers.facebook.com/docs/instagram-platform.
 *
 * Each Instagram Business/Creator account has its own access token, generated for that
 * specific account via Graph API Explorer's "Generate Instagram Access Token" flow — a
 * token only works for the account it was issued against, so it's stored per-account
 * (InstagramAccount.accessToken) rather than as a single global credential.
 *
 * Tokens are long-lived (~60 days) with a documented refresh endpoint
 * (GET /refresh_access_token?grant_type=ig_refresh_token) — not wired up here; refresh by
 * regenerating from Graph API Explorer and updating that account's token before it expires.
 */
export class OfficialInstagramProvider implements InstagramService {
  async listAccountReels(account: InstagramAccountRef): Promise<FetchedReel[]> {
    // Per-account key ("instagram:<id>", mirroring CLIPPING's "clipping:<id>") — a single
    // shared "instagram" key meant one account's failure could silently clear (or set) every
    // other account's health depending on request order, since each recordIntegrationSuccess/
    // Error call would overwrite the same global entry regardless of which account it was for.
    const healthKey = `instagram:${account.id}`;
    try {
      const reels = await this.fetchReels(account);
      recordIntegrationSuccess(healthKey);
      return reels;
    } catch (error) {
      recordIntegrationError(healthKey, error instanceof Error ? error.message : "Unknown Instagram error.");
      throw error;
    }
  }

  private async fetchReels(account: InstagramAccountRef): Promise<FetchedReel[]> {
    if (!account.accessToken) {
      throw new Error(`No access token configured for @${account.username}.`);
    }

    const reels: FetchedReel[] = [];
    let url: string | undefined =
      `${GRAPH_BASE}/${account.instagramId}/media?fields=${MEDIA_FIELDS}&access_token=${account.accessToken}`;

    while (url) {
      let response: Response;
      try {
        response = await fetch(url);
      } catch {
        throw new Error(`Network error contacting Instagram for @${account.username}.`);
      }

      const body = (await response.json().catch(() => null)) as MediaPage | null;

      if (!response.ok || !body || body.error) {
        const message = body?.error?.message ?? `Instagram request failed with status ${response.status}.`;
        throw new Error(`Instagram API error for @${account.username}: ${message}`);
      }

      for (const node of body.data ?? []) {
        // This endpoint returns every media type (photos, feed videos, Reels) — only Reels
        // belong in this app, so filter on media_product_type rather than media_type.
        if (node.media_product_type !== "REELS") continue;
        if (!node.permalink) continue;

        const shortcode = extractReelShortcode(node.permalink);
        if (!shortcode) continue;

        reels.push({
          instagramReelId: shortcode,
          instagramUrl: node.permalink,
          thumbnailUrl: node.thumbnail_url ?? node.media_url ?? "",
          publishedAt: node.timestamp ? new Date(node.timestamp) : null,
          views: await this.fetchViews(node.id, account.accessToken),
        });
      }

      url = body.paging?.next;
    }

    return reels;
  }

  // Views aren't on the media node itself — only available via the per-media insights
  // endpoint, and only when the token was granted `instagram_manage_insights`. Failures here
  // (missing scope, rate limit) shouldn't break the whole sync, so this degrades to null
  // rather than throwing.
  private async fetchViews(mediaId: string, accessToken?: string | null): Promise<number | null> {
    if (!accessToken) return null;
    try {
      const response = await fetch(
        `${GRAPH_BASE}/${mediaId}/insights?metric=views&access_token=${accessToken}`
      );
      const body = (await response.json().catch(() => null)) as
        | { data?: Array<{ name?: string; values?: Array<{ value?: number }> }>; error?: unknown }
        | null;
      if (!response.ok || !body || body.error) return null;
      const metric = body.data?.find((entry) => entry.name === "views");
      const value = metric?.values?.[0]?.value;
      return typeof value === "number" ? value : null;
    } catch {
      return null;
    }
  }
}

/**
 * `/me` resolves to whichever account the access token belongs to — the token itself
 * identifies the account, so the numeric Instagram account ID and username can be
 * auto-detected from it rather than requiring the user to look them up and paste them in.
 */
export async function fetchInstagramIdentity(accessToken: string): Promise<{ id: string; username: string }> {
  let response: Response;
  try {
    response = await fetch(`${GRAPH_BASE}/me?fields=id,username&access_token=${accessToken}`);
  } catch {
    throw new Error("Network error contacting Instagram to detect account identity.");
  }

  const body = (await response.json().catch(() => null)) as
    | { id?: string; username?: string; error?: { message?: string } }
    | null;

  if (!response.ok || !body || body.error) {
    throw new Error(body?.error?.message ?? `Could not detect Instagram identity (status ${response.status}).`);
  }
  if (!body.id || !body.username) {
    throw new Error("Instagram's response was missing id/username.");
  }

  return { id: body.id, username: body.username };
}
