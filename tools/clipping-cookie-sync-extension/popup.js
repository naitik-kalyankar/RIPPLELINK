const statusEl = document.getElementById("status");
const buttonEl = document.getElementById("sync-now");

function render(lastSync) {
  if (!lastSync) {
    statusEl.textContent = "No sync attempted yet.";
    statusEl.className = "status unknown";
    return;
  }

  const when = new Date(lastSync.at).toLocaleTimeString();
  if (lastSync.status === "success") {
    const who = lastSync.identity?.email ?? lastSync.identity?.userId;
    statusEl.textContent = who ? `Synced as ${who} (${when})` : `Synced successfully at ${when}`;
    statusEl.className = "status success";
  } else if (lastSync.status === "refreshing") {
    statusEl.textContent = "Session looked stale — refreshing clipping.net in the background…";
    statusEl.className = "status refreshing";
  } else if (lastSync.status === "no_cookie") {
    const seen = lastSync.seenCookieNames ?? [];
    statusEl.textContent =
      seen.length > 0
        ? `No matching session cookie (checked ${when}). Found: ${seen.join(", ")}`
        : `No cookies found for clipping.net at all (checked ${when}) — log in first.`;
    statusEl.className = "status no_cookie";
  } else {
    statusEl.textContent = `Failed at ${when}: ${lastSync.message ?? "unknown error"}`;
    statusEl.className = "status error";
  }
}

chrome.storage.local.get("lastSync", ({ lastSync }) => render(lastSync));

buttonEl.addEventListener("click", () => {
  buttonEl.disabled = true;
  buttonEl.textContent = "Syncing…";
  chrome.runtime.sendMessage({ type: "SYNC_NOW" }, () => {
    buttonEl.disabled = false;
    buttonEl.textContent = "Sync Now";
    chrome.storage.local.get("lastSync", ({ lastSync }) => render(lastSync));
  });
});

document.getElementById("open-read-mode").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("readmode.html") });
});
