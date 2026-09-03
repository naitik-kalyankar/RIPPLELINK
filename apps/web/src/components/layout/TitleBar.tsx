import { useEffect, useState } from "react";
import { Maximize2, Minus, Square, X } from "lucide-react";
import { isTauri } from "@/platform";
import { cn } from "@/lib/utils";

// Real native window chrome is off (see tauri.conf.json's `decorations: false`) so these
// buttons ARE the only way to close/minimize/maximize the app — not a cosmetic overlay on top
// of real traffic lights. Positioned to sit directly above the account rail (the leftmost
// column), matching where macOS users expect them, rather than the window's outer edge.
function MacTrafficLights() {
  const [hovering, setHovering] = useState(false);

  const close = () => import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close());
  const minimize = () => import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().minimize());
  // The green light's native macOS behavior is real fullscreen (a Space transition), not just
  // resizing the window to fill the screen — toggleMaximize() only did the latter, which is why
  // it didn't feel like the real thing. is_fullscreen() first so this also correctly un-fullscreens
  // on a second click instead of only ever going one direction.
  const toggleFullscreen = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const isFullscreen = await win.isFullscreen();
    await win.setFullscreen(!isFullscreen);
  };

  return (
    <div
      className="flex items-center gap-2 pl-5 pt-5"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="flex h-3 w-3 items-center justify-center rounded-full bg-[#ff5f57]"
      >
        {hovering && <X className="h-2 w-2 text-[#4d0000]" strokeWidth={3} />}
      </button>
      <button
        type="button"
        aria-label="Minimize"
        onClick={minimize}
        className="flex h-3 w-3 items-center justify-center rounded-full bg-[#febc2e]"
      >
        {hovering && <Minus className="h-2 w-2 text-[#985700]" strokeWidth={3} />}
      </button>
      <button
        type="button"
        aria-label="Fullscreen"
        onClick={toggleFullscreen}
        className="flex h-3 w-3 items-center justify-center rounded-full bg-[#28c840]"
      >
        {hovering && <Maximize2 className="h-1.5 w-1.5 text-[#006500]" strokeWidth={3.5} />}
      </button>
    </div>
  );
}

// Same three actions, right-aligned Windows/Linux-style icon buttons — kept as a fallback so a
// non-macOS desktop build (decorations are off for every platform, see tauri.conf.json) never
// ships a window with no way to close it, even though the explicit ask here was macOS's own
// convention specifically.
function DefaultWindowControls() {
  const minimize = () => import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().minimize());
  const toggleMaximize = () =>
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().toggleMaximize());
  const close = () => import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().close());

  return (
    <div className="ml-auto flex items-center">
      <button type="button" aria-label="Minimize" onClick={minimize} className="flex h-8 w-10 items-center justify-center hover:bg-accent">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button type="button" aria-label="Maximize" onClick={toggleMaximize} className="flex h-8 w-10 items-center justify-center hover:bg-accent">
        <Square className="h-3 w-3" />
      </button>
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="flex h-8 w-10 items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** The app's own window controls — real decorations are off (tauri.conf.json), so this strip is
 * both the drag handle and the only close/minimize/maximize affordance. Renders nothing outside
 * the desktop app (the browser build has its own real chrome). */
export function TitleBar() {
  const [platform, setPlatform] = useState<"pending" | "mac" | "other" | "web">("pending");

  useEffect(() => {
    if (!isTauri()) {
      setPlatform("web");
      return;
    }
    setPlatform(navigator.userAgent.includes("Mac") ? "mac" : "other");
  }, []);

  if (platform === "pending" || platform === "web") return null;

  return (
    <div
      data-tauri-drag-region
      className={cn("fixed inset-x-0 top-0 z-50 flex h-9 items-start", platform === "other" && "border-b border-border bg-card")}
    >
      {platform === "mac" ? <MacTrafficLights /> : <DefaultWindowControls />}
    </div>
  );
}
