import type { Message } from "discord.js";
import {
  Player,
  type SearchResult,
  type UnresolvedSearchResult,
} from "lavalink-client";
import { getMusicNgWords } from "../data";
import {
  FIXED_VOLUME,
  MAX_TRACK_MINUTES,
  MAX_TRACK_MS,
  SPOTIFY_DEBUG_ENABLED,
} from "./constants";
import { clearPendingSearch } from "./state";
import {
  findNgWordMatch,
  formatTrackDuration,
  getTrackDurationMs,
  getTrackTitle,
  isStreamTrack,
  type PendingTrack,
} from "./trackUtils";
import {
  looksLikeSpotifyInput,
  resolveSpotifyInput,
  type SpotifyTrackMetadata,
} from "./spotifyUtils";

const SPOTIFY_DEBUG_TRACK_LOG_LIMIT = 5;
const SPOTIFY_SEARCH_RESULT_LIMIT = 5;
const SPOTIFY_SEARCH_MIN_SCORE = 45;
const SPOTIFY_SEARCH_EARLY_EXIT_SCORE = 90;
const PRIMARY_KEYWORD_SEARCH_PREFIXES = ["ytmsearch", "ytsearch"] as const;
const SECONDARY_KEYWORD_SEARCH_PREFIXES = ["scsearch", "bcsearch"] as const;
const EXPLICIT_KEYWORD_SEARCH_SOURCE_ALIASES: Readonly<
  Record<string, (typeof PRIMARY_KEYWORD_SEARCH_PREFIXES)[number] | (typeof SECONDARY_KEYWORD_SEARCH_PREFIXES)[number]>
> = {
  ytm: "ytmsearch",
  ytmsearch: "ytmsearch",
  youtubemusic: "ytmsearch",
  yt: "ytsearch",
  ytsearch: "ytsearch",
  youtube: "ytsearch",
  sc: "scsearch",
  scsearch: "scsearch",
  soundcloud: "scsearch",
  bc: "bcsearch",
  bcsearch: "bcsearch",
  bandcamp: "bcsearch",
};
const SPOTIFY_TITLE_NOISE_IGNORED_TERMS = new Set([
  "official",
  "music",
  "video",
  "audio",
  "lyrics",
  "lyric",
  "mv",
  "pv",
  "ver",
  "version",
  "feat",
  "featuring",
  "ft",
  "topic",
  "provided",
  "youtube",
  "公式",
  "原曲",
  "本家",
  "オリジナル",
]);

type SpotifyDebugContext = Readonly<{
  guildId: string;
  channelId: string;
  userId: string;
}>;

type TrackQueueValidation = Readonly<{
  errorMessage: string | null;
  hasDuration: boolean;
}>;

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function createSpotifyDebugContext(message: Message): SpotifyDebugContext {
  return {
    guildId: message.guildId ?? "unknown",
    channelId: message.channelId,
    userId: message.author.id,
  };
}

function logSpotifyDebug(
  context: SpotifyDebugContext,
  event: string,
  details?: Record<string, unknown>,
): void {
  if (!SPOTIFY_DEBUG_ENABLED) {
    return;
  }

  const prefix =
    `[spotify-debug] guild=${context.guildId} ` +
    `channel=${context.channelId} user=${context.userId} event=${event}`;

  if (details) {
    console.log(prefix, details);
    return;
  }

  console.log(prefix);
}

function warnSpotifyDebug(
  context: SpotifyDebugContext,
  event: string,
  details?: Record<string, unknown>,
  error?: unknown,
): void {
  if (!SPOTIFY_DEBUG_ENABLED) {
    return;
  }

  const prefix =
    `[spotify-debug] guild=${context.guildId} ` +
    `channel=${context.channelId} user=${context.userId} event=${event}`;

  if (details && error !== undefined) {
    console.warn(prefix, details, error);
    return;
  }

  if (details) {
    console.warn(prefix, details);
    return;
  }

  if (error !== undefined) {
    console.warn(prefix, error);
    return;
  }

  console.warn(prefix);
}

function errorSpotifyDebug(
  context: SpotifyDebugContext,
  event: string,
  details?: Record<string, unknown>,
  error?: unknown,
): void {
  if (!SPOTIFY_DEBUG_ENABLED) {
    return;
  }

  const prefix =
    `[spotify-debug] guild=${context.guildId} ` +
    `channel=${context.channelId} user=${context.userId} event=${event}`;

  if (details && error !== undefined) {
    console.error(prefix, details, error);
    return;
  }

  if (details) {
    console.error(prefix, details);
    return;
  }

  if (error !== undefined) {
    console.error(prefix, error);
    return;
  }

  console.error(prefix);
}

