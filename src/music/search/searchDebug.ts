import type { Message } from "discord.js";
import { SPOTIFY_DEBUG_ENABLED } from "../misc/constants";
import { formatTrackDuration, getTrackDurationMs, getTrackTitle, isStreamTrack, type PendingTrack } from "../misc/trackUtils";

const SPOTIFY_DEBUG_TRACK_LOG_LIMIT = 5;

export { SPOTIFY_DEBUG_TRACK_LOG_LIMIT };

// ---------------------------------------------------------------------------
// SpotifyDebugContext
// ---------------------------------------------------------------------------

export type SpotifyDebugContext = Readonly<{
  guildId: string;
  channelId: string;
  userId: string;
}>;

export function createSpotifyDebugContext(message: Message): SpotifyDebugContext {
  return {
    guildId: message.guildId ?? "unknown",
    channelId: message.channelId,
    userId: message.author.id,
  };
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

type DebugEvent = "search-candidates" | "search-selected" | "search-start" | "queue-added" | "play-started" | "completed" | "received-input" | "resolved" | "search-log-truncated";
type WarnEvent = "search-query-empty" | "search-low-confidence" | "search-no-result" | "queue-validation-failed" | "queue-empty-after-search" | "resolve-error" | "resolve-empty";
type ErrorEvent = "play-start-failed";
type InfoEvent = "search-log-truncated";

function buildPrefix(context: SpotifyDebugContext, event: string): string {
  return `[spotify-debug] guild=${context.guildId} channel=${context.channelId} user=${context.userId} event=${event}`;
}

function logSpotifyDebug(context: SpotifyDebugContext, event: DebugEvent, details?: Record<string, unknown>): void {
  if (!SPOTIFY_DEBUG_ENABLED) return;
  const prefix = buildPrefix(context, event);
  details ? console.log(prefix, details) : console.log(prefix);
}

function warnSpotifyDebug(context: SpotifyDebugContext, event: WarnEvent, details?: Record<string, unknown>, error?: unknown): void {
  if (!SPOTIFY_DEBUG_ENABLED) return;
  const prefix = buildPrefix(context, event);
  if (details && error !== undefined) { console.warn(prefix, details, error); return; }
  if (details) { console.warn(prefix, details); return; }
  if (error !== undefined) { console.warn(prefix, error); return; }
  console.warn(prefix);
}

function errorSpotifyDebug(context: SpotifyDebugContext, event: ErrorEvent, details?: Record<string, unknown>, error?: unknown): void {
  if (!SPOTIFY_DEBUG_ENABLED) return;
  const prefix = buildPrefix(context, event);
  if (details && error !== undefined) { console.error(prefix, details, error); return; }
  if (details) { console.error(prefix, details); return; }
  if (error !== undefined) { console.error(prefix, error); return; }
  console.error(prefix);
}

// ---------------------------------------------------------------------------
// Summary / formatting helpers
// ---------------------------------------------------------------------------

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatSpotifyDebugQuery(query: string): string {
  return truncateText(query.trim(), 160);
}

function formatSpotifyDebugDuration(durationMs: number): string | null {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  return formatTrackDuration(durationMs) ?? `${durationMs}ms`;
}

function summarizeSpotifyTrackMetadata(
  track: Readonly<{ title: string; artist: string; durationMs: number; spotifyUrl: string }>,
): Record<string, unknown> {
  return {
    title: track.title,
    artist: track.artist,
    duration: formatSpotifyDebugDuration(track.durationMs),
    spotifyUrl: track.spotifyUrl,
  };
}

function summarizePendingTrackForDebug(track: PendingTrack | null | undefined): Record<string, unknown> | null {
  if (!track) return null;
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

// ---------------------------------------------------------------------------
// Re-export for consumers that need them
// ---------------------------------------------------------------------------

export {
  logSpotifyDebug,
  warnSpotifyDebug,
  errorSpotifyDebug,
  formatSpotifyDebugQuery,
  formatSpotifyDebugDuration,
  summarizeSpotifyTrackMetadata,
  summarizePendingTrackForDebug,
};
