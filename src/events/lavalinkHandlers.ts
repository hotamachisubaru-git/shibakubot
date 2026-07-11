import type { ShibakuClient } from "../lavalink/lavalinkConfig";
import type { Player, TrackExceptionEvent, TrackStuckEvent } from "lavalink-client";
import { nodeStatsLogCounters } from "../index";
import { isNodeStatsPayload, getBotVoiceDebugState, promptRetrySelection, logImmediateNodeStats } from "./helpers";
import { clearRetrySelection } from "../music/state";
import { recoverPlaybackWithYtDlp } from "../music/playbackRecovery";
import { updateLavalinkNodeConnection } from "../lavalink/lavalink";

function logLavalinkEventError(
  eventName: string,
  guildId: string,
  error: unknown,
): void {
  console.error(
    `[lavalink] handler failed event=${eventName} guild=${guildId}`,
    error,
  );
}

function recoverTrackPlayback(
  eventName: "trackError" | "trackStuck",
  client: ShibakuClient,
  player: Player,
  track: import("../music/trackUtils").PendingTrack | null,
  payload: TrackExceptionEvent | TrackStuckEvent,
): void {
  void (async () => {
    const recoveryResult = await recoverPlaybackWithYtDlp(
      client,
      player,
      track,
      payload,
    );
    if (recoveryResult !== "recovered") {
      await promptRetrySelection(client, player, track);
    }
  })().catch((error: unknown) => {
    logLavalinkEventError(eventName, player.guildId, error);
  });
}

export function setupLavalinkEventHandlers(client: ShibakuClient): void {
  client.lavalink.nodeManager.on("connect", (node) => {
    updateLavalinkNodeConnection(node.id, true);
    console.log(`[lavalink] node connected: ${node.id}`);
  });

  client.lavalink.nodeManager.on("disconnect", (node, reason) => {
    updateLavalinkNodeConnection(node.id, false);
    nodeStatsLogCounters.delete(node.id);
    console.warn(`[lavalink] node disconnected: ${node.id}`, reason);
  });

  client.lavalink.nodeManager.on("error", (node, error, payload) => {
    console.error(`[lavalink] node error: ${node.id}`, error, payload);
  });

  client.lavalink.nodeManager.on("raw", (node, payload) => {
    if (!isNodeStatsPayload(payload)) return;
    if (!payload.playingPlayers || payload.playingPlayers <= 0) {
      nodeStatsLogCounters.delete(node.id);
      return;
    }

    const nextCount = (nodeStatsLogCounters.get(node.id) ?? 0) + 1;
    nodeStatsLogCounters.set(node.id, nextCount);
    if (nextCount % 5 !== 0) return;

    console.log(`[lavalink] node stats: ${node.id}`, {
      players: payload.players ?? null,
      playingPlayers: payload.playingPlayers ?? null,
      frameStats: payload.frameStats ?? null,
      systemLoad: payload.cpu?.systemLoad ?? null,
      lavalinkLoad: payload.cpu?.lavalinkLoad ?? null,
    });
  });

  client.lavalink.on("trackError", (player, track, payload) => {
    console.error(
      `[music] track error guild=${player.guildId} title=${track?.info?.title ?? "unknown"} source=${track?.info?.sourceName ?? "unknown"} identifier=${track?.info?.identifier ?? "unknown"} uri=${track?.info?.uri ?? "unknown"}`,
      {
        message: payload?.exception?.message ?? "unknown",
        severity: payload?.exception?.severity ?? "unknown",
        cause: payload?.exception?.cause ?? "unknown",
        connected: player.connected,
        playing: player.playing,
        paused: player.paused,
        queueSize: player.queue.tracks.length,
        position: player.position,
        currentTitle: player.queue.current?.info?.title ?? null,
        botVoiceState: getBotVoiceDebugState(client, player.guildId),
      },
    );
    recoverTrackPlayback("trackError", client, player, track, payload);
  });

  client.lavalink.on("trackStart", (player, track) => {
    const voiceState = player.voice as { endpoint?: string; ping?: number; connected?: boolean };
    console.log(
      `[music] track start guild=${player.guildId} title=${track?.info?.title ?? "unknown"} source=${track?.info?.sourceName ?? "unknown"} identifier=${track?.info?.identifier ?? "unknown"} uri=${track?.info?.uri ?? "unknown"}`,
      {
        connected: player.connected,
        playing: player.playing,
        paused: player.paused,
        queueSize: player.queue.tracks.length,
        position: player.position,
        volume: player.volume,
        lavalinkVolume: player.lavalinkVolume,
        voiceConnected: voiceState.connected ?? null,
        voicePing: voiceState.ping ?? null,
        voiceEndpoint: voiceState.endpoint ?? null,
        botVoiceState: getBotVoiceDebugState(client, player.guildId),
      },
    );
    clearRetrySelection(player.guildId, track);
    void logImmediateNodeStats(player);
  });

  client.lavalink.on("trackEnd", (player, track, payload) => {
    console.log(
      `[music] track end guild=${player.guildId} title=${track?.info?.title ?? "unknown"} source=${track?.info?.sourceName ?? "unknown"} identifier=${track?.info?.identifier ?? "unknown"} uri=${track?.info?.uri ?? "unknown"}`,
      {
        reason: payload?.reason ?? "unknown",
        connected: player.connected,
        playing: player.playing,
        paused: player.paused,
        queueSize: player.queue.tracks.length,
        position: player.position,
        botVoiceState: getBotVoiceDebugState(client, player.guildId),
      },
    );
  });

  client.lavalink.on("trackStuck", (player, track, payload) => {
    console.error(
      `[music] track stuck guild=${player.guildId} title=${track?.info?.title ?? "unknown"} source=${track?.info?.sourceName ?? "unknown"} identifier=${track?.info?.identifier ?? "unknown"} uri=${track?.info?.uri ?? "unknown"}`,
      {
        payload,
        connected: player.connected,
        playing: player.playing,
        paused: player.paused,
        queueSize: player.queue.tracks.length,
        position: player.position,
        currentTitle: player.queue.current?.info?.title ?? null,
        botVoiceState: getBotVoiceDebugState(client, player.guildId),
      },
    );
    recoverTrackPlayback("trackStuck", client, player, track, payload);
  });
}
