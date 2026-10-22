import type { SearchResult, UnresolvedSearchResult } from "lavalink-client";

/** Lavalink can report a load failure in a resolved response instead of rejecting. */
export function logSearchResultError(
  result: SearchResult | UnresolvedSearchResult | null | undefined,
  context: {
    guildId: string;
    query: string;
    requesterId?: string;
    operation: string;
  },
): void {
  if (result?.loadType !== "error") return;
  console.warn("[music] Lavalink track load failed", context, result.exception);
}
