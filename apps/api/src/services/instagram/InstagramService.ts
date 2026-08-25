export interface FetchedReel {
  instagramReelId: string;
  instagramUrl: string;
  thumbnailUrl: string;
  publishedAt: Date | null;
  views: number | null;
}

export interface InstagramAccountRef {
  instagramId: string;
  username: string;
  // Per-account Graph API access token — each Instagram Business account's token only works
  // for that account, so this is no longer a single global credential (see env.ts history).
  accessToken?: string | null;
}

/**
 * Abstraction over "wherever Reel metadata comes from." The rest of the app never talks to
 * Instagram directly — only through this interface, so a real provider can be swapped in
 * later without touching services/routes/UI.
 */
export interface InstagramService {
  listAccountReels(account: InstagramAccountRef): Promise<FetchedReel[]>;
}
