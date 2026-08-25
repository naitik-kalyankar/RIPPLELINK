import { Film, Link2, Users, AlertTriangle, DollarSign, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useActivityLog, useDashboardStats } from "@/api/dashboard";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const STAT_CARDS = [
  { key: "totalReels", label: "Total Reels", icon: Film, tone: "primary" },
  { key: "linked", label: "Linked", icon: Link2, tone: "success" },
  { key: "creators", label: "Creators", icon: Users, tone: "primary" },
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

/** Days remaining (and elapsed fraction) in the current calendar month, used as the payout-cycle
 * countdown. There's no cycle end-date in the API yet (CLIPPING submissions carry a cycleId but
 * no exposed end date), so this is a calendar-month proxy rather than a real cycle date. */
function usePayoutCycle() {
  const now = new Date();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const daysLeft = Math.max(0, Math.ceil((endOfMonth.getTime() - now.getTime()) / 86_400_000));
  const daysElapsed = totalDays - daysLeft;
  const progress = Math.min(1, Math.max(0, daysElapsed / totalDays));
  return { daysLeft, daysElapsed, progress };
}

export function DashboardPage() {
  const { data: stats, isLoading, isError } = useDashboardStats();
  const { data: activity } = useActivityLog();
  const { daysLeft, daysElapsed, progress } = usePayoutCycle();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          An overview of your Instagram Reels and CLIPPING submissions.
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
            <CardHeader className="relative flex-row items-center gap-3 space-y-0 p-6 pb-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <DollarSign className="h-4 w-4" aria-hidden="true" />
              </span>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Estimated Payout
              </CardTitle>
            </CardHeader>
            <CardContent className="relative p-6 pt-0">
              {isLoading || !stats ? (
                <Skeleton className="h-12 w-48" />
              ) : (
                <>
                  <p className="text-5xl font-semibold tabular-nums tracking-tight">
                    {formatCurrency(stats.estimatedPayout)}
                  </p>
                  <p className="mt-2 text-sm font-medium text-muted-foreground">USDT (ETH)</p>
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
    </div>
  );
}
