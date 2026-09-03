export interface PlaywrightInstallResult {
  success: boolean;
  output: string;
}

export interface UpdateInfo {
  available: boolean;
  /** The new version being offered — null when `available` is false. */
  version: string | null;
  /** Release notes, if the release that published this version included any. */
  notes: string | null;
}

export interface Platform {
  readonly kind: "browser" | "desktop";
  notify(title: string, body?: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  getAppVersion(): Promise<string>;
  // Desktop-only — runs `npx playwright install chromium` directly instead of asking the user
  // to open a terminal themselves. Throws in the browser build (nothing to spawn from a tab).
  runPlaywrightInstall(): Promise<PlaywrightInstallResult>;
  // Desktop-only — the browser build always reports no update available (it updates itself on
  // every page load, there's nothing to check). See lib/updates.ts for where this gets polled.
  checkForUpdate(): Promise<UpdateInfo>;
  // Downloads + installs whatever update checkForUpdate last found, then relaunches the app.
  // Never resolves on success (the process restarts) — only rejects if the download/install
  // itself fails.
  installUpdateAndRelaunch(onProgress?: (downloadedBytes: number, totalBytes: number | null) => void): Promise<void>;
}
