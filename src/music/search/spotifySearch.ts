import type { Player } from "lavalink-client";
import type { PendingTrack } from "../misc/trackUtils";
import {
  SPOTIFY_SEARCH_RESULT_LIMIT,
  SPOTIFY_SEARCH_MIN_SCORE,
  SPOTIFY_SEARCH_EARLY_EXIT_SCORE,
  PRIMARY_KEYWORD_SEARCH_PREFIXES,
  SECONDARY_KEYWORD_SEARCH_PREFIXES,
} from "./searchQuery";
import type { SpotifyDebugContext } from "./searchDebug";
import {
  logSpotifyDebug,
  warnSpotifyDebug,
  formatSpotifyDebugQuery,
  summarizePendingTrackForDebug,
} from "./searchDebug";
import type { SpotifyTrackMetadata } from "../spotify/spotifyUtils";
import { scoreSpotifySearchCandidate, type ScoredCandidate } from "./spotifyScoring";

// ---------------------------------------------------------------------------
// Spotify search query groups
// ---------------------------------------------------------------------------

function buildSpotifySearchQuery(track: SpotifyTrackMetadata): string {
  return [track.title, track.artist].filter(Boolean).join(" ").trim();
}

function buildSpotifySearchQueryGroups(
  track: SpotifyTrackMetadata,
): readonly (readonly string[])[] {
  const query = buildSpotifySearchQuery(track);
  return [
    [`${PRIMARY_KEYWORD_SEARCH_PREFIXES[0]}:${query}`],
    [`${PRIMARY_KEYWORD_SEARCH_PREFIXES[1]}:${query}`],
    SECONDARY_KEYWORD_SEARCH_PREFIXES.map((p) => `${p}:${query}`),
  ];
}

// ---------------------------------------------------------------------------
// Resolve a single Spotify track to a PendingTrack
// ---------------------------------------------------------------------------

export async function resolveSpotifyTrackCandidate(
  player: Player,
  spotifyTrack: SpotifyTrackMetadata,
  requester: { id: string },
  debugContext: SpotifyDebugContext,
  index: number,
  totalTracks: number,
): Promise<PendingTrack | null> {
  const scoredCandidates: ScoredCandidate[] = [];

  for (const searchQueries of buildSpotifySearchQueryGroups(spotifyTrack)) {
    for (const searchQuery of searchQueries) {
      const result = await player.search({ query: searchQuery }, requester);
      const candidates = result?.tracks?.slice(0, SPOTIFY_SEARCH_RESULT_LIMIT) ?? [];
      if (!candidates.length) {
        warnSpotifyDebug(debugContext, "search-query-empty", {
          index,
          totalTracks,
          searchQuery: formatSpotifyDebugQuery(searchQuery),
        });
        continue;
      }

      for (const candidate of candidates) {
        const { score, reasons } = scoreSpotifySearchCandidate(
          spotifyTrack,
          candidate,
          searchQuery,
        );
        scoredCandidates.push({ track: candidate, query: searchQuery, score, reasons });
      }
    }

    // Early exit optimization
    const bestScore = scoredCandidates.reduce(
      (currentBest, candidate) => Math.max(currentBest, candidate.score),
      Number.NEGATIVE_INFINITY,
    );
    if (bestScore >= SPOTIFY_SEARCH_EARLY_EXIT_SCORE) break;
  }

  if (!scoredCandidates.length) return null;

  scoredCandidates.sort((left, right) => right.score - left.score);
  const best = scoredCandidates[0];

  logSpotifyDebug(debugContext, "search-candidates", {
    index,
    totalTracks,
    topCandidates: scoredCandidates.slice(0, 3).map((candidate) => ({
      score: candidate.score,
      query: formatSpotifyDebugQuery(candidate.query),
      reasons: candidate.reasons,
      track: summarizePendingTrackForDebug(candidate.track),
    })),
  });

  if (best.score < SPOTIFY_SEARCH_MIN_SCORE) {
    warnSpotifyDebug(debugContext, "search-low-confidence", {
      index,
      totalTracks,
      minimumScore: SPOTIFY_SEARCH_MIN_SCORE,
      bestScore: best.score,
      bestCandidate: {
        query: formatSpotifyDebugQuery(best.query),
        reasons: best.reasons,
        track: summarizePendingTrackForDebug(best.track),
      },
      spotifyTrack: {
        title: spotifyTrack.title,
        artist: spotifyTrack.artist,
        duration: spotifyTrack.durationMs,
        spotifyUrl: spotifyTrack.spotifyUrl,
      },
    });
    return null;
  }

  logSpotifyDebug(debugContext, "search-selected", {
    index,
    totalTracks,
    score: best.score,
    query: formatSpotifyDebugQuery(best.query),
    reasons: best.reasons,
    track: summarizePendingTrackForDebug(best.track),
  });

  return best.track;
}
