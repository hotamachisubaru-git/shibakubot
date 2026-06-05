import { Client } from "discord.js";
import { setTimeout as delay } from "node:timers/promises";
import { getTrackDurationMs, getTrackTitle, formatTrackDuration } from "../music/trackUtils";
import { PREFIX } from "../music/constants";
import { MUSIC_TEXT_COMMAND } from "../constants/commands";
import { consumeRetrySelection, setPendingSearchForUser } from "../music/state";

export function getBotVoiceDebugState(
  client: Client,
  guildId: string,
): Record<string, unknown> | null {
  const guild = client.guilds.cache.get(guildId);
  const me = guild?.members.me;
  const voice = me?.voice;
  if (!voice) return null;

  return {
    channelId: voice.channelId ?? null,
    channelName: voice.channel?.name ?? null,
    selfMute: voice.selfMute,
    selfDeaf: voice.selfDeaf,
    serverMute: voice.serverMute,
    serverDeaf: voice.serverDeaf,
    suppress: voice.suppress,
    streaming: voice.streaming,
    requestToSpeakTimestamp: voice.requestToSpeakTimestamp,
  };
}

export async function promptRetrySelection(
  client: Client,
  player: import("lavalink-client").Player,
  track: import("../music/trackUtils").PendingTrack | null,
): Promise<void> {
  const guildId = player.guildId;
  if (!track) return;

  const retry = consumeRetrySelection(guildId, track);
  if (!retry || !retry.remainingTracks.length) return;

  setPendingSearchForUser(
    guildId,
    retry.requesterId,
    retry.remainingTracks,
    retry.query,
  );

  const channel =
    client.channels.cache.get(retry.channelId) ??
    (await client.channels.fetch(retry.channelId).catch(() => null));
  if (!channel || !("send" in channel)) return;

  const lines = retry.remainingTracks.map((candidate, index) => {
    const title = getTrackTitle(candidate);
    const author = candidate.info.author ? ` - ${candidate.info.author}` : "";
    const duration = formatTrackDuration(getTrackDurationMs(candidate));
    const durationText = duration ? ` (${duration})` : "";
    return `${index + 1}. ${title}${author}${durationText}`;
  });

  const prefixCmd = `${PREFIX}${MUSIC_TEXT_COMMAND.play}`;
  await channel.send({
    content:
      `<@${retry.requesterId}> 選んだ候補の再生に失敗しました。別候補を選び直せます。\n` +
      `${lines.join("\n")}\n\n` +
      `\`${prefixCmd} 1\`〜\`${prefixCmd} ${lines.length}\``,
    allowedMentions: { users: [retry.requesterId] },
  });
}

export async function logImmediateNodeStats(player: {
  guildId: string;
  volume: number;
  lavalinkVolume: number;
  voice?: {
    endpoint?: string;
    sessionId?: string;
    ping?: number;
    connected?: boolean;
  };
  node: {
    id: string;
    fetchStats(): Promise<{
      players: number;
      playingPlayers: number;
      frameStats?: { sent?: number; nulled?: number; deficit?: number } | null;
      cpu: { systemLoad: number; lavalinkLoad: number };
    }>;
  };
}): Promise<void> {
  const snapshots = [
    { label: "instant", waitMs: 0 },
    { label: "after-3s", waitMs: 3_000 },
  ] as const;

  for (const snapshot of snapshots) {
    if (snapshot.waitMs > 0) await delay(snapshot.waitMs);

    try {
      const voiceState = player.voice as {
        endpoint?: string;
        sessionId?: string;
        ping?: number;
        connected?: boolean;
      };
      const stats = await player.node.fetchStats();
      console.log(`[lavalink] node stats immediate: ${player.node.id}`, {
        snapshot: snapshot.label,
        guildId: player.guildId,
        playerVolume: player.volume,
        lavalinkVolume: player.lavalinkVolume,
        voiceConnected: voiceState.connected ?? null,
        voicePing: voiceState.ping ?? null,
        voiceEndpoint: voiceState.endpoint ?? null,
        voiceSessionIdPresent: Boolean(voiceState.sessionId),
        players: stats.players,
        playingPlayers: stats.playingPlayers,
        frameStats: stats.frameStats ?? null,
        systemLoad: stats.cpu.systemLoad,
        lavalinkLoad: stats.cpu.lavalinkLoad,
      });
    } catch (error) {
      console.warn(`[lavalink] node stats immediate failed: ${player.node.id}`, {
        snapshot: snapshot.label,
        guildId: player.guildId,
      }, error);
    }
  }
}

export function isNodeStatsPayload(
  payload: unknown,
): payload is {
  op: "stats";
  players?: number;
  playingPlayers?: number;
  frameStats?: { sent?: number; nulled?: number; deficit?: number } | null;
  cpu?: { systemLoad?: number; lavalinkLoad?: number };
} {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "op" in payload &&
    (payload as { op?: unknown }).op === "stats"
  );
}
