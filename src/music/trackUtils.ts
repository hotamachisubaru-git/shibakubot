import { Message } from "discord.js";
import {
  LavalinkManager,
  Player,
  Track,
  UnresolvedTrack,
} from "lavalink-client";

export type PendingTrack = Track | UnresolvedTrack;

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
