import { useState } from "react";
import { ChevronDown, ChevronUp, Gem, Plus, Trash2, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useClippingAccounts, type ClippingAccountStatus } from "@/api/clippingAccounts";
import {
  useClippingPayments,
  useCreatePayoutSplit,
  useDeletePayoutSplit,
  usePayoutSplits,
  useSplitsSummary,
  useUpdatePayoutSplit,
  type PayoutSplit,
} from "@/api/payouts";
import { useClippingScope } from "@/lib/clippingScope";
import { cn, formatCurrency, formatDate, formatRelativeTime } from "@/lib/utils";

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-accent/20 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Crypto addresses here are all 0x-prefixed (EVM) — same "(ETH)" convention already used for
// the Dashboard's USDT payout label, since CLIPPING doesn't report a network separately.
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  paypal: "PayPal",
  usdt: "USDT (ETH)",
  usdc: "USDC (ETH)",
  "usdt/usdc": "USDT/USDC (ETH)",
};

// One accent per method — same soft-circle-icon pattern already used for stat card icons
// elsewhere (e.g. DashboardPage's TONE_CLASS), not a real brand mark (no logo asset to pull
// in), just a recognizable color association (Tether/USDC green vs. teal vs. PayPal blue).
const PAYMENT_METHOD_STYLE: Record<string, { icon: typeof Wallet; className: string }> = {
  paypal: { icon: Wallet, className: "bg-primary/15 text-primary" },
  usdt: { icon: Gem, className: "bg-success/15 text-success" },
  usdc: { icon: Gem, className: "bg-primary/15 text-primary" },
  "usdt/usdc": { icon: Gem, className: "bg-success/15 text-success" },
};

