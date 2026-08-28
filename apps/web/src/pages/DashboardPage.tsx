import { useState } from "react";
import { Film, Link2, Eye, AlertTriangle, DollarSign, Clock, ListTree } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useActivityLog, useDashboardStats, type ViewsSource } from "@/api/dashboard";
import { useClippingCampaign, type ClippingCampaignInfo } from "@/api/clipping";
import { useClippingAccounts } from "@/api/clippingAccounts";
import { useClippingScope } from "@/lib/clippingScope";
import { PayoutBreakdownModal } from "@/components/dashboard/PayoutBreakdownModal";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const VIEWS_SOURCE_KEY = "kick-manager:views-source";

function useViewsSourcePreference() {
  const [viewsSource, setViewsSourceState] = useState<ViewsSource>(() => {
    try {
      const stored = localStorage.getItem(VIEWS_SOURCE_KEY);
      return stored === "clipping" ? "clipping" : "live";
    } catch {
      return "live";
    }
  });

  const setViewsSource = (value: ViewsSource) => {
    setViewsSourceState(value);
    try {
      localStorage.setItem(VIEWS_SOURCE_KEY, value);
    } catch {
      // localStorage unavailable — preference just won't survive a reload
    }
  };

  return [viewsSource, setViewsSource] as const;
}

const STAT_CARDS = [
  { key: "totalReels", label: "Total Reels", icon: Film, tone: "primary" },
  { key: "linked", label: "Linked", icon: Link2, tone: "success" },
  { key: "qualifyingViews", label: "Views Counted", icon: Eye, tone: "primary" },
] as const;

const TONE_CLASS: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

const levelVariant = { info: "secondary", warning: "warning", error: "destructive" } as const;

const RING_RADIUS = 40;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Days remaining (and elapsed fraction) in the real CLIPPING campaign cycle, read from its
 * own startDate + days (see api/clipping.ts's useClippingCampaign / ClippingBrowserManager's
 * getCampaignInfo — scraped straight off CLIPPING's campaign page, cached ~6hr server-side).
 * Falls back to a calendar-month proxy only when that real data isn't available yet (e.g. no
 * CLIPPING account has ever been logged in) — so this never shows nothing. */
function usePayoutCycle(campaign: ClippingCampaignInfo | null | undefined) {
  const now = new Date();

  if (campaign) {
    const start = new Date(campaign.startDate);
    const end = new Date(start.getTime() + campaign.days * 86_400_000);
    const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));
    const daysElapsed = Math.max(0, campaign.days - daysLeft);
    const progress = Math.min(1, Math.max(0, daysElapsed / campaign.days));
    return { daysLeft, daysElapsed, progress };
  }

  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const daysLeft = Math.max(0, Math.ceil((endOfMonth.getTime() - now.getTime()) / 86_400_000));
  const daysElapsed = totalDays - daysLeft;
  const progress = Math.min(1, Math.max(0, daysElapsed / totalDays));
  return { daysLeft, daysElapsed, progress };
}

