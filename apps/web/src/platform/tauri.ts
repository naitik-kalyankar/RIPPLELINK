import type { Update } from "@tauri-apps/plugin-updater";
import type { Platform } from "./types";

// Installing requires calling .downloadAndInstall() on the SAME Update object check() returned
// (it's not re-derivable from a version string) — held here so installUpdateAndRelaunch can use
// whatever checkForUpdate most recently found, without the caller needing to pass it around.
let pendingUpdate: Update | null = null;

/**
 * Desktop implementation. Only ever loaded when running inside the Tauri shell (see
 * index.ts) — the browser bundle never eagerly evaluates @tauri-apps/api.
 */
export const tauriPlatform: Platform = {
  kind: "desktop",

  async notify(title, body) {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (granted) sendNotification({ title, body });
  },

  async openExternal(url) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  },

  async getAppVersion() {
    const { getVersion } = await import("@tauri-apps/api/app");
    return getVersion();
  },

  async runPlaywrightInstall() {
    const { Command } = await import("@tauri-apps/plugin-shell");
    // Tauri clears the child process's env by default unless one is passed — a GUI-launched
    // app's own PATH is often much narrower than a terminal's (notably on macOS, where it can
    // exclude Homebrew install locations), so npx wouldn't otherwise be found even though it
    // works fine from a real terminal. Broadening PATH here covers the common global-install
    // locations; a Node installed via nvm (a per-user, per-version path with no fixed
    // location) won't be found this way — that case still needs the "copy command" fallback.
    const path = ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":");
    const command = Command.create("playwright-install", ["playwright", "install", "chromium"], {
      env: { PATH: path },
    });
    const result = await command.execute();
    return {
      success: result.code === 0,
      output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
    };
  },

  async checkForUpdate() {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    pendingUpdate = update;
    if (!update?.available) return { available: false, version: null, notes: null };
    return { available: true, version: update.version, notes: update.body ?? null };
  },

  async installUpdateAndRelaunch(onProgress) {
    if (!pendingUpdate) throw new Error("No update found — call checkForUpdate() first.");
    let downloaded = 0;
    let total: number | null = null;
    await pendingUpdate.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? null;
      if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, total);
      }
    });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  },
};
