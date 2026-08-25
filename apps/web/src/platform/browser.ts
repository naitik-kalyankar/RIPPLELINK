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
};
