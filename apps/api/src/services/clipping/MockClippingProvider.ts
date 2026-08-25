import type {
  ClippingService,
  ClippingSubmissionRaw,
  SubmitClipInput,
} from "./ClippingService.js";
import { ClippingApiError } from "./ClippingService.js";
import { extractReelShortcode } from "@kick-manager/shared";

const PAGE_SIZE = 6;

/** In-memory store standing in for CLIPPING's own database of submitted clips. */
const store: ClippingSubmissionRaw[] = [];
let nextId = 1;

function makeClipId(): string {
  return `clip_mock_${nextId++}`;
}

interface RawPage {
  data: ClippingSubmissionRaw[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean };
}

function fetchPage(page: number): RawPage {
  const total = store.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const data = store.slice(start, start + PAGE_SIZE);
  return {
    data,
    pagination: { page, limit: PAGE_SIZE, total, totalPages, hasNext: page < totalPages },
  };
}

export class MockClippingProvider implements ClippingService {
  async getUploadedClips(): Promise<ClippingSubmissionRaw[]> {
    const collected: ClippingSubmissionRaw[] = [];
    let page = 1;
    // Follow pagination dynamically rather than assuming a fixed total (spec §39).
    while (true) {
      const { data, pagination } = fetchPage(page);
      collected.push(...data);
      if (!pagination.hasNext) break;
      page += 1;
    }
    return collected;
  }

  async submitClip(input: SubmitClipInput): Promise<ClippingSubmissionRaw> {
    const videoId = extractReelShortcode(input.url);
    if (!videoId) {
      throw new ClippingApiError(`Could not extract a Reel ID from URL: ${input.url}`, "malformed");
    }
    const existing = store.find((c) => c.videoId === videoId);
    if (existing) {
      throw new ClippingApiError("This Reel has already been submitted to CLIPPING.", "duplicate");
    }

    const now = new Date();
    const submission: ClippingSubmissionRaw = {
      clippingClipId: makeClipId(),
      socialMediaUsername: null,
      videoId,
      url: input.url,
      thumbnailUrl: null,
      views: 0,
      likes: 0,
      comments: 0,
      isBeingTracked: true,
      bounty: input.bountyTag,
      campaignId: input.campaignId,
      dateAdded: now,
      dateCreated: now,
      lastUpdated: now,
    };
    store.push(submission);
    return submission;
  }

  async getClip(clippingClipId: string): Promise<ClippingSubmissionRaw | null> {
    return store.find((c) => c.clippingClipId === clippingClipId) ?? null;
  }

  async checkSubmission(videoId: string): Promise<ClippingSubmissionRaw | null> {
    return store.find((c) => c.videoId === videoId) ?? null;
  }
}
