// src/lavalink.ts
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "discord.js";
import { LavalinkManager, type ManagerOptions, type Player } from "lavalink-client";
import { getRuntimeConfig } from "./config/runtime";

// このプロジェクト用の Client 型
export type ShibakuClient = Client & { lavalink: LavalinkManager<Player> };

const LAVALINK_READY_CHECK_INTERVAL_MS = 3_000;
const LAVALINK_READY_CHECK_TIMEOUT_MS = 2_000;

class LavalinkNotReadyError extends Error {}

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

function getLavalinkHealthUrl(): string {
  const runtimeConfig = getRuntimeConfig();
  const protocol = runtimeConfig.lavalink.secure ? "https" : "http";
  return `${protocol}://${runtimeConfig.lavalink.host}:${runtimeConfig.lavalink.port}/version`;
}

function isRetryableLavalinkError(error: unknown): boolean {
  if (error instanceof LavalinkNotReadyError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const code =
    typeof (error as { cause?: { code?: unknown } }).cause?.code === "string"
      ? ((error as { cause?: { code?: string } }).cause?.code ?? "")
      : "";

  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "EHOSTUNREACH" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  );
}

async function probeLavalinkVersion(): Promise<string> {
  const runtimeConfig = getRuntimeConfig();
  const response = await fetch(getLavalinkHealthUrl(), {
    method: "GET",
    headers: {
      Authorization: runtimeConfig.lavalink.authorization,
    },
    signal: AbortSignal.timeout(LAVALINK_READY_CHECK_TIMEOUT_MS),
  }).catch((error: unknown) => {
    if (isRetryableLavalinkError(error)) {
      throw new LavalinkNotReadyError("Lavalink server is not reachable yet.");
    }
    throw error;
  });

  if (response.ok) {
    const version = (await response.text()).trim();
    return version || "unknown";
  }

  if ([502, 503, 504].includes(response.status)) {
    throw new LavalinkNotReadyError(
      `Lavalink health check returned ${response.status}.`,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Lavalink authorization failed with status ${response.status}.`,
    );
  }

  throw new Error(
    `Unexpected Lavalink health response: ${response.status} ${response.statusText}`,
  );
}

export async function waitForLavalinkReady(): Promise<void> {
  const healthUrl = getLavalinkHealthUrl();
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      const version = await probeLavalinkVersion();
      console.log(`[lavalink] server ready: ${healthUrl} (${version})`);
      return;
    } catch (error) {
      if (!isRetryableLavalinkError(error)) {
        throw error;
      }

      if (attempt === 1 || attempt % 5 === 0) {
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(
          `[lavalink] waiting for server: ${healthUrl} (attempt ${attempt}) ${detail}`,
        );
      }

      await delay(LAVALINK_READY_CHECK_INTERVAL_MS);
    }
  }
}
