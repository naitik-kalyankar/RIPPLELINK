import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminPayouts, useRefreshAdminPayouts, type AdminPayoutEntry } from "@/api/admin";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/utils";

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  paypal: "PayPal",
  usdt: "USDT (ETH)",
  usdc: "USDC (ETH)",
  "usdt/usdc": "USDT/USDC (ETH)",
};

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-accent/20 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function AccountHistoryTable({ history }: { history: AdminPayoutEntry["history"] }) {
  if (history.length === 0) {
    return <p className="px-3 py-3 text-sm text-muted-foreground">No finalized payout cycles for this account yet.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <th className="px-3 py-2 font-medium">Cycle</th>
          <th className="px-3 py-2 font-medium">Status</th>
          <th className="px-3 py-2 font-medium">Date</th>
          <th className="px-3 py-2 font-medium text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {history.map((entry) => (
          <tr key={entry.cycleId} className="border-b border-border/40 last:border-0">
            <td className="px-3 py-2">{entry.cycleLabel ?? entry.bountyTag ?? "—"}</td>
            <td className="px-3 py-2">
              <Badge variant={entry.status === "paid" ? "success" : "warning"}>
                {entry.status === "paid" ? "Paid" : "Pending"}
              </Badge>
            </td>
            <td className="px-3 py-2 text-xs text-muted-foreground">
              {formatDate(entry.paidAt ?? entry.finalizedAt ?? entry.exportedAt)}
            </td>
            <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(entry.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PayoutRow({ item }: { item: AdminPayoutEntry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="border-b border-border/60 last:border-0">
        <td className="px-3 py-2.5">
          <p className="font-medium">{item.ownerDisplayName ?? item.ownerEmail ?? "Unknown"}</p>
          {item.ownerEmail && item.ownerDisplayName && <p className="text-xs text-muted-foreground">{item.ownerEmail}</p>}
        </td>
        <td className="px-3 py-2.5">
          <p className="font-medium">{item.label}</p>
          {item.email && <p className="text-xs text-muted-foreground">{item.email}</p>}
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground">
          {item.paymentMethod ? (PAYMENT_METHOD_LABEL[item.paymentMethod.type] ?? item.paymentMethod.type) : "—"}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">{item.pendingEstimate != null ? formatCurrency(item.pendingEstimate) : "—"}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(item.paidTotal)}</td>
        <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(item.pendingTotal)}</td>
        <td className="px-3 py-2.5">
          {item.error && item.stale && item.fetchedAt ? (
            <Badge variant="warning" title={`${item.error} — showing the last successful fetch, ${formatRelativeTime(item.fetchedAt)}.`}>
              Stale
            </Badge>
          ) : item.error ? (
            <Badge variant="destructive" title={item.error}>
              Failed
            </Badge>
          ) : item.mock ? (
            <Badge variant="outline" className="text-muted-foreground">
              Mock
            </Badge>
          ) : null}
        </td>
        <td className="px-3 py-2.5 text-right">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={expanded ? "Hide payout history" : "Show payout history"}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/60 bg-accent/10 last:border-0">
          <td colSpan={8} className="p-0">
            <AccountHistoryTable history={item.history} />
          </td>
        </tr>
      )}
    </>
  );
}

export function AdminPayoutsPage() {
  const { data, isLoading, isError } = useAdminPayouts();
  const refresh = useRefreshAdminPayouts();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin — Payouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every active CLIPPING account across every RIPPLELINK user, in one place.
          </p>
        </div>
        {/* Loading the page itself only ever reads what's already stored — this is the one thing
         * that actually goes and asks CLIPPING for fresh numbers, launching a Playwright context
         * per reachable account. Explicit and on-demand instead of firing automatically on every
         * page visit, which used to be exactly what could exhaust the shared DB connection pool. */}
        <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          {refresh.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {refresh.isPending ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {refresh.isError && (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {refresh.error instanceof Error ? refresh.error.message : "Couldn't refresh payout data."}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Couldn't load admin payout data.
        </div>
      )}

      {isLoading && <Skeleton className="h-64 w-full" />}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label="Total pending estimate" value={formatCurrency(data.totals.pendingEstimate)} />
            <StatTile label="Total paid" value={formatCurrency(data.totals.paidTotal)} />
            <StatTile label="Total awaiting payout" value={formatCurrency(data.totals.pendingTotal)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
            </CardHeader>
            <CardContent>
              {data.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active CLIPPING accounts yet, across any user.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-card/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Owner</th>
                        <th className="px-3 py-2 font-medium">Account</th>
                        <th className="px-3 py-2 font-medium">Payment method</th>
                        <th className="px-3 py-2 font-medium text-right">Pending est.</th>
                        <th className="px-3 py-2 font-medium text-right">Paid</th>
                        <th className="px-3 py-2 font-medium text-right">Awaiting</th>
                        <th className="px-3 py-2 font-medium"></th>
                        <th className="px-3 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((item) => (
                        <PayoutRow key={item.accountId} item={item} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
