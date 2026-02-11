import { Message } from "discord.js";
import { LavalinkManager, Player } from "lavalink-client";
import { MAX_TRACK_MS, PENDING_SEARCH_TTL_MS } from "./constants";
import {
  getTrackDurationMs,
  getTrackId,
  type PendingTrack,
} from "./trackUtils";

type LegacyStoppablePlayer = Player & {
  stop?: () => Promise<unknown> | unknown;
};

export type PendingSearch = {
  tracks: PendingTrack[];
  query: string;
  expiresAt: number;
};

const autoStopTimers = new Map<string, NodeJS.Timeout>();
const hookedManagers = new WeakSet<LavalinkManager<Player>>();
const pendingSearches = new Map<string, PendingSearch>();

export function clearAutoStop(guildId: string): void {
  const timer = autoStopTimers.get(guildId);
  if (timer) clearTimeout(timer);
  autoStopTimers.delete(guildId);
}

function stopPlayerNow(player: Player): void {
  const legacyPlayer = player as LegacyStoppablePlayer;
  if (typeof legacyPlayer.stop === "function") {
    void Promise.resolve(legacyPlayer.stop()).catch(() => undefined);
    return;
  }
  void player.stopPlaying(true, false).catch(() => undefined);
}

function armAutoStop(
  guildId: string,
  player: Player,
  ms: number,
  trackId?: string,
): void {
  clearAutoStop(guildId);
  const timeout = setTimeout(() => {
    try {
      const currentTrackId = getTrackId(player.queue.current);
      if (!trackId || currentTrackId === trackId) {
        if (player.playing) {
          stopPlayerNow(player);
        }
      }
    } catch {
      // noop
    }
  }, ms);
  autoStopTimers.set(guildId, timeout);
}

export function hookManagerAutoStopOnce(lavalink: LavalinkManager<Player>): void {
  if (hookedManagers.has(lavalink)) return;
  hookedManagers.add(lavalink);

  lavalink.on("trackStart", (player, track) => {
    if (!track) {
      clearAutoStop(player.guildId);
      return;
    }

    const lengthMs = getTrackDurationMs(track);
    const hasDuration = Number.isFinite(lengthMs) && lengthMs > 0;
    const trackId = getTrackId(track);

    if (!hasDuration) {
      armAutoStop(player.guildId, player, MAX_TRACK_MS, trackId);
      return;
    }
    armAutoStop(player.guildId, player, Math.min(lengthMs, MAX_TRACK_MS), trackId);
  });

  lavalink.on("queueEnd", (player) => clearAutoStop(player.guildId));
  lavalink.on("playerDestroy", (player) => clearAutoStop(player.guildId));
  lavalink.on("trackEnd", (player) => clearAutoStop(player.guildId));
}

function makePendingKey(message: Message): string {
  return `${message.guildId}:${message.author.id}`;
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

export function setPendingSearch(
  message: Message,
  tracks: PendingTrack[],
  query: string,
): void {
  const key = makePendingKey(message);
  pendingSearches.set(key, {
    tracks,
    query,
    expiresAt: Date.now() + PENDING_SEARCH_TTL_MS,
  });
}

export function clearPendingSearch(message: Message): void {
  pendingSearches.delete(makePendingKey(message));
}
