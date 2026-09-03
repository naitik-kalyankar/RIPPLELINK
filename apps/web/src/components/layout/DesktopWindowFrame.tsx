import type { ReactNode } from "react";
import { TitleBar } from "./TitleBar";
import { isTauri } from "@/platform";
import { cn } from "@/lib/utils";

/** Wraps EVERY screen — login, the CLIPPING-connect gate, reset-password, the full app shell —
 * not just AppShell. Mounted once at the top of the route tree (see App.tsx) instead of inside
 * AppShell, so TitleBar (the traffic lights) and the rounded/transparent window treatment are
 * there from the very first paint, before a session is even confirmed. Two real bugs came from
 * only AppShell having this: the login screen had no way to close/minimize the window at all,
 * and its corners were square while the rest of the app was rounded. Nesting everything inside
 * one persistently-painted bg-background box also happens to fix a third bug — a window that's
 * genuinely transparent (see tauri.conf.json) has nothing behind it during a loading flash, so a
 * `return null` while checking auth state showed real desktop through the window for a frame or
 * two instead of a solid color. */
export function DesktopWindowFrame({ children }: { children: ReactNode }) {
  return (
    <div className={cn("flex h-screen w-full flex-col overflow-hidden bg-background", isTauri() && "rounded-[10px]")}>
      <TitleBar />
      <div className={cn("flex min-h-0 flex-1 flex-col", isTauri() && "pt-9")}>{children}</div>
    </div>
  );
}
