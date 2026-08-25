# CLIPPING Cookie Sync (Chrome extension)

Replaces the manual "copy the Cookie header from devtools, paste into `.env`, restart the
API" workflow. Watches your `clipping.net` session cookie in the browser and pushes it to
your local Reel Manager API automatically whenever it changes (Supabase rotates it roughly
hourly), plus a manual "Sync Now" button.

Not published to the Chrome Web Store — load it unpacked for local dev use only.

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder (`tools/clipping-cookie-sync-extension`)

## Use

1. Make sure the Reel Manager API is running on `http://localhost:4000`
2. Log into `clipping.net` in the same browser
3. The extension automatically detects the session cookie and pushes it — no action needed
4. Click the extension icon any time to see last-sync status or force an immediate sync

## How it works

- `background.js` listens for changes to `clipping.net`'s Supabase auth cookies
  (`sb-<project>-auth-token.0`/`.1`) via `chrome.cookies.onChanged`, reassembles them into a
  full `Cookie:` header, and `POST`s it to `http://localhost:4000/api/clipping/session-cookie`
- The API applies it immediately in memory and persists it to `apps/api/.env`
  (`CLIPPING_SESSION_COOKIE=...`) so it survives a server restart too
- A `chrome.alarms` fallback re-checks every 15 minutes in case the change listener ever
  misses an update while the service worker was asleep
- **Self-healing session refresh**: the Supabase session only refreshes itself while some
  clipping.net page is actually loaded and running its own JS — if there's no cookie (or the
  one that's there is stale) and no tab open, nothing would ever fix that on its own. When a
  sync attempt (periodic, manual "Sync Now", or otherwise) comes back empty, the extension
  opens a clipping.net tab in the background (or reloads one if it's already open) to force
  that refresh, then closes the tab it opened a few seconds later. You should rarely need to
  open clipping.net yourself just to keep the session alive.

## Security note

This extension only ever talks to `clipping.net` (to read cookies you're already logged in
with) and `localhost:4000` (your own local API). The session-cookie endpoint on the API side
is intentionally unauthenticated, since this app has no auth system anywhere and only ever
listens on localhost — never expose the API beyond localhost with this endpoint enabled.

## Read mode

CLIPPING has no public API docs, so there's no other way to learn what data its own frontend
can see (account identity, linked Instagram accounts, per-campaign info, etc.) than watching
the requests its own pages make. `inject.js` runs in the page's own JS context and wraps
`fetch`/`XMLHttpRequest` to observe (never modify) every response from a `clipping.net/api/*`
endpoint; `content.js` relays each one to `background.js`, which keeps up to 60 distinct
endpoint shapes (IDs collapsed in the path, so paginated/multi-account calls collapse into one
entry) in `chrome.storage.local`. Nothing leaves your browser.

To use it: just browse clipping.net normally with a tab open for a bit — dashboard, campaigns,
any profile/account/settings pages, switching between CLIPPING accounts if you have more than
one logged in. Then click the extension icon → **View captured data** to see every distinct
endpoint and a sample response, or **Copy all as JSON** to hand a snapshot off for review. This
is how the account-identity / linked-Instagram-account / multi-account-switching features get
built next — only once we know what CLIPPING's backend actually exposes.
