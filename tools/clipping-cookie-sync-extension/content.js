// Runs in the actual clipping.net page context. This is the fallback/primary path for
// browsers (Brave, confirmed) that block the chrome.cookies extension API even with the
// "cookies" permission granted — reading via document.cookie is a completely different
// mechanism (identical to what the page's own JS does) and isn't gated by that restriction.
// Only works because these particular auth cookies aren't HttpOnly — confirmed via devtools.
const AUTH_COOKIE_PATTERN = /^sb-.*-auth-token(\.\d+)?$/;

function readAuthCookieHeader() {
  const pairs = document.cookie
    .split("; ")
    .filter(Boolean)
    .map((entry) => {
      const eq = entry.indexOf("=");
      return { name: entry.slice(0, eq), value: entry.slice(eq + 1) };
    });

  const matched = pairs
    .filter((c) => AUTH_COOKIE_PATTERN.test(c.name))
    .sort((a, b) => {
      const partOf = (name) => Number(name.split(".").pop()) || 0;
      return partOf(a.name) - partOf(b.name);
    });

  if (matched.length === 0) return null;
  return matched.map((c) => `${c.name}=${c.value}`).join("; ");
}

let lastSent = null;
// Starts false so the very first check after a page load/extension reload — even if the
// session is already logged out at that point — still reports it, instead of only detecting
// a login→logout *transition* and missing a logout that happened before this script ran.
let hasReportedLoggedOut = false;

function reportToBackground() {
  const header = readAuthCookieHeader();
  if (header) {
    hasReportedLoggedOut = false;
    if (header === lastSent) return;
    lastSent = header;
    chrome.runtime.sendMessage({ type: "COOKIE_FROM_PAGE", cookie: header });
    return;
  }

  lastSent = null;
  if (hasReportedLoggedOut) return;
  hasReportedLoggedOut = true;
  // No auth cookie at all — logged out (or session cleared). The app has no other way to
  // learn this on its own, since nothing calls it when a cookie merely disappears.
  chrome.runtime.sendMessage({ type: "COOKIE_CLEARED" });
}

reportToBackground();
// Supabase can silently refresh the token client-side without a full page reload — recheck
// periodically while this tab stays open rather than only on load.
setInterval(reportToBackground, 60_000);

// Lets the "Sync Now" popup button force an immediate re-check on any open clipping.net tab.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "REQUEST_COOKIE") {
    lastSent = null; // force resend even if the value hasn't changed since last report
    reportToBackground();
  }
});

// Read mode: inject.js (running in the page's own MAIN world, see manifest.json) posts every
// clipping.net API response it observes via window.postMessage — relay those into the
// extension's isolated world so background.js can persist them to chrome.storage.local.
console.log("[ReelManager ReadMode] content.js active on", location.href);

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.source !== "__reelManagerReadMode__") return;
  chrome.runtime.sendMessage({ type: "API_CAPTURE", entry: event.data.entry }).catch(() => {});
});

// The signed-in account's name/email is rendered directly into the page's HTML (the sidebar
// account switcher — a dropdown-menu trigger wrapping an avatar fallback + two <p> tags: name,
// then email), not fetched via any XHR/fetch our read mode can see. Scraping the DOM directly
// is more reliable than decoding it out of the session cookie anyway, since it's exactly what
// a human reads to tell accounts apart.
function scrapeAccountIdentity() {
  const triggers = document.querySelectorAll('[data-slot="dropdown-menu-trigger"]');
  for (const trigger of triggers) {
    if (!trigger.querySelector('[data-slot="avatar-fallback"]')) continue;
    const paragraphs = trigger.querySelectorAll("p");
    if (paragraphs.length < 2) continue;
    const email = paragraphs[1].textContent?.trim();
    if (!email || !email.includes("@")) continue;
    return { displayName: paragraphs[0].textContent?.trim() || null, email };
  }
  return null;
}

let lastSentIdentity = null;

function reportIdentityToBackground() {
  const identity = scrapeAccountIdentity();
  if (!identity) return;
  const key = `${identity.displayName ?? ""}|${identity.email}`;
  if (key === lastSentIdentity) return;
  lastSentIdentity = key;
  chrome.runtime.sendMessage({ type: "IDENTITY_FROM_PAGE", identity }).catch(() => {});
}

// The sidebar can render after content.js runs (React streaming SSR — visible in devtools as
// <template> Suspense boundaries that fill in a moment later), so a single check on load isn't
// enough; watch for it to show up, then keep rechecking occasionally in case the user switches
// accounts without a full page reload.
reportIdentityToBackground();
const identityObserver = new MutationObserver(() => reportIdentityToBackground());
identityObserver.observe(document.body, { childList: true, subtree: true });
setInterval(reportIdentityToBackground, 30_000);

// Bounty cards on a campaign page (also server-rendered, same reasoning as the identity
// sidebar above) — each is a `div.rounded-lg.border.p-4.space-y-3` containing an `h4` (name),
// a `[data-slot="badge"]` ("Active" / "Disabled"), and a "$X/100K" rate span. Deliberately
// matches on slash-free classes only (`bg-muted/50` becomes an escaped mess in a selector and
// isn't needed to identify the card).
function scrapeBounties() {
  const cards = document.querySelectorAll("div.rounded-lg.border.p-4.space-y-3");
  const bounties = [];

  for (const card of cards) {
    const nameEl = card.querySelector("h4");
    const badgeEl = card.querySelector('[data-slot="badge"]');
    if (!nameEl || !badgeEl) continue;

    const name = nameEl.textContent?.trim();
    if (!name) continue;
    const status = badgeEl.textContent?.trim().toLowerCase();

    let rate = null;
    for (const span of card.querySelectorAll("span")) {
      const text = span.textContent?.trim();
      if (text && text.startsWith("$")) {
        rate = text;
        break;
      }
    }

    bounties.push({ name, active: status === "active", rate });
  }

  return bounties;
}

let lastSentBounties = null;

function reportBountiesToBackground() {
  const bounties = scrapeBounties();
  if (bounties.length === 0) return;
  const key = JSON.stringify(bounties);
  if (key === lastSentBounties) return;
  lastSentBounties = key;
  chrome.runtime.sendMessage({ type: "BOUNTIES_FROM_PAGE", bounties }).catch(() => {});
}

reportBountiesToBackground();
const bountiesObserver = new MutationObserver(() => reportBountiesToBackground());
bountiesObserver.observe(document.body, { childList: true, subtree: true });
setInterval(reportBountiesToBackground, 30_000);
