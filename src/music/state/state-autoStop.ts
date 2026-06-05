import { Player } from "lavalink-client";
import { getMusicRepeat } from "../../data";
import { getGuildMusicPlaybackLimit } from "../misc/limits";
import { getTrackDurationMs, getTrackId, type PendingTrack } from "../misc/trackUtils";
import { hookManagerAutoStopOnce } from "./state-hook";

const autoStopTimers = new Map<string, NodeJS.Timeout>();
const MAX_TIMEOUT_MS = 2_147_483_647;

type LegacyStoppablePlayer = Player & {
  stop?: () => Promise<unknown> | unknown;
};

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

function armAutoStop(guildId: string, player: Player, ms: number, trackId?: string): void {
  clearAutoStop(guildId);
  const timeoutMs = Math.min(Math.max(1, Math.ceil(ms)), MAX_TIMEOUT_MS);
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
  }, timeoutMs);
  autoStopTimers.set(guildId, timeout);
}

function getAutoStopDelayMs(player: Player, track: PendingTrack): number {
  const limit = getGuildMusicPlaybackLimit(player.guildId);
  const lengthMs = getTrackDurationMs(track);
  const hasDuration = Number.isFinite(lengthMs) && lengthMs > 0;
  const stopAtMs = hasDuration
    ? Math.min(lengthMs, limit.maxTrackMs)
    : limit.maxTrackMs;
  const positionMs = Math.max(0, player.position ?? 0);
  return stopAtMs - positionMs;
}

function armAutoStopForTrack(player: Player, track: PendingTrack): void {
  const delayMs = getAutoStopDelayMs(player, track);
  const trackId = getTrackId(track);
  if (delayMs <= 0) {
    clearAutoStop(player.guildId);
    if (player.playing) {
      stopPlayerNow(player);
    }
    return;
  }
  armAutoStop(player.guildId, player, delayMs, trackId);
}

export function refreshAutoStopForPlayer(player: Player): void {
  const current = player.queue.current;
  if (!current) {
    clearAutoStop(player.guildId);
    return;
  }
  armAutoStopForTrack(player, current);
}

export { hookManagerAutoStopOnce };