export function DashboardPage() {
  const { selectedAccount, scopedInstagramAccountIds } = useClippingScope();
  const [viewsSource, setViewsSource] = useViewsSourcePreference();
  const { data: stats, isLoading, isError } = useDashboardStats(scopedInstagramAccountIds, viewsSource);
  const { data: activity } = useActivityLog();
  const { data: campaignData } = useClippingCampaign();
  const { data: clippingAccountsData } = useClippingAccounts();
  const { daysLeft, daysElapsed, progress } = usePayoutCycle(campaignData?.campaign);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const accountsInScope = (clippingAccountsData?.items ?? []).filter(
    (a) => !selectedAccount || a.id === selectedAccount.id
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Dashboard{selectedAccount ? <span className="text-muted-foreground"> — {selectedAccount.label}</span> : null}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {selectedAccount
            ? `Reels and CLIPPING submissions for "${selectedAccount.label}".`
            : "An overview of your Reels and CLIPPING submissions."}
        </p>
      </div>

      {isError ? (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Couldn't load dashboard stats. Check that the API is reachable and try refreshing.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {/* Estimated payout: dark neutral surface, purple used only as a subtle accent */}
          <Card className="relative overflow-hidden border-primary/15 lg:col-span-4">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-[80px]"
            />
            <CardHeader className="relative flex-row items-center justify-between gap-3 space-y-0 p-6 pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <DollarSign className="h-4 w-4" aria-hidden="true" />
                </span>
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Estimated Payout
                </CardTitle>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-background/50 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setViewsSource("live")}
                      className={cn(
                        "rounded-full px-2.5 py-1 font-medium transition-colors",
                        viewsSource === "live" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Live
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewsSource("clipping")}
                      className={cn(
                        "rounded-full px-2.5 py-1 font-medium transition-colors",
                        viewsSource === "clipping" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      CLIPPING
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {viewsSource === "live"
                    ? "Our own estimate, based on views we've seen most recently. CLIPPING's numbers can take up to 12 hours to catch up."
                    : "The exact amount CLIPPING has calculated, updated every time you sync."}
                </TooltipContent>
              </Tooltip>
            </CardHeader>
            <CardContent className="relative flex flex-col gap-3 p-6 pt-0">
              {isLoading || !stats ? (
                <Skeleton className="h-12 w-48" />
              ) : (
                <>
                  <div>
                    <p className="text-5xl font-semibold tabular-nums tracking-tight">
                      {formatCurrency(stats.estimatedPayout)}
                    </p>
                    <p className="mt-2 text-sm font-medium text-muted-foreground">
                      USDT (ETH) · {viewsSource === "live" ? "our estimate" : "from CLIPPING"}
                    </p>
                  </div>
                  {viewsSource === "clipping" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      onClick={() => setBreakdownOpen(true)}
                    >
                      <ListTree className="h-3.5 w-3.5" /> View breakdown
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Payout cycle: compact radial progress showing days remaining */}
          <Card className="flex flex-col lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 p-6 pb-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Payout Cycle
              </CardTitle>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Clock className="h-4 w-4" aria-hidden="true" />
              </span>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col items-center justify-center gap-3 p-6 pt-0">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
                <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r={RING_RADIUS}
                    fill="none"
                    strokeWidth="7"
                    style={{ stroke: "hsl(var(--muted-foreground) / 0.15)" }}
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={RING_RADIUS}
                    fill="none"
                    strokeWidth="7"
                    strokeLinecap="round"
                    className="transition-[stroke-dashoffset] duration-500"
                    style={{
                      stroke: "hsl(var(--primary) / 0.85)",
                      strokeDasharray: RING_CIRCUMFERENCE,
                      strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress),
                    }}
                  />
                </svg>
                <span className="absolute text-2xl font-semibold tabular-nums leading-none">{daysLeft}</span>
              </div>

              <p className="text-xs font-medium text-muted-foreground">days remaining</p>

              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80">
                <span>{daysElapsed} elapsed</span>
                <span className="h-0.5 w-0.5 shrink-0 rounded-full bg-border" aria-hidden="true" />
                <span>{daysLeft} remaining</span>
              </div>
            </CardContent>
          </Card>

          {STAT_CARDS.map((card) => (
            <Card key={card.key} className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 p-5 pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {card.label}
                </CardTitle>
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TONE_CLASS[card.tone])}>
                  <card.icon className="h-4 w-4" aria-hidden="true" />
                </span>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                {isLoading || !stats ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <span className="text-3xl font-semibold tabular-nums tracking-tight">
                    {stats[card.key].toLocaleString()}
                  </span>
                )}
              </CardContent>
            </Card>
          ))}

          <Card className="flex flex-col sm:col-span-2 lg:col-span-6">
            <CardHeader className="p-6 pb-4">
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest syncs, links, and submission results.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-1 p-6 pt-0 overflow-y-auto scrollbar-thin">
              {!activity?.items.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
              )}
              {activity?.items.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-1 border-b border-border/60 py-3 last:border-0 last:pb-0 first:pt-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <span className="text-sm leading-snug">{entry.message}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    {entry.level !== "info" && (
                      <Badge variant={levelVariant[entry.level]}>{entry.level}</Badge>
                    )}
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{formatRelativeTime(entry.createdAt)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <PayoutBreakdownModal open={breakdownOpen} onOpenChange={setBreakdownOpen} accounts={accountsInScope} />
    </div>
  );
}
