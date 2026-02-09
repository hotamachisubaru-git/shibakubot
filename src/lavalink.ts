// src/lavalink.ts
import { Client } from "discord.js";
import { LavalinkManager, type ManagerOptions, type Player } from "lavalink-client";
import { getRuntimeConfig } from "./config/runtime";

// このプロジェクト用の Client 型
export type ShibakuClient = Client & { lavalink: LavalinkManager<Player> };

function createLavalinkOptions(client: Client): ManagerOptions<Player> {
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
    // Discord 側へボイス関連のパケットを送る
    sendToShard: (guildId, payload) => {
      client.guilds.cache.get(guildId)?.shard?.send(payload);
    },
    client: {
      // ready 前は undefined なので、とりあえずダミー
      id: client.user?.id ?? "0",
      username: client.user?.username ?? runtimeConfig.lavalink.username,
    },

    autoSkip: true,
    playerOptions: {
      defaultSearchPlatform: runtimeConfig.lavalink.defaultSearchPlatform,
      volumeDecrementer: runtimeConfig.lavalink.volumeDecrementer,
      clientBasedPositionUpdateInterval:
        runtimeConfig.lavalink.clientPositionUpdateInterval,
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

export function initLavalink(client: Client): ShibakuClient {
  const typedClient = client as ShibakuClient;

  typedClient.lavalink = new LavalinkManager<Player>(
    createLavalinkOptions(typedClient),
  );

  // Discord の raw イベントを Lavalink に渡す
  typedClient.on(
    "raw",
    (data: Parameters<LavalinkManager<Player>["sendRawData"]>[0]) => {
      void typedClient.lavalink.sendRawData(data);
    },
  );

  return typedClient;
}
