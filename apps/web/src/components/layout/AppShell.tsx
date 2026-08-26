import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileNav } from "./MobileNav";
import { LinkingProgressBar } from "./LinkingProgressBar";
import { ProgressiveBlur } from "./ProgressiveBlur";
import { cn } from "@/lib/utils";

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const topbarWrapperRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  // The progressive blur only makes sense once there's scrolled content sitting behind the
  // header to blur — at the very top of the page it just muddies page content for no reason,
  // so it stays off by default and fades in only once the user has actually scrolled down.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const onScroll = () => setScrolled(main.scrollTop > 4);
    onScroll();
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  // Publishes the sticky Topbar's actual rendered height (it varies — one row on sm+, two
  // stacked rows on mobile) as a CSS var on `main`, the shared scroll-container ancestor. Pages
  // can dock their own sticky sub-headers (e.g. the Reels filter bar) right under it via
  // `top: calc(var(--topbar-h) + <gap>)` instead of guessing a fixed pixel offset per breakpoint.
  useEffect(() => {
    const wrapper = topbarWrapperRef.current;
    const main = mainRef.current;
    if (!wrapper || !main) return;
    const observer = new ResizeObserver(([entry]) => {
      main.style.setProperty("--topbar-h", `${entry.contentRect.height}px`);
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-screen w-full gap-3 overflow-hidden bg-background p-3">
      <Sidebar />
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar is sticky inside the scroll container (not a separate row above it) so page
         * content actually scrolls behind it — the ProgressiveBlur layer is what makes that
         * content read as increasingly blurred toward the header instead of just hidden behind it. */}
        <main ref={mainRef} className="relative flex-1 overflow-y-auto scrollbar-thin pb-3">
          <div ref={topbarWrapperRef} className="sticky top-0 z-30">
            <ProgressiveBlur
              className={cn(
                "absolute inset-x-0 top-0 -z-10 h-[calc(100%+2.5rem)] transition-opacity duration-200 ease-in-out",
                scrolled ? "opacity-100" : "opacity-0"
              )}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[calc(100%+2.5rem)] bg-gradient-to-b from-background via-background/50 to-transparent"
            />
            <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
          </div>
          <div className="mx-auto w-full max-w-[1600px] pt-3">
            <Outlet />
          </div>
        </main>
      </div>
      <LinkingProgressBar />
    </div>
  );
}
