import type { Message } from "discord.js";
import type { Player, SearchResult, UnresolvedSearchResult } from "lavalink-client";
import { getMusicNgWords } from "../../data";
import { searchAudiostock, buildAudiostockTrackInfo } from "../misc/audiostock";
import { isAudiostockExplicitQuery, extractAudiostockKeyword, buildSearchQueries, buildPendingTrackDedupKey, mergeSearchCandidates, PRIMARY_KEYWORD_SEARCH_PREFIXES, SECONDARY_KEYWORD_SEARCH_PREFIXES, parseExplicitKeywordSearchQuery } from "./searchQuery";
import type { PendingTrack } from "../misc/trackUtils";
import { handleSpotifyPlay } from "../spotify/spotifyPlay";

// ---------------------------------------------------------------------------
// searchTracks — thin wrapper around player.search
// ---------------------------------------------------------------------------

export async function searchTracks(
  player: Player,
  searchQuery: string,
  requester: Message["author"],
): Promise<SearchResult | UnresolvedSearchResult | null> {
  try {
    return await player.search({ query: searchQuery }, requester);
  } catch (error) {
    console.warn("[music] search error", { requesterId: requester.id, query: searchQuery }, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Keyword search
// ---------------------------------------------------------------------------

function buildKeywordSearchQueries(query: string): readonly string[] {
  const explicitSearchQuery = parseExplicitKeywordSearchQuery(query);
  if (explicitSearchQuery) return [explicitSearchQuery];
  return buildSearchQueries(query, PRIMARY_KEYWORD_SEARCH_PREFIXES);
}

function buildKeywordFallbackSearchQueries(query: string): readonly string[] {
  const explicitSearchQuery = parseExplicitKeywordSearchQuery(query);
  if (explicitSearchQuery) return [];
  return buildSearchQueries(query, SECONDARY_KEYWORD_SEARCH_PREFIXES);
}

export async function searchKeywordCandidates(
  player: Player,
  query: string,
  requester: Message["author"],
  limit: number,
): Promise<PendingTrack[]> {
  const mergedTracks: PendingTrack[] = [];
  const seen = new Set<string>();

  // Audiostock 明示的検索
  if (isAudiostockExplicitQuery(query)) {
    const keyword = extractAudiostockKeyword(query);
    const audiostockTracks = await searchAudiostock(keyword, limit);
    for (const ast of audiostockTracks) {
      const info = buildAudiostockTrackInfo(ast);
      const track = {
        encoded: `audiostock_${ast.id}`,
        info: {
          identifier: `audiostock_${ast.id}`,
          title: info.title,
          author: info.author,
          duration: info.durationMs,
          uri: info.uri,
          artworkUrl: info.artworkUrl,
          sourceName: "audiostock",
          isSeekable: true,
          isStream: false,
        },
        pluginInfo: {
          sourceName: "audiostock",
          author: info.author,
          uri: info.uri,
          url: ast.pageUrl,
        },
        userData: {},
      } as unknown as PendingTrack;
      mergedTracks.push(track);
    }
    return mergedTracks;
  }

  const searchQueryGroups = [
    buildKeywordSearchQueries(query),
    buildKeywordFallbackSearchQueries(query),
  ].filter((queries) => queries.length > 0);

  for (const searchQueries of searchQueryGroups) {
    const results = await Promise.all(
      searchQueries.map((searchQuery) => searchTracks(player, searchQuery, requester)),
    );
    const tracksByQuery = results.map(
      (result) => result?.tracks?.slice(0, limit) ?? [],
    );
    mergeSearchCandidates(mergedTracks, seen, tracksByQuery, limit);
    if (mergedTracks.length >= limit) break;
  }

  return mergedTracks;
}

// ---------------------------------------------------------------------------
// Spotify play entry point (re-export)
// ---------------------------------------------------------------------------

export { handleSpotifyPlay } from "../spotify/spotifyPlay";
