import { Message } from "discord.js";
import {
  LavalinkManager,
  Player,
  Track,
  UnresolvedTrack,
} from "lavalink-client";

export type PendingTrack = Track | UnresolvedTrack;
export type TrackDisplayOverrides = Readonly<{
  title?: string;
  author?: string;
  uri?: string;
  artworkUrl?: string | null;
}>;

type ShibakuTrackPluginInfo = PendingTrack["pluginInfo"] & {
  shibakuRecoveredByYtDlp?: boolean;
  shibakuOriginalSourceUrl?: string;
  shibakuForcedDurationMs?: number;
};

export function getLavalink(message: Message): LavalinkManager<Player> | null {
  const client = message.client as Message["client"] & {
    lavalink?: LavalinkManager<Player>;
  };
  return client.lavalink ?? null;
}

export function getTrackId(track: PendingTrack | null | undefined): string {
  return track?.info.identifier ?? track?.encoded ?? "";
}

export function getTrackDurationMs(track: PendingTrack): number {
  const forcedDuration = (track.pluginInfo as ShibakuTrackPluginInfo)
    .shibakuForcedDurationMs;
  if (typeof forcedDuration === "number" && Number.isFinite(forcedDuration)) {
    return forcedDuration;
  }
  const info = track.info as UnresolvedTrack["info"] & { length?: number };
  const rawDuration = info.duration ?? info.length ?? 0;
  return Number(rawDuration);
}

export function isStreamTrack(track: PendingTrack): boolean {
  return track.info.isStream === true;
}

export function getTrackTitle(track: PendingTrack): string {
  const title = track.info.title?.trim();
  return title && title.length > 0 ? title : "Unknown title";
}

export function applyTrackDisplayOverrides(
  track: PendingTrack,
  overrides: TrackDisplayOverrides,
): void {
  const title = overrides.title?.trim();
  if (title) {
    track.info.title = title;
  }

  const author = overrides.author?.trim();
  if (author) {
    track.info.author = author;
    track.pluginInfo.author = author;
  }

  const uri = overrides.uri?.trim();
  if (uri) {
    track.info.uri = uri;
    track.pluginInfo.uri = uri;
    track.pluginInfo.url = uri;
  }

  const artworkUrl = overrides.artworkUrl?.trim();
  if (artworkUrl) {
    track.info.artworkUrl = artworkUrl;
    track.pluginInfo.artworkUrl = artworkUrl;
    track.pluginInfo.albumArtUrl ??= artworkUrl;
  }
}

export function markTrackAsRecoveredByYtDlp(
  track: PendingTrack,
  originalSourceUrl: string,
): void {
  const pluginInfo = track.pluginInfo as ShibakuTrackPluginInfo;
  pluginInfo.shibakuRecoveredByYtDlp = true;
  const sourceUrl = originalSourceUrl.trim();
  if (sourceUrl) {
    pluginInfo.shibakuOriginalSourceUrl = sourceUrl;
  }
}

export function applyTrackDurationOverride(
  track: PendingTrack,
  durationMs: number | null | undefined,
): void {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0) {
    return;
  }

  const normalizedDuration = Math.round(durationMs);
  const pluginInfo = track.pluginInfo as ShibakuTrackPluginInfo;
  pluginInfo.shibakuForcedDurationMs = normalizedDuration;

  const info = track.info as UnresolvedTrack["info"] & { length?: number };
  info.duration = normalizedDuration;
  info.length = normalizedDuration;
}

export function isTrackRecoveredByYtDlp(track: PendingTrack): boolean {
  return (track.pluginInfo as ShibakuTrackPluginInfo).shibakuRecoveredByYtDlp === true;
}

export function getRecoveredTrackOriginalSourceUrl(
  track: PendingTrack,
): string | null {
  const value = (track.pluginInfo as ShibakuTrackPluginInfo)
    .shibakuOriginalSourceUrl;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function findNgWordMatch(
  texts: Array<string | undefined>,
  ngWords: string[],
): string | null {
  if (!ngWords.length) return null;
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return null;
  return ngWords.find((word) => word && haystack.includes(word)) ?? null;
}

export function formatTrackDuration(lengthMs: number): string {
  if (!Number.isFinite(lengthMs) || lengthMs <= 0) return "";
  const totalSeconds = Math.floor(lengthMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function normalizeYouTubeShortsUrl(input: string): string {
  if (!/^https?:\/\//i.test(input)) return input;
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const isYouTube =
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com";
    if (!isYouTube) return input;

    const match = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
    if (!match) return input;

    const id = match[1];
    const out = new URL("https://www.youtube.com/watch");
    out.searchParams.set("v", id);
    const t = url.searchParams.get("t") ?? url.searchParams.get("start");
    if (t) out.searchParams.set("t", t);
    return out.toString();
  } catch {
    return input;
  }
}
