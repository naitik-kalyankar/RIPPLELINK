console.log("[ReelManager ReadMode] background.js started/reloaded at", new Date().toISOString());

const CLIPPING_DOMAIN = "clipping.net";
const APP_ENDPOINT = "http://localhost:4000/api/clipping/session-cookie";
const IDENTITY_ENDPOINT = "http://localhost:4000/api/clipping/identity";
const IDENTITY_CLEAR_ENDPOINT = "http://localhost:4000/api/clipping/identity/clear";
const BOUNTIES_ENDPOINT = "http://localhost:4000/api/clipping/bounties";
// Supabase's SSR auth cookie, possibly chunked across multiple numbered parts
// (sb-<project-ref>-auth-token.0, .1, ...) when the token is long.
const AUTH_COOKIE_PATTERN = /^sb-.*-auth-token(\.\d+)?$/;

async function getAllClippingCookies() {
  // `url` matching (what would actually be sent to this URL) is more reliable than `domain`
  // matching, which can miss host-only cookies or ones scoped to a specific subdomain/path.
  // Try both and de-dupe by name — belt and suspenders while we're debugging why cookies
  // weren't being found at all.
  const [byUrl, byDomain] = await Promise.all([
    chrome.cookies.getAll({ url: `https://${CLIPPING_DOMAIN}` }),
    chrome.cookies.getAll({ domain: CLIPPING_DOMAIN }),
  ]);
  const byName = new Map();
  for (const c of [...byUrl, ...byDomain]) byName.set(c.name, c);
  return Array.from(byName.values());
}

async function buildCookieHeader() {
  const allCookies = await getAllClippingCookies();
  const authCookies = allCookies
    .filter((c) => AUTH_COOKIE_PATTERN.test(c.name))
    .sort((a, b) => {
      const partOf = (name) => Number(name.split(".").pop()) || 0;
      return partOf(a.name) - partOf(b.name);
    });

  console.log(
    `[clipping-cookie-sync] found ${allCookies.length} cookie(s) for ${CLIPPING_DOMAIN}: ` +
      `[${allCookies.map((c) => c.name).join(", ")}] — ${authCookies.length} matched the auth pattern.`
  );

  if (authCookies.length === 0) {
    return { header: null, seenCookieNames: allCookies.map((c) => c.name) };
  }
  return { header: authCookies.map((c) => `${c.name}=${c.value}`).join("; "), seenCookieNames: allCookies.map((c) => c.name) };
}

async function setStatus(status, extra = {}) {
  await chrome.storage.local.set({ lastSync: { status, at: new Date().toISOString(), ...extra } });
}

function base64UrlDecode(segment) {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(segment.length + ((4 - (segment.length % 4)) % 4), "=");
  return decodeURIComponent(
    atob(padded)
      .split("")
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
  );
}

// Which CLIPPING account is logged in, decoded straight out of the Supabase access token
// (a JWT — its payload is base64, not encrypted, so this needs no network call and no secret)
// embedded somewhere in the raw cookie header. Deliberately doesn't assume the exact cookie
// envelope format (Supabase's SSR cookie shape has changed across versions and can nest the
// session JSON inside an outer `base64-<...>` blob) — so this unwraps each cookie value's
// `base64-` prefix if present, then scans everything (both the unwrapped and raw text) for
// anything that looks like a JWT, decoding the first one whose payload has a `sub` claim
// (that's the access token; the refresh token isn't a JWT).
function decodeIdentityFromCookieHeader(cookieHeader) {
  const raw = decodeURIComponent(cookieHeader);
  const unwrapped = raw
    .split("; ")
    .map((pair) => {
      const eq = pair.indexOf("=");
      const value = eq === -1 ? pair : pair.slice(eq + 1);
      if (!value.startsWith("base64-")) return "";
      try {
        return atob(value.slice("base64-".length));
      } catch {
        return "";
      }
    })
    .join(" ");

  const jwtPattern = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
  const candidates = [...(raw.match(jwtPattern) ?? []), ...(unwrapped.match(jwtPattern) ?? [])];

  for (const token of candidates) {
    try {
      const payload = JSON.parse(base64UrlDecode(token.split(".")[1]));
      if (payload?.sub) {
        return { userId: payload.sub, email: payload.email ?? null };
      }
    } catch {
      // not a decodable/relevant JWT — try the next candidate
    }
  }
  return null;
}

