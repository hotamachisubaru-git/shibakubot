import type { PendingTrack } from "../misc/trackUtils";
import type { SpotifyTrackMetadata } from "../spotify/spotifyUtils";
import { SPOTIFY_TITLE_NOISE_IGNORED_TERMS } from "./searchQuery";
import { getTrackDurationMs, getTrackTitle } from "../misc/trackUtils";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type ScoredCandidate = Readonly<{
  track: PendingTrack;
  query: string;
  score: number;
  reasons: string[];
}>;

// ---------------------------------------------------------------------------
// Text normalization helpers
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
// Scoring helpers
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
// Main scoring function
// ---------------------------------------------------------------------------

export function scoreSpotifySearchCandidate(
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

  // Title match
  const titleScore = scoreSpotifyTextMatch(expectedTitleCompact, candidateTitleCompact);
  score += titleScore;
  if (titleScore > 0) reasons.push(`title:${titleScore}`);

  // Author vs Artist match
  const authorArtistScore = scoreSpotifyTextMatch(expectedArtistCompact, candidateAuthorCompact);
  score += authorArtistScore;
  if (authorArtistScore > 0) reasons.push(`artist-author:${authorArtistScore}`);

  // Fallback: Artist vs Title match
  if (authorArtistScore === 0) {
    const titleArtistScore = scoreSpotifyTextMatch(expectedArtistCompact, candidateTitleCompact);
    const reducedTitleArtistScore = Math.min(18, Math.round(titleArtistScore * 0.35));
    score += reducedTitleArtistScore;
    if (reducedTitleArtistScore > 0) reasons.push(`artist-title:${reducedTitleArtistScore}`);
  }

  // Duration scoring
  const durationMs = getTrackDurationMs(candidate);
  const durationDiffMs = Math.abs(durationMs - spotifyTrack.durationMs);
  if (Number.isFinite(durationMs) && durationMs > 0) {
    if (durationDiffMs <= 2_000) { score += 35; reasons.push("duration:35"); }
    else if (durationDiffMs <= 5_000) { score += 25; reasons.push("duration:25"); }
    else if (durationDiffMs <= 10_000) { score += 10; reasons.push("duration:10"); }
    else if (durationDiffMs > 60_000) { score -= 35; reasons.push("duration:-35"); }
    else if (durationDiffMs > 30_000) { score -= 15; reasons.push("duration:-15"); }
  }

  // Source bonus
  if (candidate.info?.sourceName === "youtube") {
    score += 10;
    reasons.push("source:youtube");
  }

  // Query source bonus
  if (query.startsWith("ytmsearch:")) {
    score += 8;
    reasons.push("query:ytmsearch");
  }

  // Penalties
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

// ---------------------------------------------------------------------------
// Re-export for resolve logic
// ---------------------------------------------------------------------------

export type { ScoredCandidate };
