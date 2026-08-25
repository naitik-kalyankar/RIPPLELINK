// Runs in the PAGE's own JS context (MAIN world, injected via manifest's content_scripts
// "world": "MAIN" — see manifest.json), not the isolated extension context. This is required
// to wrap window.fetch/XHR the same instances the page's own React/Next.js code calls, so we
// see every request clipping.net's frontend makes to its own backend, including undocumented
// endpoints there's no other way to discover (CLIPPING has no public API docs).
//
// Read-mode only: this never modifies requests/responses, only observes them, and only
// reports response bodies (never request headers/cookies/auth tokens) back to content.js via
// postMessage, which relays to the extension background for storage.
//
// Deliberately NOT scoped to same-origin /api/* — CLIPPING is built on Supabase, so a chunk of
// its real data may come from calls straight to <project>.supabase.co (a different host) or
// from paths that don't start with /api/. Anything that isn't an obvious static asset gets
// captured; the viewer/background caps volume, so casting wide here is cheap.
(() => {
  const MARKER = "__reelManagerReadMode__";
  const STATIC_ASSET_RE = /\.(js|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map|mp4|webm)(\?|$)/i;
  const NOISE_HOST_RE = /(google-analytics|googletagmanager|sentry\.io|posthog|hotjar|cloudflareinsights|clarity\.ms)/i;

  console.log("[ReelManager ReadMode] inject.js active on", location.href);

  function shouldCapture(url) {
    try {
      const parsed = new URL(url, location.href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      if (STATIC_ASSET_RE.test(parsed.pathname)) return false;
      if (NOISE_HOST_RE.test(parsed.hostname)) return false;
      return true;
    } catch {
      return false;
    }
  }

  // Collapse path params (ids) so e.g. /api/campaigns/507f.../clips and
  // /api/campaigns/611a.../clips report as the same discovered endpoint shape.
  function normalizePath(pathname) {
    return pathname
      .split("/")
      .map((segment) => (/^[a-f0-9-]{16,}$/i.test(segment) || /^\d{5,}$/.test(segment) ? ":id" : segment))
      .join("/");
  }

  function report(entry) {
    window.postMessage({ source: MARKER, entry }, location.origin);
  }

  function safeBody(text) {
    if (!text) return null;
    const truncated = text.length > 8000 ? text.slice(0, 8000) + "…(truncated)" : text;
    try {
      return JSON.parse(truncated);
    } catch {
      return truncated;
    }
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const request = args[0];
    const url = typeof request === "string" ? request : request?.url;
    const method = (typeof request === "object" && request?.method) || (args[1] && args[1].method) || "GET";

    const response = await originalFetch.apply(this, args);

    if (url && shouldCapture(url)) {
      response
        .clone()
        .text()
        .then((text) => {
          const parsed = new URL(url, location.href);
          report({
            host: parsed.hostname,
            method,
            path: normalizePath(parsed.pathname),
            query: Array.from(parsed.searchParams.keys()),
            status: response.status,
            body: safeBody(text),
            capturedAt: new Date().toISOString(),
          });
        })
        .catch(() => {});
    }

    return response;
  };

  const OriginalXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OriginalXHR();
    let method = "GET";
    let url = "";

    const originalOpen = xhr.open;
    xhr.open = function (m, u, ...rest) {
      method = m;
      url = u;
      return originalOpen.call(xhr, m, u, ...rest);
    };

    xhr.addEventListener("loadend", () => {
      if (!url || !shouldCapture(url)) return;
      try {
        const parsed = new URL(url, location.href);
        report({
          host: parsed.hostname,
          method,
          path: normalizePath(parsed.pathname),
          query: Array.from(parsed.searchParams.keys()),
          status: xhr.status,
          body: safeBody(xhr.responseText),
          capturedAt: new Date().toISOString(),
        });
      } catch {
        // ignore
      }
    });

    return xhr;
  }
  PatchedXHR.prototype = OriginalXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;
})();
