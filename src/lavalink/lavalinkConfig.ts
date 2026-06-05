import { type Client } from "discord.js";
import { type ManagerOptions, type Player } from "lavalink-client";
import { getRuntimeConfig } from "../config/runtime";

export type ShibakuClient = Client & { lavalink: import("lavalink-client").LavalinkManager<Player> };

const LAVALINK_READY_CHECK_INTERVAL_MS = 3_000;
const LAVALINK_READY_CHECK_TIMEOUT_MS = 2_000;
const BOT_VOICE_STATE_RECENCY_MS = 5_000;

export { LAVALINK_READY_CHECK_INTERVAL_MS, LAVALINK_READY_CHECK_TIMEOUT_MS, BOT_VOICE_STATE_RECENCY_MS };

export function createLavalinkOptions(client: Client): ManagerOptions<Player> {
  const runtimeConfig = getRuntimeConfig();

  return {
    nodes: [
      {
        id: runtimeConfig.lavalink.nodeId,
        host: runtimeConfig.lavalink.host,
        port: runtimeConfig.lavalink.port,
        authorization: runtimeConfig.lavalink.authorization,
        secure: runtimeConfig.lavalink.secure,
      },
    ],
    sendToShard: (guildId, payload) => {
      client.guilds.cache.get(guildId)?.shard?.send(payload);
    },
    client: {
      id: client.user?.id ?? "0",
      username: client.user?.username ?? runtimeConfig.lavalink.username,
    },
    autoSkip: true,
    playerOptions: {
      defaultSearchPlatform: runtimeConfig.lavalink.defaultSearchPlatform,
      volumeDecrementer: runtimeConfig.lavalink.volumeDecrementer,
      clientBasedPositionUpdateInterval: runtimeConfig.lavalink.clientPositionUpdateInterval,
      onDisconnect: {
        autoReconnect: true,
        destroyPlayer: false,
      },
      onEmptyQueue: {
        destroyAfterMs: runtimeConfig.lavalink.emptyQueueDestroyMs,
      },
    },
    queueOptions: {
      maxPreviousTracks: runtimeConfig.lavalink.maxPreviousTracks,
    },
  };
}
