const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");

function render(captures) {
  const entries = Object.values(captures).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
  listEl.innerHTML = "";
  emptyEl.style.display = entries.length === 0 ? "block" : "none";

  for (const entry of entries) {
    const details = document.createElement("details");
    details.className = "entry";

    const summary = document.createElement("summary");
    summary.innerHTML = `
      <span class="method">${entry.method}</span>
      <span class="path">${entry.host ?? ""}${entry.path}${entry.query?.length ? "?" + entry.query.join("&") : ""}</span>
      <span class="meta">
        <span class="status ${entry.status >= 200 && entry.status < 300 ? "ok" : "err"}">${entry.status}</span>
        <span>seen ${entry.hitCount}×</span>
        <span>last ${new Date(entry.lastSeen).toLocaleTimeString()}</span>
      </span>
    `;

    const pre = document.createElement("pre");
    pre.textContent = typeof entry.sampleBody === "string" ? entry.sampleBody : JSON.stringify(entry.sampleBody, null, 2);

    details.appendChild(summary);
    details.appendChild(pre);
    listEl.appendChild(details);
  }
}

function load() {
  chrome.storage.local.get("readModeCaptures", ({ readModeCaptures = {} }) => render(readModeCaptures));
}

document.getElementById("refresh").addEventListener("click", load);

document.getElementById("clear").addEventListener("click", () => {
  chrome.storage.local.set({ readModeCaptures: {} }, load);
});

document.getElementById("copy").addEventListener("click", async () => {
  const { readModeCaptures = {} } = await chrome.storage.local.get("readModeCaptures");
  await navigator.clipboard.writeText(JSON.stringify(readModeCaptures, null, 2));
  const btn = document.getElementById("copy");
  const original = btn.textContent;
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = original), 1200);
});

load();