function formatSpotifyDebugQuery(query: string): string {
  return truncateText(query.trim(), 160);
}

function formatSpotifyDebugDuration(durationMs: number): string | null {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }

  return formatTrackDuration(durationMs) ?? `${durationMs}ms`;
}

function summarizeSpotifyTrackMetadata(
  track: SpotifyTrackMetadata,
): Record<string, unknown> {
  return {
    title: track.title,
    artist: track.artist,
    duration: formatSpotifyDebugDuration(track.durationMs),
    spotifyUrl: track.spotifyUrl,
  };
}

function summarizePendingTrackForDebug(
  track: PendingTrack | null | undefined,
): Record<string, unknown> | null {
  if (!track) {
    return null;
  }

  return {
    title: getTrackTitle(track),
    author: track.info?.author ?? null,
    source: track.info?.sourceName ?? null,
    identifier: track.info?.identifier ?? null,
    uri: track.info?.uri ?? null,
    duration: formatSpotifyDebugDuration(getTrackDurationMs(track)),
    isStream: isStreamTrack(track),
  };
}

function validateTrackForQueue(
  track: PendingTrack,
  ngWords: string[],
): TrackQueueValidation {
  const lengthMs = getTrackDurationMs(track);
  const isStream = isStreamTrack(track);
  const hasDuration = Number.isFinite(lengthMs) && lengthMs > 0;
  const shouldBlockStream = isStream && !hasDuration;

  if (shouldBlockStream) {
    return {
      errorMessage: `🚫 ライブ配信/長さ不明の曲は再生できません。（最大 ${MAX_TRACK_MINUTES} 分まで）`,
      hasDuration,
    };
  }

  if (hasDuration && lengthMs > MAX_TRACK_MS) {
    const mins = Math.floor(lengthMs / 60000);
    const secs = Math.floor((lengthMs % 60000) / 1000);
    return {
      errorMessage: `🚫 この曲は長すぎます（${mins}:${secs
        .toString()
        .padStart(2, "0")}）。最大 ${MAX_TRACK_MINUTES} 分までです。`,
      hasDuration,
    };
  }

  const ngMatch = findNgWordMatch(
    [track.info?.title, track.info?.author],
    ngWords,
  );
  if (ngMatch) {
    return {
      errorMessage: "🚫 NGワードが含まれているため再生できません。",
      hasDuration,
    };
  }

  return {
    errorMessage: null,
    hasDuration,
  };
}

function buildSpotifySearchQuery(track: SpotifyTrackMetadata): string {
  return [track.title, track.artist].filter(Boolean).join(" ").trim();
}

function parseExplicitKeywordSearchQuery(query: string): string | null {
  const trimmed = query.trim();
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const sourceCandidate = trimmed.slice(0, separatorIndex).toLowerCase();
  const normalizedSource = sourceCandidate.replace(/[^a-z]/g, "");
  const keyword = trimmed.slice(separatorIndex + 1).trim();
  if (!keyword) {
    return null;
  }

  const searchPrefix = EXPLICIT_KEYWORD_SEARCH_SOURCE_ALIASES[normalizedSource];
  if (!searchPrefix) {
    return null;
  }

  return `${searchPrefix}:${keyword}`;
}

function buildSearchQueries(
  query: string,
  prefixes: readonly string[],
): readonly string[] {
  return prefixes.map((prefix) => `${prefix}:${query}`);
}

function buildSpotifySearchQueryGroups(
  track: SpotifyTrackMetadata,
): readonly (readonly string[])[] {
  const query = buildSpotifySearchQuery(track);
  return [
    buildSearchQueries(query, ["ytmsearch"]),
    buildSearchQueries(query, ["ytsearch"]),
    buildSearchQueries(query, SECONDARY_KEYWORD_SEARCH_PREFIXES),
  ];
}

