// src/lavalink.ts
import { Client } from "discord.js";
import { LavalinkManager } from "lavalink-client";

// このプロジェクト用の Client 型
export type ShibakuClient = Client & { lavalink: LavalinkManager };

export function initLavalink(client: ShibakuClient) {
  // LavalinkManager を1回だけ作る
  client.lavalink = new LavalinkManager({
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
    sendToShard: (guildId, payload) =>
      client.guilds.cache.get(guildId)?.shard?.send(payload),
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
  });

  // Discord の raw イベントを Lavalink に渡す
  // 変更後
  client.on("raw", (data: any) => {
    client.lavalink.sendRawData(data);
  });
}