function truncateAddress(value: string): string {
  if (!value.startsWith("0x") || value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function PaymentMethodLine({ account }: { account: ClippingAccountStatus }) {
  const { data } = useClippingPayments(account.id);
  const method = data?.paymentMethod;
  if (!method) return null;

  const style = PAYMENT_METHOD_STYLE[method.type] ?? { icon: Wallet, className: "bg-accent text-muted-foreground" };

  return (
    <div className="flex max-w-[220px] items-center gap-2.5 rounded-lg border border-border bg-accent/20 px-3 py-2">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", style.className)}>
        <style.icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight">{PAYMENT_METHOD_LABEL[method.type] ?? method.type}</p>
        <p className="truncate text-xs text-muted-foreground" title={method.value}>
          {method.type === "paypal" ? method.value : truncateAddress(method.value)}
        </p>
      </div>
    </div>
  );
}

function PendingEstimateSection({ account }: { account: ClippingAccountStatus }) {
  const { data, isLoading } = useClippingPayments(account.id);

  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (!data?.pendingEstimate) {
    return <p className="text-sm text-muted-foreground">No pending estimate yet — syncs after this account's next sync.</p>;
  }

  const { total, fetchedAt } = data.pendingEstimate;

  return (
    <div className="flex items-baseline gap-2">
      <span className="text-3xl font-semibold tabular-nums tracking-tight text-primary">{formatCurrency(total)}</span>
      <span className="text-xs text-muted-foreground">still accruing this cycle · updated {formatRelativeTime(fetchedAt)}</span>
    </div>
  );
}

function PayoutHistorySection({ account }: { account: ClippingAccountStatus }) {
  const { data, isLoading } = useClippingPayments(account.id);

  if (!account.hasStorageState) {
    return <p className="text-sm text-muted-foreground">Sign in on the Settings page to see payout history.</p>;
  }
  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!data) return null;

  const now = new Date();
  const thisMonthPaid = data.history
    .filter((e) => e.status === "paid" && e.paidAt && new Date(e.paidAt).getMonth() === now.getMonth() && new Date(e.paidAt).getFullYear() === now.getFullYear())
    .reduce((sum, e) => sum + e.amount, 0);
  const paidCount = data.history.filter((e) => e.status === "paid").length;
  const pendingCount = data.history.filter((e) => e.status === "pending").length;

  return (
    <div className="grid gap-3">
      {data.mock && (
        <Badge variant="outline" className="w-fit text-muted-foreground">
          Mock data
        </Badge>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Lifetime paid" value={formatCurrency(data.paidTotal)} hint={paidCount > 0 ? `${paidCount} payout${paidCount === 1 ? "" : "s"}` : undefined} />
        <StatTile label="This month" value={formatCurrency(thisMonthPaid)} hint={thisMonthPaid === 0 ? "no payouts yet" : undefined} />
        <StatTile
          label="Awaiting payout"
          value={formatCurrency(data.pendingTotal)}
          hint={pendingCount > 0 ? `${pendingCount} cycle${pendingCount === 1 ? "" : "s"} finalized, not yet paid` : undefined}
        />
      </div>

      {data.history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No finalized payout cycles for this campaign yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border bg-card/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Cycle</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((entry) => (
                <tr key={entry.cycleId} className="border-b border-border/60 last:border-0">
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
        </div>
      )}
    </div>
  );
}

function SplitRow({
  split,
  clippingAccountId,
  selected,
  onSelect,
}: {
  split: PayoutSplit;
  clippingAccountId: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const [name, setName] = useState(split.name);
  const [percentage, setPercentage] = useState(String(split.percentage));
  const update = useUpdatePayoutSplit(clippingAccountId);
  const remove = useDeletePayoutSplit(clippingAccountId);
  const { toast } = useToast();

  const save = () => {
    const pct = Number(percentage);
    if (!name.trim() || Number.isNaN(pct)) return;
    update.mutate(
      { id: split.id, input: { name: name.trim(), percentage: pct } },
      { onError: (error) => toast({ title: "Couldn't save", description: error.message, variant: "destructive" }) }
    );
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
        selected ? "border-primary/40 bg-primary/5" : "border-transparent"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        title="Show this person's share of the totals above"
        className={cn(
          "h-3.5 w-3.5 shrink-0 rounded-full border",
          selected ? "border-primary bg-primary" : "border-muted-foreground/40"
        )}
      />
      <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} className="flex-1" />
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          max={100}
          value={percentage}
          onChange={(e) => setPercentage(e.target.value)}
          onBlur={save}
          className="w-20"
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        disabled={remove.isPending}
        onClick={() => remove.mutate(split.id, { onError: (error) => toast({ title: "Couldn't remove", description: error.message, variant: "destructive" }) })}
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </Button>
    </div>
  );
}

function PayoutSplitsEditor({ account }: { account: ClippingAccountStatus }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const { data, isLoading } = usePayoutSplits(account.id);
  const { data: payments } = useClippingPayments(account.id);
  const create = useCreatePayoutSplit(account.id);
  const [newName, setNewName] = useState("");
  const [newPercentage, setNewPercentage] = useState("");
  const { toast } = useToast();

  const splits = data?.items ?? [];
  const total = splits.reduce((sum, s) => sum + s.percentage, 0);
  const summary = splits.map((s) => `${s.name}[${s.percentage}%]`).join("-");
  const selected = splits.find((s) => s.id === selectedSplitId) ?? null;

  const addSplit = () => {
    const pct = Number(newPercentage);
    if (!newName.trim() || Number.isNaN(pct)) return;
    create.mutate(
      { name: newName.trim(), percentage: pct },
      {
        onSuccess: () => {
          setNewName("");
          setNewPercentage("");
        },
        onError: (error) => toast({ title: "Couldn't add", description: error.message, variant: "destructive" }),
      }
    );
  };

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded((v) => !v)}
      >
        <span>Payout split</span>
        {splits.length > 0 && (
          <span className="truncate normal-case tracking-normal text-foreground">{summary}</span>
        )}
        <span className="flex-1" />
        {expanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
      </button>

      {expanded && (
        <div className="mt-2.5 grid gap-2.5">
          {isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            splits.map((split) => (
              <SplitRow
                key={split.id}
                split={split}
                clippingAccountId={account.id}
                selected={split.id === selectedSplitId}
                onSelect={() => setSelectedSplitId((id) => (id === split.id ? null : split.id))}
              />
            ))
          )}

          <div className="flex items-center gap-2">
            <Input placeholder="Name (e.g. Mine, Alex)" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1" />
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="0"
                value={newPercentage}
                onChange={(e) => setNewPercentage(e.target.value)}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <Button variant="outline" size="sm" onClick={addSplit} disabled={create.isPending || !newName.trim() || !newPercentage}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>

          {splits.length > 0 && (
            <p className={cn("text-xs", total === 100 ? "text-muted-foreground" : "text-warning")}>
              {total}% assigned{total !== 100 && " — doesn't add up to 100%"}
            </p>
          )}

          {selected && payments && (
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{selected.name}'s pending est.</p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatCurrency((payments.pendingEstimate?.total ?? 0) * (selected.percentage / 100))}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{selected.name}'s paid</p>
                <p className="text-lg font-semibold tabular-nums">{formatCurrency(payments.paidTotal * (selected.percentage / 100))}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{selected.name}'s awaiting</p>
                <p className="text-lg font-semibold tabular-nums">{formatCurrency(payments.pendingTotal * (selected.percentage / 100))}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SplitsSummaryChart() {
  const { data, isLoading } = useSplitsSummary();
  const items = data?.items ?? [];

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (items.length === 0) return null;

  const max = Math.max(...items.map((i) => i.total), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payout by person</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3">
          {items.map((item) => {
            const paidPct = (item.paid / max) * 100;
            const pendingPct = (item.pending / max) * 100;
            const estimatePct = (item.pendingEstimate / max) * 100;
            return (
              <div key={item.name} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(item.total)}</span>
                </div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-accent/40">
                  {paidPct > 0 && <div className="h-full bg-success" style={{ width: `${paidPct}%` }} />}
                  {pendingPct > 0 && <div className="h-full bg-warning" style={{ width: `${pendingPct}%` }} />}
                  {estimatePct > 0 && <div className="h-full bg-primary/50" style={{ width: `${estimatePct}%` }} />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success" /> Paid
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warning" /> Awaiting payout
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary/50" /> Pending estimate
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountPayoutSection({ account }: { account: ClippingAccountStatus }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>{account.label}</CardTitle>
        <PaymentMethodLine account={account} />
      </CardHeader>
      <CardContent className="grid gap-6">
        <div>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending estimate</p>
          <PendingEstimateSection account={account} />
        </div>
        <div className="border-t border-border/60 pt-5">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payout history</p>
          <PayoutHistorySection account={account} />
        </div>
        <div className="border-t border-border/60 pt-5">
          <PayoutSplitsEditor account={account} />
        </div>
      </CardContent>
    </Card>
  );
}

export function PayoutPage() {
  const { data: clippingAccounts, isLoading } = useClippingAccounts();
  const { selectedAccount } = useClippingScope();

  const accounts = selectedAccount ? [selectedAccount] : (clippingAccounts?.items ?? []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Payout{selectedAccount ? <span className="text-muted-foreground"> — {selectedAccount.label}</span> : null}
      </h1>

      {!isLoading && accounts.length > 0 && <SplitsSummaryChart />}

      {isLoading && <Skeleton className="h-40 w-full" />}
      {!isLoading && accounts.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
          <p className="text-sm font-medium">No CLIPPING accounts yet</p>
          <p className="text-sm text-muted-foreground">Add one on the Settings page to see its payout here.</p>
        </div>
      )}
      {accounts.map((account) => (
        <AccountPayoutSection key={account.id} account={account} />
      ))}
    </div>
  );
}
