// src/lavalink.ts
import { Client } from "discord.js";
import { LavalinkManager, type ManagerOptions, type Player } from "lavalink-client";

// このプロジェクト用の Client 型
export type ShibakuClient = Client & { lavalink: LavalinkManager<Player> };

function createLavalinkOptions(client: Client): ManagerOptions<Player> {
  return {
    nodes: [
      {
        id: "local",
        host: "0.0.0.0",
        port: 2333,
        authorization: "youshallnotpass", // application.yml と合わせる
        secure: false,
      },
    ],
    // Discord 側へボイス関連のパケットを送る
    sendToShard: (guildId, payload) => {
      client.guilds.cache.get(guildId)?.shard?.send(payload);
    },
    client: {
      // ready 前は undefined なので、とりあえずダミー
      id: client.user?.id ?? "0",
      username: client.user?.username ?? "shibakubot",
    },
    // 以下はお好みで
    autoSkip: true,
    playerOptions: {
      defaultSearchPlatform: "ytmsearch",
      volumeDecrementer: 0.75,
    },
    queueOptions: {
      maxPreviousTracks: 25,
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