async function pushIdentity(partial) {
  try {
    await fetch(IDENTITY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
  } catch {
    // best-effort — identity is a nice-to-have surfaced in the app UI, not load-bearing
  }
}

async function clearIdentity() {
  try {
    await fetch(IDENTITY_CLEAR_ENDPOINT, { method: "POST" });
  } catch {
    // best-effort
  }
}

async function pushBounties(bounties) {
  try {
    await fetch(BOUNTIES_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bounties }),
    });
    console.log("[ReelManager ReadMode] reported", bounties.length, "bounty card(s) to the app");
  } catch {
    // best-effort — bounty auto-correction degrades gracefully when this hasn't synced yet
  }
}

// `cookieHeaderOverride` comes from the content script (content.js reading document.cookie
// on the actual page) — the reliable path in browsers like Brave that block the
// chrome.cookies extension API outright. Falls back to chrome.cookies when no override is
// given, which still works fine in browsers that don't restrict it (e.g. stock Chrome).
async function syncCookie(cookieHeaderOverride) {
  let cookieHeader = cookieHeaderOverride;
  let seenCookieNames = [];

  if (!cookieHeader) {
    const result = await buildCookieHeader();
    cookieHeader = result.header;
    seenCookieNames = result.seenCookieNames;
  }

  if (!cookieHeader) {
    await setStatus("no_cookie", { seenCookieNames });
    await clearIdentity();
    return {
      ok: false,
      reason:
        seenCookieNames.length > 0
          ? `Found ${seenCookieNames.length} cookie(s) for clipping.net but none matched the expected auth pattern: ${seenCookieNames.join(", ")}`
          : "No cookie found yet — open a clipping.net tab (logged in) so its content script can report one.",
    };
  }

  try {
    const identity = decodeIdentityFromCookieHeader(cookieHeader);
    if (identity) {
      console.log("[ReelManager ReadMode] decoded CLIPPING identity:", identity.email ?? identity.userId);
    }

    const response = await fetch(APP_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookie: cookieHeader, identity: identity ?? undefined }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || `Request failed with status ${response.status}`);
    }

    await setStatus("success", { identity });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setStatus("error", { message });
    return { ok: false, reason: message };
  }
}

// Supabase's SSR session refreshes itself via the site's own client-side JS re-running its
// session bootstrap on page load — that only happens while some clipping.net page is actually
// loaded. If the cookie's gone stale (or missing entirely) and no tab is open to refresh it,
// nothing will ever fix that on its own. This opens (or reloads) a clipping.net tab so its own
// page can do that refresh, without requiring the user to go do it by hand.
let pendingRefreshTabId = null;

async function refreshClippingSession() {
  if (pendingRefreshTabId !== null) return; // already refreshing — don't stack attempts

  await setStatus("refreshing");

  const existingTabs = await chrome.tabs.query({ url: `https://${CLIPPING_DOMAIN}/*` });
  if (existingTabs.length > 0) {
    // A tab's already open but its cookie still isn't usable — reload it so the page's own
    // Supabase client re-runs its session bootstrap (which refreshes the token if it's just
    // stale, or surfaces a login screen if the session is truly gone).
    const tab = existingTabs[0];
    if (tab.id) {
      try {
        await chrome.tabs.reload(tab.id);
      } catch {
        // tab may have closed between the query and the reload — nothing to do
      }
    }
    return;
  }

  // No clipping.net tab open at all — open one in the background (not `active`, so it doesn't
  // yank focus away from whatever the user's doing), give it long enough to load and let
  // inject.js/content.js report a fresh cookie through the normal COOKIE_FROM_PAGE flow, then
  // close it automatically so it doesn't linger as a stray tab.
  try {
    const tab = await chrome.tabs.create({ url: `https://${CLIPPING_DOMAIN}/`, active: false });
    if (!tab.id) return;
    pendingRefreshTabId = tab.id;
    setTimeout(async () => {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {
        // already closed (e.g. the user closed it themselves) — fine either way
      }
      pendingRefreshTabId = null;
    }, 8000);
  } catch (error) {
    pendingRefreshTabId = null;
    console.log("[clipping-cookie-sync] couldn't open a background refresh tab:", error);
  }
}

let debounceTimer = null;

// Supabase rotates the cookie roughly hourly — sync as soon as it changes rather than
// waiting on the periodic fallback below. Changes to the .0/.1 parts often land as separate
// events milliseconds apart, so debounce briefly to send one combined header, not several.
chrome.cookies.onChanged.addListener((changeInfo) => {
  const { cookie } = changeInfo;
  if (!cookie.domain.includes(CLIPPING_DOMAIN) || !AUTH_COOKIE_PATTERN.test(cookie.name)) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(syncCookie, 1500);
});

