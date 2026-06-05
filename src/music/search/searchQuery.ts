import type { PendingTrack } from "../misc/trackUtils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPOTIFY_SEARCH_RESULT_LIMIT = 5;
const SPOTIFY_SEARCH_MIN_SCORE = 45;
const SPOTIFY_SEARCH_EARLY_EXIT_SCORE = 90;

const PRIMARY_KEYWORD_SEARCH_PREFIXES = ["ytmsearch", "ytsearch"] as const;
const SECONDARY_KEYWORD_SEARCH_PREFIXES = ["scsearch", "bcsearch"] as const;

const EXPLICIT_KEYWORD_SEARCH_SOURCE_ALIASES: Readonly<
  Record<string, (typeof PRIMARY_KEYWORD_SEARCH_PREFIXES)[number] | (typeof SECONDARY_KEYWORD_SEARCH_PREFIXES)[number] | "audiostock">
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
  as: "audiostock",
  audiostock: "audiostock",
};

const SPOTIFY_TITLE_NOISE_IGNORED_TERMS = new Set([
  "official", "music", "video", "audio", "lyrics", "lyric",
  "mv", "pv", "ver", "version", "feat", "featuring", "ft",
  "topic", "provided", "youtube", "公式", "原曲", "本家", "オリジナル",
]);

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export {
  SPOTIFY_SEARCH_RESULT_LIMIT,
  SPOTIFY_SEARCH_MIN_SCORE,
  SPOTIFY_SEARCH_EARLY_EXIT_SCORE,
  PRIMARY_KEYWORD_SEARCH_PREFIXES,
  SECONDARY_KEYWORD_SEARCH_PREFIXES,
  EXPLICIT_KEYWORD_SEARCH_SOURCE_ALIASES,
  SPOTIFY_TITLE_NOISE_IGNORED_TERMS,
};

// ---------------------------------------------------------------------------
// Query building
// ---------------------------------------------------------------------------

export function buildSearchQueries(query: string, prefixes: readonly string[]): readonly string[] {
  return prefixes.map((prefix) => `${prefix}:${query}`);
}

export function parseExplicitKeywordSearchQuery(query: string): string | null {
  const trimmed = query.trim();
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex <= 0) return null;

  const sourceCandidate = trimmed.slice(0, separatorIndex).toLowerCase();
  const normalizedSource = sourceCandidate.replace(/[^a-z]/g, "");
  const keyword = trimmed.slice(separatorIndex + 1).trim();
  if (!keyword) return null;

  const searchPrefix = EXPLICIT_KEYWORD_SEARCH_SOURCE_ALIASES[normalizedSource];
  if (!searchPrefix) return null;

  return `${searchPrefix}:${keyword}`;
}

export function isAudiostockExplicitQuery(query: string): boolean {
  return parseExplicitKeywordSearchQuery(query)?.startsWith("audiostock:") ?? false;
}

export function extractAudiostockKeyword(query: string): string {
  const explicit = parseExplicitKeywordSearchQuery(query);
  if (explicit?.startsWith("audiostock:")) {
    return explicit.slice("audiostock:".length);
  }
  return query.trim();
}

// ---------------------------------------------------------------------------
// Candidate text normalization
// ---------------------------------------------------------------------------

function normalizeSpotifyCandidateText(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[(){}[\]"'`''""]/g, " ")
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

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreSpotifyTextMatch(expected: string, actual: string): number {
  if (!expected || !actual) return 0;
  if (expected === actual) return 70;
  if (actual.includes(expected) || expected.includes(actual)) return 55;

  const expectedTerms = splitSpotifyCandidateTerms(expected);
  if (!expectedTerms.length) return 0;

  const matchedTerms = expectedTerms.filter((term) => actual.includes(term));
  if (!matchedTerms.length) return 0;

  return Math.round((matchedTerms.length / expectedTerms.length) * 35);
}

function getSpotifyCandidateTitleNoisePenalty(
  expectedTitle: string,
  expectedArtist: string,
  candidateTitle: string,
): { score: number; reasons: string[] } {
  const candidateTerms = splitSpotifyCandidateTerms(candidateTitle);
  if (candidateTerms.length < 4) return { score: 0, reasons: [] };

  const referenceTerms = new Set([
    ...splitSpotifyCandidateTerms(expectedTitle),
    ...splitSpotifyCandidateTerms(expectedArtist),
  ]);
  const extraTerms = candidateTerms.filter(
    (term) => !referenceTerms.has(term) && !SPOTIFY_TITLE_NOISE_IGNORED_TERMS.has(term),
  );

  if (extraTerms.length >= 4) return { score: -25, reasons: ["title-noise:-25"] };
  if (extraTerms.length >= 2) return { score: -12, reasons: ["title-noise:-12"] };
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
    "shorts", "#shorts", "切り抜き", "mirrativ", "ミラティブ",
    "reaction", "react", "歌い方", "解説", "tutorial",
    "講座", "ボイストレーナー",
  ];
  for (const keyword of heavyPenaltyKeywords) {
    if (haystack.includes(keyword)) {
      score -= 80;
      reasons.push(`penalty:${keyword}`);
      break;
    }
  }

  const mediumPenaltyKeywords = [
    "cover", "歌ってみた", "ライブ", "live", "remix",
    "nightcore", "slowed", "sped up", "instrumental", "karaoke",
    "弾いてみた", "叩いてみた", "演奏してみた", "弾き語り",
    "歌ってみました", "off vocal", "オフボーカル",
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

// ---------------------------------------------------------------------------
// PendingTrack dedup key
// ---------------------------------------------------------------------------

export function buildPendingTrackDedupKey(track: PendingTrack): string {
  const sourceName = track.info?.sourceName ?? "unknown";
  const identifier = track.info?.identifier?.trim();
  if (identifier) return `${sourceName}:${identifier}`;

  const uri = track.info?.uri?.trim();
  if (uri) return `${sourceName}:${uri}`;

  return [sourceName, compactSpotifyCandidateText(track.info?.author ?? "")].join(":");
}

// ---------------------------------------------------------------------------
// Merge candidates from multiple query groups
// ---------------------------------------------------------------------------

export function mergeSearchCandidates(
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
      if (!track) continue;

      const dedupKey = buildPendingTrackDedupKey(track);
      if (seen.has(dedupKey)) continue;

      seen.add(dedupKey);
      mergedTracks.push(track);
      if (mergedTracks.length >= limit) break;
    }
  }
}
