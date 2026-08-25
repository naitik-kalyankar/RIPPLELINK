export interface Platform {
  readonly kind: "browser" | "desktop";
  notify(title: string, body?: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  getAppVersion(): Promise<string>;
}
