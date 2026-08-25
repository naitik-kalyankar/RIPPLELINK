import type { Platform } from "./types";

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
};
