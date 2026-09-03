import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "./env.js";
import { prisma } from "./db.js";

export interface AuthedUser {
  id: string;
  isAdmin: boolean;
}

// Every request gets request.user set by the onRequest hook below (see server.ts) — routes
// never re-verify a token themselves, they just read request.user.id.
declare module "fastify" {
  interface FastifyRequest {
    user: AuthedUser;
  }
}

// Verifies via Supabase's public JWKS endpoint rather than a shared HS256 secret — works
// whether this project signs tokens with the legacy shared secret or the newer per-project
// asymmetric signing keys (Supabase's "publishable"/"secret" key rollout), and keys rotate
// automatically without needing an env var updated by hand. `createRemoteJWKSet` caches the
// keyset itself, so this doesn't re-fetch it on every request.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    if (!env.supabaseUrl) throw new Error("SUPABASE_URL is not set.");
    jwks = createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", env.supabaseUrl));
  }
  return jwks;
}

// The admin dashboard (/api/admin/*) is meant for exactly one person, not "whoever a DB row
// happens to say is_admin" — a hardcoded email is a second, independent gate on top of the
// profiles.isAdmin flag, so a bug or accidental edit to that single column can never widen
// admin access on its own. Both have to agree. Real security is here (server-side, checked on
// every request) — nothing about the frontend (hiding the nav link, editing isAdmin in
// devtools) can grant access, since every admin route re-derives this from the verified JWT's
// subject on the actual database row, not from anything the client sends or renders.
const ADMIN_EMAIL = "naitikkalyankar107yt@gmail.com";

// Cheap in-memory cache for the is_admin check — it changes rarely (only ever flipped by hand
// in the database) and re-querying Profile on every single request would add a DB round-trip
// to every route for a value that's almost always false. 60s is generous enough that a freshly
// granted admin doesn't have to wait long, without adding real query volume.
const adminCache = new Map<string, { isAdmin: boolean; expiresAt: number }>();
const ADMIN_CACHE_TTL_MS = 60_000;

async function isAdmin(userId: string): Promise<boolean> {
  const cached = adminCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.isAdmin;

  const profile = await prisma.profile.findUnique({ where: { id: userId }, select: { isAdmin: true, email: true } });
  const result = (profile?.isAdmin ?? false) && profile?.email === ADMIN_EMAIL;
  adminCache.set(userId, { isAdmin: result, expiresAt: Date.now() + ADMIN_CACHE_TTL_MS });
  return result;
}

/**
 * Verifies the Supabase access token on every request (Authorization: Bearer <token>) and
 * attaches request.user. No route is exempt — sign-up/sign-in happen directly against Supabase
 * from the frontend, never through this API, so there's nothing here that needs to be public.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  // The only unauthenticated route — needed by uptime checks / orchestration before any user
  // is ever involved.
  if (request.url === "/health") return;

  if (!env.supabaseUrl) {
    reply.status(500).send({
      error: "auth_not_configured",
      message: "SUPABASE_URL is not set on the server.",
    });
    return reply;
  }

  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) {
    reply.status(401).send({ error: "unauthorized", message: "Missing or malformed Authorization header." });
    return reply;
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      // Supabase issues access tokens with these by convention.
      audience: "authenticated",
      issuer: `${env.supabaseUrl}/auth/v1`,
    });
    if (typeof payload.sub !== "string") throw new Error("Token has no subject.");

    request.user = { id: payload.sub, isAdmin: await isAdmin(payload.sub) };
  } catch {
    reply.status(401).send({ error: "unauthorized", message: "Invalid or expired session — sign in again." });
    return reply;
  }
}
