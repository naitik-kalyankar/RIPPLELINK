import type { Platform } from "./types";
import { browserPlatform } from "./browser";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let cached: Platform | null = null;

/**
 * The only entry point the rest of the app should import. Resolves to the desktop
 * implementation only when actually running inside the Tauri shell; the browser build
 * never even loads platform/tauri.ts's dynamic imports.
 */
export async function getPlatform(): Promise<Platform> {
  if (cached) return cached;
  if (isTauri()) {
    const { tauriPlatform } = await import("./tauri");
    cached = tauriPlatform;
  } else {
    cached = browserPlatform;
  }
  return cached;
}
