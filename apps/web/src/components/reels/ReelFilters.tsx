import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreators } from "@/api/creators";
import { useInstagramAccounts } from "@/api/instagram";
import { useClippingScope } from "@/lib/clippingScope";
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

export function ReelFilters({ filters, onChange }: ReelFiltersProps) {
  const { data: creators } = useCreators();
  const { data: allAccounts } = useInstagramAccounts();
  const { selectedId, instagramAccountsInScope } = useClippingScope();
  // Restricted to the active CLIPPING account's own Instagram accounts when scoped — can't
  // pick an account outside the current scope, since it wouldn't show anything anyway.
  const accounts = selectedId ? { items: instagramAccountsInScope } : allAccounts;

  const set = (patch: Partial<ReelsFilters>) => onChange({ ...filters, ...patch, page: 1 });

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search username, creator, Reel ID…"
          className="pl-8"
          value={filters.search ?? ""}
          onChange={(e) => set({ search: e.target.value })}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={filters.status ?? "all"} onValueChange={(value) => set({ status: value })}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.creatorId ?? "all"} onValueChange={(value) => set({ creatorId: value })}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-40"><SelectValue placeholder="All creators" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All creators</SelectItem>
            {creators?.items.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.instagramAccountId ?? "all"} onValueChange={(value) => set({ instagramAccountId: value })}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-44"><SelectValue placeholder="All accounts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts?.items.map((a) => (
              <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.dateRange ?? "all"} onValueChange={(value) => set({ dateRange: value })}>
          <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DATE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.sort ?? "newest"} onValueChange={(value) => set({ sort: value })}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>Sort: {o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
