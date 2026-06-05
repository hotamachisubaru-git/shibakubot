import type { MusicPlaybackLimit } from "./limits";
import {
  findNgWordMatch,
  getTrackDurationMs,
  getTrackTitle,
  isStreamTrack,
  type PendingTrack,
} from "./trackUtils";

export type TrackQueueValidation = Readonly<{
  errorMessage: string | null;
  hasDuration: boolean;
}>;

export type TrackQueueValidationOptions = Readonly<{
  ngWordTargets?: readonly (string | undefined)[];
  ngWordMessage?: (matchedWord: string) => string;
}>;

function formatDurationForMessage(durationMs: number): string {
  const mins = Math.floor(durationMs / 60_000);
  const secs = Math.floor((durationMs % 60_000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function buildUnknownDurationBlockedMessage(
  limit: MusicPlaybackLimit,
): string {
  return `🚫 ライブ配信/長さ不明の曲は再生できません。（最大 ${limit.maxTrackMinutes} 分まで）`;
}

export function buildTrackTooLongMessage(
  title: string | null,
  durationMs: number,
  limit: MusicPlaybackLimit,
): string {
  const duration = formatDurationForMessage(durationMs);
  if (title) {
    return `🚫 **${title}** は長すぎます（${duration}）。最大 ${limit.maxTrackMinutes} 分までです。`;
  }

  return `🚫 この曲は長すぎます（${duration}）。最大 ${limit.maxTrackMinutes} 分までです。`;
}

export function validateTrackForQueue(
  track: PendingTrack,
  ngWords: string[],
  limit: MusicPlaybackLimit,
  options?: TrackQueueValidationOptions,
): TrackQueueValidation {
  const lengthMs = getTrackDurationMs(track);
  const isStream = isStreamTrack(track);
  const hasDuration = Number.isFinite(lengthMs) && lengthMs > 0;
  const shouldBlockStream = isStream && !hasDuration;

  if (shouldBlockStream) {
    return {
      errorMessage: buildUnknownDurationBlockedMessage(limit),
      hasDuration,
    };
  }

  if (hasDuration && lengthMs > limit.maxTrackMs) {
    return {
      errorMessage: buildTrackTooLongMessage(null, lengthMs, limit),
      hasDuration,
    };
  }

  const ngMatch = findNgWordMatch(
    [...(options?.ngWordTargets ?? [getTrackTitle(track)])],
    ngWords,
  );
  if (ngMatch) {
    return {
      errorMessage:
        options?.ngWordMessage?.(ngMatch) ??
        `🚫 タイトルにNGワード「${ngMatch}」が含まれているため再生できません。`,
      hasDuration,
    };
  }

  return { errorMessage: null, hasDuration };
}

export function buildExternalTrackBlockedMessage(
  title: string,
  durationMs: number | null,
  isLive: boolean,
  limit: MusicPlaybackLimit,
): string | null {
  if (isLive || durationMs === null) {
    return buildUnknownDurationBlockedMessage(limit);
  }

  if (durationMs > limit.maxTrackMs) {
    return buildTrackTooLongMessage(title, durationMs, limit);
  }

  return null;
}

