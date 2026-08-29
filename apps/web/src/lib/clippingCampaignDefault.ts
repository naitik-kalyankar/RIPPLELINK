import { useState } from "react";

const STORAGE_KEY = "kick-manager:default-campaign-id";

// The campaign ID every CLIPPING account has used so far ("Kick Clipping") — pre-fills
// AddClippingAccountModal's Campaign ID field so it doesn't have to be retyped by hand for
// every new account. Editable/resettable from the Settings page in case a different campaign
// ever needs to become the default.
export const DEFAULT_CLIPPING_CAMPAIGN_ID = "6825752777a6ce103f6bdba0";

export function useDefaultClippingCampaignId() {
  const [value, setValueState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_CLIPPING_CAMPAIGN_ID;
    } catch {
      return DEFAULT_CLIPPING_CAMPAIGN_ID;
    }
  });

  const setValue = (next: string) => {
    setValueState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private mode, etc.) — default just won't survive a reload
    }
  };

  const reset = () => setValue(DEFAULT_CLIPPING_CAMPAIGN_ID);

  return { value, setValue, reset, isDefault: value === DEFAULT_CLIPPING_CAMPAIGN_ID };
}
