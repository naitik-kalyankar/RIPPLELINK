import { useState } from "react";
import { ListFilter, Search, X } from "lucide-react";
import { animated, useSpring } from "@react-spring/web";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreators } from "@/api/creators";
import { useInstagramAccounts } from "@/api/instagram";
import { useClippingScope } from "@/lib/clippingScope";
import { cn } from "@/lib/utils";
import type { ReelsFilters } from "@/api/reels";

interface ReelFiltersProps {
  filters: ReelsFilters;
  onChange: (filters: ReelsFilters) => void;
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "linked", label: "Linked" },
  { value: "unlinked", label: "Unlinked" },
  { value: "submitting", label: "Uploading" },
  { value: "failed", label: "Failed" },
];

const DATE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "creator", label: "Creator" },
  { value: "instagram_account", label: "Instagram account" },
  { value: "linked_status", label: "Linked status" },
  { value: "views", label: "Views" },
  { value: "likes", label: "Likes" },
  { value: "comments", label: "Comments" },
];

/** The four "which Reels" filters — status/creator/account/date — collapsed behind a single
 * "Filters" disclosure instead of always taking up a full row (or two, once they wrapped). Same
 * filters, same onChange contract; just tucked away until asked for, with an active-count badge
 * so it's obvious at a glance whether anything's narrowed. */
export function ReelFilters({ filters, onChange }: ReelFiltersProps) {
  const { data: creators } = useCreators();
  const { data: allAccounts } = useInstagramAccounts();
  const { selectedId, instagramAccountsInScope } = useClippingScope();
  // Restricted to the active CLIPPING account's own Instagram accounts when scoped — can't
  // pick an account outside the current scope, since it wouldn't show anything anyway.
  const accounts = selectedId ? { items: instagramAccountsInScope } : allAccounts;
  const [filtersOpen, setFiltersOpen] = useState(false);

  const set = (patch: Partial<ReelsFilters>) => onChange({ ...filters, ...patch, page: 1 });

  const activeCount = [
    filters.status && filters.status !== "all",
    filters.creatorId && filters.creatorId !== "all",
    filters.instagramAccountId && filters.instagramAccountId !== "all",
    filters.dateRange && filters.dateRange !== "all",
  ].filter(Boolean).length;

  const clearAll = () => set({ status: "all", creatorId: "all", instagramAccountId: "all", dateRange: "all" });

  const collapse = useSpring({
    // Generous max-height rather than measuring the real one — cheap and correct here since
    // this panel's content is fixed (four selects), never taller than this ceiling.
    maxHeight: filtersOpen ? 160 : 0,
    opacity: filtersOpen ? 1 : 0,
    config: { tension: 300, friction: 30 },
  });

  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-2.5">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search username, creator, Reel ID…"
            className="pl-8"
            value={filters.search ?? ""}
            onChange={(e) => set({ search: e.target.value })}
          />
        </div>

        <Button
          type="button"
          variant={activeCount > 0 ? "secondary" : "outline"}
          size="sm"
          className="shrink-0"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
        >
          <ListFilter className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>

        <Select value={filters.sort ?? "newest"} onValueChange={(value) => set({ sort: value })}>
          <SelectTrigger className="shrink-0 sm:ml-auto sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>Sort: {o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <animated.div style={{ maxHeight: collapse.maxHeight, opacity: collapse.opacity }} className="overflow-hidden">
        <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-lg border border-border bg-accent/20 p-2.5 sm:grid-cols-4">
          <Select value={filters.status ?? "all"} onValueChange={(value) => set({ status: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.creatorId ?? "all"} onValueChange={(value) => set({ creatorId: value })}>
            <SelectTrigger><SelectValue placeholder="All creators" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All creators</SelectItem>
              {creators?.items.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.instagramAccountId ?? "all"} onValueChange={(value) => set({ instagramAccountId: value })}>
            <SelectTrigger><SelectValue placeholder="All accounts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts?.items.map((a) => (
                <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Select value={filters.dateRange ?? "all"} onValueChange={(value) => set({ dateRange: value })}>
              <SelectTrigger className={cn(activeCount === 0 && "flex-1")}><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={clearAll}
                title="Clear filters"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </animated.div>
    </div>
  );
}
