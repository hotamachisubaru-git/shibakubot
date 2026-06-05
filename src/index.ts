import "dotenv/config";
import { setTimeout as delay } from "node:timers/promises";
import {
  Client,
  Events,
  GatewayIntentBits,
  Message,
  VoiceState,
} from "discord.js";
import {
  notifyGuildMessage,
  refreshGuildMemoriesOnStartup,
} from "./ai/guild-memory";
import { getRuntimeConfig } from "./config/runtime";
import {
  handleAutocompleteInteraction,
  handleChatInputInteraction,
} from "./discord/interactionRouter";
import { getMaintenanceEnabled, isIgnoredUser } from "./data";
import { registerConsoleCommands } from "./consoleCommands";
import { startFileServer } from "./fileserver/fileServer";
import { initLavalink, waitForLavalinkReady } from "./lavalink";
import { handleMusicMessage } from "./music";
import { recoverPlaybackWithYtDlp } from "./music/playbackRecovery";
import {
  clearRetrySelection,
  consumeRetrySelection,
  setPendingSearchForUser,
} from "./music/state";
import {
  formatTrackDuration,
  getTrackDurationMs,
  getTrackTitle,
} from "./music/trackUtils";
import { PREFIX } from "./music/constants";
import { MUSIC_TEXT_COMMAND } from "./constants/commands";
import { ensureSingleInstance } from "./utils/singleInstance";

const runtimeConfig = getRuntimeConfig();
const TOKEN = runtimeConfig.discord.token;
const nodeStatsLogCounters = new Map<string, number>();

if (!TOKEN) {
  throw new Error("Missing required environment variable: TOKEN");
}

ensureSingleInstance();

startFileServer();

function getBotVoiceDebugState(
  client: Client,
  guildId: string,
): Record<string, unknown> | null {
  const guild = client.guilds.cache.get(guildId);
  const me = guild?.members.me;
  const voice = me?.voice;
  if (!voice) {
    return null;
  }

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

async function promptRetrySelection(
  client: Client,
  player: import("lavalink-client").Player,
  track: import("./music/trackUtils").PendingTrack | null,
): Promise<void> {
  const guildId = player.guildId;
  if (!track) return;

  const retry = consumeRetrySelection(guildId, track);
  if (!retry || !retry.remainingTracks.length) {
    return;
  }

  setPendingSearchForUser(
    guildId,
    retry.requesterId,
    retry.remainingTracks,
    retry.query,
  );

  const channel =
    client.channels.cache.get(retry.channelId) ??
    (await client.channels.fetch(retry.channelId).catch(() => null));
  if (!channel || !("send" in channel)) {
    return;
  }

  const lines = retry.remainingTracks.map((candidate, index) => {
    const title = getTrackTitle(candidate);
    const author = candidate.info.author ? ` - ${candidate.info.author}` : "";
    const duration = formatTrackDuration(getTrackDurationMs(candidate));
    const durationText = duration ? ` (${duration})` : "";
    return `${index + 1}. ${title}${author}${durationText}`;
  });

  await channel.send({
    content:
      `<@${retry.requesterId}> 選んだ候補の再生に失敗しました。別候補を選び直せます。\n` +
      `${lines.join("\n")}\n\n` +
      `\`${PREFIX}${MUSIC_TEXT_COMMAND.play} 1\`〜\`${PREFIX}${MUSIC_TEXT_COMMAND.play} ${lines.length}\``,
    allowedMentions: { users: [retry.requesterId] },
  });
}

function isNodeStatsPayload(
  payload: unknown,
): payload is {
  op: "stats";
  players?: number;
  playingPlayers?: number;
  frameStats?: {
    sent?: number;
    nulled?: number;
    deficit?: number;
  } | null;
  cpu?: {
    systemLoad?: number;
    lavalinkLoad?: number;
  };
} {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "op" in payload &&
    (payload as { op?: unknown }).op === "stats"
  );
}

async function logImmediateNodeStats(player: {
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
      frameStats?: {
        sent?: number;
        nulled?: number;
        deficit?: number;
      } | null;
      cpu: {
        systemLoad: number;
        lavalinkLoad: number;
      };
    }>;
  };
}): Promise<void> {
  const snapshots = [
    { label: "instant", waitMs: 0 },
    { label: "after-3s", waitMs: 3_000 },
  ] as const;

  for (const snapshot of snapshots) {
    if (snapshot.waitMs > 0) {
      await delay(snapshot.waitMs);
    }

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

const client = initLavalink(
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
  }),
);
registerConsoleCommands(client);

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ ログイン完了: ${readyClient.user.tag}`);

  client.lavalink.nodeManager.on("connect", (node) => {
    console.log(`[lavalink] node connected: ${node.id}`);
  });
  client.lavalink.nodeManager.on("disconnect", (node, reason) => {
    console.warn(`[lavalink] node disconnected: ${node.id}`, reason);
  });
  client.lavalink.nodeManager.on("error", (node, error, payload) => {
    console.error(`[lavalink] node error: ${node.id}`, error, payload);
  });
  client.lavalink.nodeManager.on("raw", (node, payload) => {
    if (!isNodeStatsPayload(payload)) {
      return;
    }

    if (!payload.playingPlayers || payload.playingPlayers <= 0) {
      nodeStatsLogCounters.delete(node.id);
      return;
    }

    const nextCount = (nodeStatsLogCounters.get(node.id) ?? 0) + 1;
    nodeStatsLogCounters.set(node.id, nextCount);
    if (nextCount % 5 !== 0) {
      return;
    }

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
    })();
  });
  client.lavalink.on("trackStart", (player, track) => {
    const voiceState = player.voice as {
      endpoint?: string;
      ping?: number;
      connected?: boolean;
    };
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
    })();
  });

  await waitForLavalinkReady();

  await client.lavalink.init({
    id: readyClient.user.id,
    username: runtimeConfig.lavalink.username,
  });

  void refreshGuildMemoriesOnStartup(client.guilds.cache.values());
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    await handleAutocompleteInteraction(interaction);
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  await handleChatInputInteraction(interaction);
});

void client.login(TOKEN);

client.on("messageCreate", async (message: Message) => {
  if (message.guildId && getMaintenanceEnabled(message.guildId)) return;
  if (message.guildId && isIgnoredUser(message.guildId, message.author.id)) return;
  notifyGuildMessage(message);
  await handleMusicMessage(message);
});

client.on(Events.VoiceStateUpdate, (oldState: VoiceState, newState: VoiceState) => {
  if (newState.id !== client.user?.id && oldState.id !== client.user?.id) {
    return;
  }

  const state = newState.id === client.user?.id ? newState : oldState;
  console.log(
    `[voice] bot state guild=${state.guild.id}`,
    {
      oldChannelId: oldState.channelId ?? null,
      newChannelId: newState.channelId ?? null,
      selfMute: newState.selfMute,
      selfDeaf: newState.selfDeaf,
      serverMute: newState.serverMute,
      serverDeaf: newState.serverDeaf,
      suppress: newState.suppress,
      streaming: newState.streaming,
      requestToSpeakTimestamp: newState.requestToSpeakTimestamp,
    },
  );
});
