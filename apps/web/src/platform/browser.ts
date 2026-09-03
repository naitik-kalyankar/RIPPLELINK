import type { Platform } from "./types";

/**
 * Browser implementation. Every capability degrades gracefully so the web app is always
 * fully functional standalone, with no hard dependency on Tauri.
 */
export const browserPlatform: Platform = {
  kind: "browser",

  async notify(title, body) {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
      return;
    }
    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      if (permission === "granted") new Notification(title, { body });
    }
  },

  async openExternal(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  },

  async getAppVersion() {
    return import.meta.env.VITE_APP_VERSION ?? "web";
  },

  async runPlaywrightInstall() {
    // Nothing to spawn from a browser tab — callers should check platform.kind === "desktop"
    // before showing a "Run for me" button at all, and fall back to the copyable command.
    throw new Error("Not available in the browser — copy the command and run it in a terminal instead.");
  },

  async checkForUpdate() {
    // The web app updates itself on every page load — there's no separate "check" step, and
    // never anything to report here. Callers should skip the update banner entirely when
    // platform.kind !== "desktop" rather than rely on this always resolving to unavailable.
    return { available: false, version: null, notes: null };
  },

  async installUpdateAndRelaunch() {
    throw new Error("Not available in the browser.");
  },
};
