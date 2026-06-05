import { Message } from "discord.js";
import { PENDING_SEARCH_TTL_MS } from "../misc/constants";
import type { PendingSearch, RetrySelectionContext } from "./state-types";
import { getTrackId, type PendingTrack } from "../misc/trackUtils";

const pendingSearches = new Map<string, PendingSearch>();
const retrySelections = new Map<string, RetrySelectionContext>();

function makePendingKey(message: Message): string {
  return `${message.guildId}:${message.author.id}`;
}

function makePendingKeyForUser(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function makeRetrySelectionKey(guildId: string, track: PendingTrack): string {
  return `${guildId}:${getTrackId(track)}`;
}

export function getPendingSearch(message: Message): PendingSearch | null {
  const key = makePendingKey(message);
  const pending = pendingSearches.get(key);
  if (!pending) return null;
  if (pending.expiresAt <= Date.now()) {
    pendingSearches.delete(key);
    return null;
  }
  return pending;
}

export function setPendingSearch(message: Message, tracks: PendingTrack[], query: string): void {
  const key = makePendingKey(message);
  pendingSearches.set(key, {
    tracks,
    query,
    expiresAt: Date.now() + PENDING_SEARCH_TTL_MS,
  });
}

export function setPendingSearchForUser(guildId: string, userId: string, tracks: PendingTrack[], query: string): void {
  const key = makePendingKeyForUser(guildId, userId);
  pendingSearches.set(key, {
    tracks,
    query,
    expiresAt: Date.now() + PENDING_SEARCH_TTL_MS,
  });
}

export function clearPendingSearch(message: Message): void {
  pendingSearches.delete(makePendingKey(message));
}

export function registerRetrySelection(message: Message, tracks: PendingTrack[], query: string, selectedIndex: number): void {
  const guildId = message.guildId;
  if (!guildId) return;

  const selectedTrack = tracks[selectedIndex];
  if (!selectedTrack) return;

  const remainingTracks = tracks.filter((_, index) => index !== selectedIndex);
  if (!remainingTracks.length) return;

  retrySelections.set(makeRetrySelectionKey(guildId, selectedTrack), {
    requesterId: message.author.id,
    channelId: message.channelId,
    query,
    remainingTracks,
  });
}

export function consumeRetrySelection(guildId: string, track: PendingTrack | null | undefined): RetrySelectionContext | null {
  if (!track) return null;
  const key = makeRetrySelectionKey(guildId, track);
  const context = retrySelections.get(key) ?? null;
  retrySelections.delete(key);
  return context;
}

export function clearRetrySelection(guildId: string, track: PendingTrack | null | undefined): void {
  if (!track) return;
  retrySelections.delete(makeRetrySelectionKey(guildId, track));
}
