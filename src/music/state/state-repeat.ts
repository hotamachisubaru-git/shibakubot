import { Player } from "lavalink-client";
import type { TrackEndEvent, TrackStuckEvent, TrackExceptionEvent } from "lavalink-client";
import { getMusicRepeat } from "../../data";
import { getTrackId, type PendingTrack } from "../misc/trackUtils";

const repeatTimers = new Map<string, NodeJS.Timeout>();
const REPEAT_REPLAY_DELAY_MS = 250;

export function clearRepeatTimer(guildId: string): void {
  const timer = repeatTimers.get(guildId);
  if (timer) {
    clearTimeout(timer);
    repeatTimers.delete(guildId);
  }
}

export function setRepeatTimer(guildId: string, timer: NodeJS.Timeout): void {
  clearRepeatTimer(guildId);
  repeatTimers.set(guildId, timer);
}

export async function applyMusicRepeatForPlayer(player: Player): Promise<void> {
  const repeatMode = getMusicRepeat(player.guildId) ? "track" : "off";
  if (player.repeatMode === repeatMode) {
    return;
  }
  await player.setRepeatMode(repeatMode);
}

function syncMusicRepeatForPlayer(player: Player): void {
  void applyMusicRepeatForPlayer(player).catch((error) => {
    console.warn("[music] repeat sync error", error);
  });
}

function isFinishedTrackEndPayload(payload: TrackEndEvent | TrackStuckEvent | TrackExceptionEvent): payload is TrackEndEvent {
  return payload.type === "TrackEndEvent" && payload.reason === "finished";
}

export function reapplyMusicRepeatOnQueueEnd(
  player: Player,
  track: PendingTrack | null,
  payload: TrackEndEvent | TrackStuckEvent | TrackExceptionEvent,
): void {
  syncMusicRepeatForPlayer(player);
  if (!track || !isFinishedTrackEndPayload(payload) || !getMusicRepeat(player.guildId)) {
    return;
  }

  const guildId = player.guildId;
  const timer = setTimeout(() => {
    void (async () => {
      if (!getMusicRepeat(guildId)) return;
      if (player.LavalinkManager.players.get(guildId) !== player) return;
      if (player.queue.current || player.queue.tracks.length > 0) return;

      await applyMusicRepeatForPlayer(player);
      await player.queue.add(track, 0);
      await player.play({ noReplace: false, paused: false });
    })().catch((error) => {
      console.warn("[music] repeat replay error", error);
    });
  }, REPEAT_REPLAY_DELAY_MS);

  setRepeatTimer(guildId, timer);
}
