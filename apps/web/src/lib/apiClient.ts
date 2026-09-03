import { supabase } from "@/lib/supabaseClient";

// Deliberately localhost, not a shared LAN host — apps/api's Playwright login window can only
// ever open on whichever machine is running it, so every RIPPLELINK install needs its OWN local
// apps/api (see apps/api/README or ask Naitik for setup help), not one shared instance. They all
// point at the same Supabase database regardless, so accounts/Reels stay unified either way.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Every apps/api route requires auth (see server.ts's onRequest hook) — attach the current
  // Supabase session's access token here, the single choke point all requests already go
  // through, rather than at every call site.
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      // Fastify's default JSON parser rejects an empty body sent with Content-Type:
      // application/json (FST_ERR_CTP_EMPTY_JSON_BODY) — only set the header when there's
      // actually a body, so no-payload calls like POST /api/sync/all don't 500.
      headers: {
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Could not reach the RIPPLELINK API. Is the backend running?", 0, "network");
  }

  if (!response.ok) {
    let body: { message?: string; error?: string } = {};
    try {
      body = await response.json();
    } catch {
      // non-JSON error body, fall through to generic message
    }
    throw new ApiError(body.message ?? `Request failed with status ${response.status}`, response.status, body.error);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
