import { useQuery } from "@tanstack/react-query";
import type { Creator } from "@kick-manager/shared";
import { apiClient } from "@/lib/apiClient";

/** Creators are auto-created by OCR detection now — no manage/review UI, just this list for
 * the Reels page's creator filter dropdown. */
export function useCreators() {
  return useQuery({
    queryKey: ["creators"],
    queryFn: () => apiClient.get<{ items: Creator[] }>("/api/creators"),
  });
}