// Safety net in case the change listener ever misses an update (e.g. service worker was
// asleep when it fired) — chrome.alarms survives the worker being suspended between runs.
// If that check comes back empty, refresh proactively rather than silently sitting on a dead
// session until someone happens to click the popup.
chrome.alarms.create("periodic-sync", { periodInMinutes: 15 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "periodic-sync") return;
  const result = await syncCookie();
  if (!result.ok) await refreshClippingSession();
});

async function handleSyncNow() {
  // Prefer asking any open clipping.net tab's content script to resend via document.cookie —
  // works even where chrome.cookies is blocked (confirmed: Brave). It reports back
  // asynchronously as a separate COOKIE_FROM_PAGE message, not as this call's return value.
  const tabs = await chrome.tabs.query({ url: "https://clipping.net/*" });
  for (const tab of tabs) {
    if (tab.id) chrome.tabs.sendMessage(tab.id, { type: "REQUEST_COOKIE" }).catch(() => {});
  }

  if (tabs.length === 0) {
    // No clipping.net tab open — try chrome.cookies first (still works in stock Chrome), and
    // only fall back to opening a background tab if that comes up empty too.
    const result = await syncCookie();
    if (result.ok) return result;
    await refreshClippingSession();
    return { ok: false, reason: "No clipping.net tab was open — opening one in the background to refresh the session. Check again shortly." };
  }

  await new Promise((resolve) => setTimeout(resolve, 800));
  const { lastSync } = await chrome.storage.local.get("lastSync");
  if (lastSync?.status === "success") return { ok: true };

  // A tab was open but still didn't yield a usable cookie — likely a genuinely expired/
  // logged-out session rather than a sleepy service worker. Reload it to force a refresh.
  await refreshClippingSession();
  return { ok: false, reason: "Session looked stale — reloading clipping.net to refresh it. Check again in a moment." };
}

// Read mode: caps how much we retain so this never grows unbounded over a long browsing
// session. Keyed by "METHOD /normalized/path" so repeat calls to the same endpoint (e.g.
// paginated clip lists) collapse into one entry with the latest sample + a hit count, instead
// of piling up duplicates.
const MAX_READ_MODE_ENTRIES = 60;

async function recordApiCapture(entry) {
  const { readModeCaptures = {} } = await chrome.storage.local.get("readModeCaptures");
  const key = `${entry.method} ${entry.host}${entry.path}`;
  const existing = readModeCaptures[key];
  readModeCaptures[key] = {
    host: entry.host,
    method: entry.method,
    path: entry.path,
    query: entry.query,
    status: entry.status,
    sampleBody: entry.body,
    hitCount: (existing?.hitCount ?? 0) + 1,
    firstSeen: existing?.firstSeen ?? entry.capturedAt,
    lastSeen: entry.capturedAt,
  };

  const keys = Object.keys(readModeCaptures);
  if (keys.length > MAX_READ_MODE_ENTRIES) {
    // Evict the least-recently-seen entries first.
    keys
      .sort((a, b) => new Date(readModeCaptures[a].lastSeen) - new Date(readModeCaptures[b].lastSeen))
      .slice(0, keys.length - MAX_READ_MODE_ENTRIES)
      .forEach((k) => delete readModeCaptures[k]);
  }

  await chrome.storage.local.set({ readModeCaptures });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "COOKIE_FROM_PAGE") {
    syncCookie(message.cookie);
    return; // fire-and-forget; content.js doesn't wait on a response
  }
  if (message?.type === "COOKIE_CLEARED") {
    setStatus("no_cookie", { seenCookieNames: [] });
    clearIdentity();
    return; // fire-and-forget
  }
  if (message?.type === "SYNC_NOW") {
    handleSyncNow().then(sendResponse);
    return true; // keep the message channel open for the async response
  }
  if (message?.type === "API_CAPTURE") {
    recordApiCapture(message.entry);
    return; // fire-and-forget
  }
  if (message?.type === "IDENTITY_FROM_PAGE") {
    pushIdentity({ email: message.identity.email, displayName: message.identity.displayName });
    return; // fire-and-forget
  }
  if (message?.type === "BOUNTIES_FROM_PAGE") {
    pushBounties(message.bounties);
    return; // fire-and-forget
  }
});
