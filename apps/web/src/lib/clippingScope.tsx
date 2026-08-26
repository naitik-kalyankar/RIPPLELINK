import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { InstagramAccount } from "@kick-manager/shared";
import { useInstagramAccounts } from "@/api/instagram";
import { useClippingAccounts, type ClippingAccountStatus } from "@/api/clippingAccounts";

const STORAGE_KEY = "kick-manager:clipping-scope";

interface ClippingScope {
  /** null = "All Accounts" — the default, unscoped view. */
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedAccount: ClippingAccountStatus | null;
  /** null when unscoped, so callers know to omit any account filter entirely rather than
   * send an (incorrectly) empty list. */
  scopedInstagramAccountIds: string[] | null;
  instagramAccountsInScope: InstagramAccount[];
}

const ClippingScopeContext = createContext<ClippingScope | null>(null);

export function ClippingScopeProvider({ children }: { children: ReactNode }) {
  const { data: clippingAccounts } = useClippingAccounts();
  const { data: instagramAccounts } = useInstagramAccounts();
  const [selectedId, setSelectedIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setSelectedId = (id: string | null) => {
    setSelectedIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable (private mode, etc.) — scope just won't survive a reload
    }
  };

  const selectedAccount = clippingAccounts?.items.find((a) => a.id === selectedId) ?? null;

  // Self-heal: once accounts have loaded, a selectedId that no longer matches any real
  // ClippingAccount (e.g. it was deleted) resets to "All Accounts" instead of silently
  // scoping to nothing forever.
  useEffect(() => {
    if (!clippingAccounts || !selectedId) return;
    if (!clippingAccounts.items.some((a) => a.id === selectedId)) setSelectedId(null);
  }, [clippingAccounts, selectedId]);

  const instagramAccountsInScope = useMemo(
    () => (selectedId ? (instagramAccounts?.items ?? []).filter((a) => a.clippingAccountRefId === selectedId) : []),
    [instagramAccounts, selectedId]
  );

  const scopedInstagramAccountIds = selectedId ? instagramAccountsInScope.map((a) => a.id) : null;

  const value: ClippingScope = {
    selectedId,
    setSelectedId,
    selectedAccount,
    scopedInstagramAccountIds,
    instagramAccountsInScope,
  };

  return <ClippingScopeContext.Provider value={value}>{children}</ClippingScopeContext.Provider>;
}

export function useClippingScope(): ClippingScope {
  const ctx = useContext(ClippingScopeContext);
  if (!ctx) throw new Error("useClippingScope must be used within a ClippingScopeProvider");
  return ctx;
}
