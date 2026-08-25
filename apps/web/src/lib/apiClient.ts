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
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      // Fastify's default JSON parser rejects an empty body sent with Content-Type:
      // application/json (FST_ERR_CTP_EMPTY_JSON_BODY) — only set the header when there's
      // actually a body, so no-payload calls like POST /api/sync/all don't 500.
      headers: { ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}), ...init?.headers },
    });
  } catch {
    throw new ApiError("Could not reach the Reel Manager API. Is the backend running?", 0, "network");
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
};