function normalizeSpotifyCandidateText(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[(){}\[\]"'`’“”]/g, " ")
    .replace(/[!?,.:;/\\|@#$%^&*_+=~\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSpotifyCandidateText(text: string | null | undefined): string {
  return normalizeSpotifyCandidateText(text).replace(/\s+/g, "");
}

function splitSpotifyCandidateTerms(text: string | null | undefined): string[] {
  return normalizeSpotifyCandidateText(text)
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function scoreSpotifyTextMatch(expected: string, actual: string): number {
  if (!expected || !actual) {
    return 0;
  }

  if (expected === actual) {
    return 70;
  }

  if (actual.includes(expected) || expected.includes(actual)) {
    return 55;
  }

  const expectedTerms = splitSpotifyCandidateTerms(expected);
  if (!expectedTerms.length) {
    return 0;
  }

  const matchedTerms = expectedTerms.filter((term) => actual.includes(term));
  if (!matchedTerms.length) {
    return 0;
  }

  return Math.round((matchedTerms.length / expectedTerms.length) * 35);
}

function getSpotifyCandidateTitleNoisePenalty(
  expectedTitle: string,
  expectedArtist: string,
  candidateTitle: string,
): { score: number; reasons: string[] } {
  const candidateTerms = splitSpotifyCandidateTerms(candidateTitle);
  if (candidateTerms.length < 4) {
    return { score: 0, reasons: [] };
  }

  const referenceTerms = new Set([
    ...splitSpotifyCandidateTerms(expectedTitle),
    ...splitSpotifyCandidateTerms(expectedArtist),
  ]);
  const extraTerms = candidateTerms.filter(
    (term) =>
      !referenceTerms.has(term) &&
      !SPOTIFY_TITLE_NOISE_IGNORED_TERMS.has(term),
  );

  if (extraTerms.length >= 4) {
    return { score: -25, reasons: ["title-noise:-25"] };
  }

  if (extraTerms.length >= 2) {
    return { score: -12, reasons: ["title-noise:-12"] };
  }

  return { score: 0, reasons: [] };
}

function getSpotifyCandidatePenalty(
  candidateTitle: string,
  candidateAuthor: string,
): { score: number; reasons: string[] } {
  const haystack = `${candidateTitle} ${candidateAuthor}`;
  const reasons: string[] = [];
  let score = 0;

  const heavyPenaltyKeywords = [
    "shorts",
    "#shorts",
    "切り抜き",
    "mirrativ",
    "ミラティブ",
    "reaction",
    "react",
    "歌い方",
    "解説",
    "tutorial",
    "講座",
    "ボイストレーナー",
  ];
  for (const keyword of heavyPenaltyKeywords) {
    if (haystack.includes(keyword)) {
      score -= 80;
      reasons.push(`penalty:${keyword}`);
      break;
    }
  }

  const mediumPenaltyKeywords = [
    "cover",
    "歌ってみた",
    "ライブ",
    "live",
    "remix",
    "nightcore",
    "slowed",
    "sped up",
    "instrumental",
    "karaoke",
    "弾いてみた",
    "叩いてみた",
    "演奏してみた",
    "弾き語り",
    "歌ってみました",
    "off vocal",
    "オフボーカル",
  ];
  for (const keyword of mediumPenaltyKeywords) {
    if (haystack.includes(keyword)) {
      score -= 25;
      reasons.push(`penalty:${keyword}`);
      break;
    }
  }

  return { score, reasons };
}

function scoreSpotifySearchCandidate(
  spotifyTrack: SpotifyTrackMetadata,
  candidate: PendingTrack,
  query: string,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const expectedTitleCompact = compactSpotifyCandidateText(spotifyTrack.title);
  const expectedArtistCompact = compactSpotifyCandidateText(spotifyTrack.artist);
  const candidateTitleRaw = getTrackTitle(candidate);
  const candidateAuthorRaw = candidate.info?.author ?? "";
  const candidateTitleCompact = compactSpotifyCandidateText(candidateTitleRaw);
  const candidateAuthorCompact = compactSpotifyCandidateText(candidateAuthorRaw);

  const titleScore = scoreSpotifyTextMatch(
    expectedTitleCompact,
    candidateTitleCompact,
  );
  score += titleScore;
  if (titleScore > 0) {
    reasons.push(`title:${titleScore}`);
  }

  const authorArtistScore = scoreSpotifyTextMatch(
    expectedArtistCompact,
    candidateAuthorCompact,
  );
  score += authorArtistScore;
  if (authorArtistScore > 0) {
    reasons.push(`artist-author:${authorArtistScore}`);
  }

  if (authorArtistScore === 0) {
    const titleArtistScore = scoreSpotifyTextMatch(
      expectedArtistCompact,
      candidateTitleCompact,
    );
    const reducedTitleArtistScore = Math.min(
      18,
      Math.round(titleArtistScore * 0.35),
    );
    score += reducedTitleArtistScore;
    if (reducedTitleArtistScore > 0) {
      reasons.push(`artist-title:${reducedTitleArtistScore}`);
    }
  }

  const durationMs = getTrackDurationMs(candidate);
  const durationDiffMs = Math.abs(durationMs - spotifyTrack.durationMs);
  if (Number.isFinite(durationMs) && durationMs > 0) {
    if (durationDiffMs <= 2_000) {
      score += 35;
      reasons.push("duration:35");
    } else if (durationDiffMs <= 5_000) {
      score += 25;
      reasons.push("duration:25");
    } else if (durationDiffMs <= 10_000) {
      score += 10;
      reasons.push("duration:10");
    } else if (durationDiffMs > 60_000) {
      score -= 35;
      reasons.push("duration:-35");
    } else if (durationDiffMs > 30_000) {
      score -= 15;
      reasons.push("duration:-15");
    }
  }

  if (candidate.info?.sourceName === "youtube") {
    score += 10;
    reasons.push("source:youtube");
  }

  if (query.startsWith("ytmsearch:")) {
    score += 8;
    reasons.push("query:ytmsearch");
  }

  const penalty = getSpotifyCandidatePenalty(
    normalizeSpotifyCandidateText(candidateTitleRaw),
    normalizeSpotifyCandidateText(candidateAuthorRaw),
  );
  score += penalty.score;
  reasons.push(...penalty.reasons);

  const titleNoisePenalty = getSpotifyCandidateTitleNoisePenalty(
    spotifyTrack.title,
    spotifyTrack.artist,
    candidateTitleRaw,
  );
  score += titleNoisePenalty.score;
  reasons.push(...titleNoisePenalty.reasons);

  return { score, reasons };
}

async function resolveSpotifyTrackCandidate(
  player: Player,
  spotifyTrack: SpotifyTrackMetadata,
  requester: Message["author"],
  debugContext: SpotifyDebugContext,
  index: number,
  totalTracks: number,
): Promise<PendingTrack | null> {
  const scoredCandidates: Array<{
    track: PendingTrack;
    query: string;
    score: number;
    reasons: string[];
  }> = [];

  for (const searchQueries of buildSpotifySearchQueryGroups(spotifyTrack)) {
    for (const searchQuery of searchQueries) {
      const result = await searchTracks(player, searchQuery, requester);
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
        scoredCandidates.push({
          track: candidate,
          query: searchQuery,
          score,
          reasons,
        });
      }
    }

    const bestScore = scoredCandidates.reduce(
      (currentBest, candidate) => Math.max(currentBest, candidate.score),
      Number.NEGATIVE_INFINITY,
    );
    if (bestScore >= SPOTIFY_SEARCH_EARLY_EXIT_SCORE) {
      break;
    }
  }

  if (!scoredCandidates.length) {
    return null;
  }

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
      spotifyTrack: summarizeSpotifyTrackMetadata(spotifyTrack),
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

function getSpotifyTypeLabel(type: "track" | "album" | "playlist"): string {
  switch (type) {
    case "track":
      return "曲";
    case "album":
      return "アルバム";
    case "playlist":
      return "プレイリスト";
    default:
      return "コンテンツ";
  }
}

export async function searchTracks(
  player: Player,
  searchQuery: string,
  requester: Message["author"],
): Promise<SearchResult | UnresolvedSearchResult | null> {
  try {
    return await player.search({ query: searchQuery }, requester);
  } catch (error) {
    console.warn(
      "[music] search error",
      {
        requesterId: requester.id,
        query: formatSpotifyDebugQuery(searchQuery),
      },
      error,
    );
    return null;
  }
}

function buildKeywordSearchQueries(query: string): readonly string[] {
  const explicitSearchQuery = parseExplicitKeywordSearchQuery(query);
  if (explicitSearchQuery) {
    return [explicitSearchQuery];
  }

  return buildSearchQueries(query, PRIMARY_KEYWORD_SEARCH_PREFIXES);
}

function buildKeywordFallbackSearchQueries(query: string): readonly string[] {
  const explicitSearchQuery = parseExplicitKeywordSearchQuery(query);
  if (explicitSearchQuery) {
    return [];
  }

  return buildSearchQueries(query, SECONDARY_KEYWORD_SEARCH_PREFIXES);
}

function buildPendingTrackDedupKey(track: PendingTrack): string {
  const sourceName = track.info?.sourceName ?? "unknown";
  const identifier = track.info?.identifier?.trim();
  if (identifier) {
    return `${sourceName}:${identifier}`;
  }

  const uri = track.info?.uri?.trim();
  if (uri) {
    return `${sourceName}:${uri}`;
  }

  return [
    sourceName,
    compactSpotifyCandidateText(getTrackTitle(track)),
    compactSpotifyCandidateText(track.info?.author ?? ""),
  ].join(":");
}

function mergeSearchCandidates(
  mergedTracks: PendingTrack[],
  seen: Set<string>,
  tracksByQuery: readonly PendingTrack[][],
  limit: number,
): void {
  const maxDepth = tracksByQuery.reduce(
    (currentMax, tracks) => Math.max(currentMax, tracks.length),
    0,
  );

  for (let index = 0; index < maxDepth && mergedTracks.length < limit; index += 1) {
    for (const tracks of tracksByQuery) {
      const track = tracks[index];
      if (!track) {
        continue;
      }

      const dedupKey = buildPendingTrackDedupKey(track);
      if (seen.has(dedupKey)) {
        continue;
      }

      seen.add(dedupKey);
      mergedTracks.push(track);
      if (mergedTracks.length >= limit) {
        break;
      }
    }
  }
}

export async function searchKeywordCandidates(
  player: Player,
  query: string,
  requester: Message["author"],
  limit: number,
): Promise<PendingTrack[]> {
  const mergedTracks: PendingTrack[] = [];
  const seen = new Set<string>();
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
    if (mergedTracks.length >= limit) {
      break;
    }
  }

  return mergedTracks;
}

export async function handleSpotifyPlay(
  message: Message,
  player: Player,
  query: string,
): Promise<boolean> {
  if (!looksLikeSpotifyInput(query)) {
    return false;
  }

  const guildId = message.guildId;
  if (!guildId) return true;
  const debugContext = createSpotifyDebugContext(message);

  clearPendingSearch(message);

  logSpotifyDebug(debugContext, "received-input", {
    query: formatSpotifyDebugQuery(query),
    playerConnected: player.connected,
    playerPlaying: player.playing,
    playerPaused: player.paused,
    queueSize: player.queue.tracks.length,
  });

  let spotifyResolution = null;
  try {
    spotifyResolution = await resolveSpotifyInput(query);
  } catch (error) {
    warnSpotifyDebug(
      debugContext,
      "resolve-error",
      {
        query: formatSpotifyDebugQuery(query),
      },
      error,
    );
  }

  if (!spotifyResolution?.tracks.length) {
    warnSpotifyDebug(debugContext, "resolve-empty", {
      query: formatSpotifyDebugQuery(query),
    });
    await message.reply(
      "⚠️ Spotify の公開トラック/アルバム/プレイリストを解決できませんでした。URL か URI を確認してください。",
    );
    return true;
  }

  const totalSpotifyTracks = spotifyResolution.tracks.length;
  logSpotifyDebug(debugContext, "resolved", {
    query: formatSpotifyDebugQuery(query),
    sourceUrl: spotifyResolution.sourceUrl,
    type: spotifyResolution.type,
    title: spotifyResolution.title,
    totalTracks: totalSpotifyTracks,
    truncated: spotifyResolution.truncated,
  });

  const ngWords = getMusicNgWords(guildId);
  const wasIdle = !player.playing && !player.paused;
  let addedCount = 0;
  let skippedCount = 0;
  let unknownDurationCount = 0;
  let firstAddedTitle: string | null = null;
  let lastQueuePosition: number | null = null;
  let firstFailureMessage: string | null = null;

  for (const [index, spotifyTrack] of spotifyResolution.tracks.entries()) {
    const shouldLogTrackDetail =
      totalSpotifyTracks <= SPOTIFY_DEBUG_TRACK_LOG_LIMIT ||
      index < SPOTIFY_DEBUG_TRACK_LOG_LIMIT;
    if (shouldLogTrackDetail) {
      logSpotifyDebug(debugContext, "search-start", {
        index: index + 1,
        totalTracks: totalSpotifyTracks,
        searchQuery: formatSpotifyDebugQuery(
          buildSpotifySearchQuery(spotifyTrack),
        ),
        spotifyTrack: summarizeSpotifyTrackMetadata(spotifyTrack),
      });
    } else if (index === SPOTIFY_DEBUG_TRACK_LOG_LIMIT) {
      logSpotifyDebug(debugContext, "search-log-truncated", {
        totalTracks: totalSpotifyTracks,
        omittedDetailedLogs: totalSpotifyTracks - SPOTIFY_DEBUG_TRACK_LOG_LIMIT,
      });
    }

    const resolvedTrack = await resolveSpotifyTrackCandidate(
      player,
      spotifyTrack,
      message.author,
      debugContext,
      index + 1,
      totalSpotifyTracks,
    );
    if (!resolvedTrack) {
      skippedCount += 1;
      firstFailureMessage ??=
        "🔍 Spotify の曲に対応する再生候補が見つかりませんでした…。";
      warnSpotifyDebug(debugContext, "search-no-result", {
        index: index + 1,
        totalTracks: totalSpotifyTracks,
        spotifyTrack: summarizeSpotifyTrackMetadata(spotifyTrack),
      });
      continue;
    }

    const validation = validateTrackForQueue(resolvedTrack, ngWords);
    if (validation.errorMessage) {
      skippedCount += 1;
      firstFailureMessage ??= validation.errorMessage;
      warnSpotifyDebug(debugContext, "queue-validation-failed", {
        index: index + 1,
        totalTracks: totalSpotifyTracks,
        reason: validation.errorMessage,
        resolvedTrack: summarizePendingTrackForDebug(resolvedTrack),
      });
      continue;
    }

    if (!validation.hasDuration) {
      unknownDurationCount += 1;
    }

    await player.queue.add(resolvedTrack);
    addedCount += 1;
    if (!firstAddedTitle) {
      firstAddedTitle = getTrackTitle(resolvedTrack);
    }
    lastQueuePosition = player.queue.tracks.length;

    if (shouldLogTrackDetail) {
      logSpotifyDebug(debugContext, "queue-added", {
        index: index + 1,
        totalTracks: totalSpotifyTracks,
        queuePosition: lastQueuePosition,
        resolvedTrack: summarizePendingTrackForDebug(resolvedTrack),
      });
    }
  }

  if (!addedCount) {
    warnSpotifyDebug(debugContext, "queue-empty-after-search", {
      totalTracks: totalSpotifyTracks,
      skippedCount,
      firstFailureMessage,
    });
    await message.reply(
      firstFailureMessage ??
        "🔍 Spotify から再生できる曲を見つけられませんでした…。",
    );
    return true;
  }

  if (wasIdle) {
    try {
      await player.play();
      logSpotifyDebug(debugContext, "play-started", {
        currentTrack: summarizePendingTrackForDebug(player.queue.current),
        queueSize: player.queue.tracks.length,
      });
    } catch (error) {
      errorSpotifyDebug(
        debugContext,
        "play-start-failed",
        {
          addedCount,
          skippedCount,
          queueSize: player.queue.tracks.length,
          currentTrack: summarizePendingTrackForDebug(player.queue.current),
        },
        error,
      );
      throw error;
    }
  }

  const lines: string[] = [];
  if (addedCount === 1 && firstAddedTitle) {
    if (wasIdle) {
      lines.push(`▶ 再生開始: **${firstAddedTitle}**（音量: ${FIXED_VOLUME}）`);
    } else {
      lines.push(
        `⏱ キューに追加しました: **${firstAddedTitle}**（位置: ${lastQueuePosition ?? 1}）`,
      );
    }
  } else {
    const typeLabel = getSpotifyTypeLabel(spotifyResolution.type);
    const actionLabel = wasIdle ? "再生キューに追加しました" : "キューに追加しました";
    lines.push(
      `🎵 Spotify の${typeLabel}を${actionLabel}: **${spotifyResolution.title}**（${addedCount}曲）`,
    );
  }

  lines.push(`🔗 Spotify: ${spotifyResolution.sourceUrl}`);

  if (spotifyResolution.truncated) {
    lines.push(
      `⚠️ 取り込み件数が多いため、先頭 ${spotifyResolution.tracks.length} 曲のみ追加対象にしました。`,
    );
  }
  if (skippedCount > 0) {
    lines.push(
      `⚠️ ${skippedCount} 曲は見つからないか、長すぎる/NGワードのため追加できませんでした。`,
    );
  }
  if (unknownDurationCount > 0) {
    lines.push(
      `⚠️ ${unknownDurationCount} 曲は長さを取得できないため、最大 ${MAX_TRACK_MINUTES} 分で自動停止します。`,
    );
  }

  logSpotifyDebug(debugContext, "completed", {
    type: spotifyResolution.type,
    title: spotifyResolution.title,
    addedCount,
    skippedCount,
    unknownDurationCount,
    wasIdle,
    queueSize: player.queue.tracks.length,
    currentTrack: summarizePendingTrackForDebug(player.queue.current),
  });

  await message.reply(lines.join("\n"));
  return true;
}
