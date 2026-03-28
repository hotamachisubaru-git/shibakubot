// src/lavalink.ts
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "discord.js";
import {
  LavalinkManager,
  type LavalinkNode,
  type ManagerOptions,
  type ModifyRequest,
  type Player,
} from "lavalink-client";
import { getRuntimeConfig } from "./config/runtime";

// このプロジェクト用の Client 型
export type ShibakuClient = Client & { lavalink: LavalinkManager<Player> };
type LavalinkRawData = Parameters<LavalinkManager<Player>["sendRawData"]>[0];
type CachedVoiceServerUpdate = Readonly<{
  packet: LavalinkRawData;
  appliedSessionId: string | null;
}>;
type LatestBotVoiceState = Readonly<{
  sessionId: string | null;
  channelId: string | null;
  seenAt: number;
}>;
type ParsedDiscordVoiceServerUpdate = Readonly<{
  guildId: string;
}>;
type ParsedDiscordVoiceStateUpdate = Readonly<{
  guildId: string;
  userId: string;
  sessionId: string | null;
  channelId: string | null;
}>;

const LAVALINK_READY_CHECK_INTERVAL_MS = 3_000;
const LAVALINK_READY_CHECK_TIMEOUT_MS = 2_000;
const BOT_VOICE_STATE_RECENCY_MS = 5_000;

class LavalinkNotReadyError extends Error {}

type RawRequestOptions = RequestInit & {
  path: string;
  extraQueryUrlParams?: URLSearchParams;
};

type TraceToggleCapableNode = {
  __shibakuTraceDisabled?: boolean;
  restAddress: string;
  version: string;
  calls: number;
  options: {
    authorization: string;
    requestSignalTimeoutMS?: number;
  };
  rawRequest(
    endpoint: string,
    modify?: ModifyRequest,
  ): Promise<{
    response: globalThis.Response;
    options: RawRequestOptions;
  }>;
};

function patchNodeRawRequestToDisableTrace(node: LavalinkNode): void {
  if (getRuntimeConfig().lavalink.traceEnabled) {
    return;
  }

  const patchedNode = node as unknown as TraceToggleCapableNode;
  if (patchedNode.__shibakuTraceDisabled) {
    return;
  }

  patchedNode.__shibakuTraceDisabled = true;
  patchedNode.rawRequest = async (
    endpoint: string,
    modify?: ModifyRequest,
  ): Promise<{
    response: globalThis.Response;
    options: RawRequestOptions;
  }> => {
    const options: RawRequestOptions = {
      path: `/${patchedNode.version}/${endpoint.startsWith("/") ? endpoint.slice(1) : endpoint}`,
      method: "GET",
      headers: {
        Authorization: patchedNode.options.authorization,
      },
      signal:
        patchedNode.options.requestSignalTimeoutMS &&
        patchedNode.options.requestSignalTimeoutMS > 0
          ? AbortSignal.timeout(patchedNode.options.requestSignalTimeoutMS)
          : undefined,
    };

    modify?.(options);
    options.extraQueryUrlParams?.delete("trace");

    const url = new URL(`${patchedNode.restAddress}${options.path}`);
    if (options.extraQueryUrlParams && options.extraQueryUrlParams.size > 0) {
      for (const [paramKey, paramValue] of options.extraQueryUrlParams.entries()) {
        if (paramKey === "trace") {
          continue;
        }
        url.searchParams.append(paramKey, paramValue);
      }
    }

    const { path, extraQueryUrlParams, ...fetchOptions } = options;
    const response = await fetch(url.toString(), fetchOptions);
    patchedNode.calls += 1;
    return { response, options };
  };
}

function parseDiscordVoiceServerUpdate(
  data: LavalinkRawData,
): ParsedDiscordVoiceServerUpdate | null {
  if (
    typeof data !== "object" ||
    data === null ||
    !("t" in data) ||
    data.t !== "VOICE_SERVER_UPDATE" ||
    !("d" in data) ||
    typeof data.d !== "object" ||
    data.d === null
  ) {
    return null;
  }

  const guildId =
    "guild_id" in data.d && typeof data.d.guild_id === "string"
      ? data.d.guild_id
      : null;
  const token =
    "token" in data.d && typeof data.d.token === "string"
      ? data.d.token
      : null;

  if (!guildId || !token) {
    return null;
  }

  return { guildId };
}

function parseDiscordVoiceStateUpdate(
  data: LavalinkRawData,
): ParsedDiscordVoiceStateUpdate | null {
  if (
    typeof data !== "object" ||
    data === null ||
    !("t" in data) ||
    data.t !== "VOICE_STATE_UPDATE" ||
    !("d" in data) ||
    typeof data.d !== "object" ||
    data.d === null
  ) {
    return null;
  }

  const guildId =
    "guild_id" in data.d && typeof data.d.guild_id === "string"
      ? data.d.guild_id
      : null;
  const userId =
    "user_id" in data.d && typeof data.d.user_id === "string"
      ? data.d.user_id
      : null;
  const sessionId =
    "session_id" in data.d ? normalizeOptionalId(data.d.session_id) : null;
  const channelId =
    "channel_id" in data.d
      ? normalizeOptionalId(
          typeof data.d.channel_id === "string" || data.d.channel_id === null
            ? data.d.channel_id
            : undefined,
        )
      : null;

  if (!guildId || !userId) {
    return null;
  }

  return {
    guildId,
    userId,
    sessionId,
    channelId,
  };
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

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
  const pendingVoiceServerUpdates = new Map<string, CachedVoiceServerUpdate>();
  const latestBotVoiceStates = new Map<string, LatestBotVoiceState>();

  typedClient.lavalink = new LavalinkManager<Player>(
    createLavalinkOptions(typedClient),
  );
  typedClient.lavalink.nodeManager.on("create", (node) => {
    patchNodeRawRequestToDisableTrace(node);
  });
  for (const node of typedClient.lavalink.nodeManager.nodes.values()) {
    patchNodeRawRequestToDisableTrace(node);
  }

  async function forwardLavalinkRawData(data: LavalinkRawData): Promise<void> {
    const voiceStateUpdate = parseDiscordVoiceStateUpdate(data);
    if (voiceStateUpdate && voiceStateUpdate.userId === typedClient.user?.id) {
      const { guildId, sessionId, channelId } = voiceStateUpdate;

      latestBotVoiceStates.set(guildId, {
        sessionId,
        channelId,
        seenAt: Date.now(),
      });

      await typedClient.lavalink.sendRawData(data);

      if (!channelId) {
        pendingVoiceServerUpdates.delete(guildId);
        latestBotVoiceStates.delete(guildId);
        return;
      }

      const pending = pendingVoiceServerUpdates.get(guildId);
      if (pending && sessionId && pending.appliedSessionId !== sessionId) {
        console.warn(
          `[lavalink] replaying VOICE_SERVER_UPDATE after bot session refresh: guild=${guildId}`,
        );
        await typedClient.lavalink.sendRawData(pending.packet);
        pendingVoiceServerUpdates.set(guildId, {
          packet: pending.packet,
          appliedSessionId: sessionId,
        });
      }
      return;
    }

    const voiceServerUpdate = parseDiscordVoiceServerUpdate(data);
    if (voiceServerUpdate) {
      const { guildId } = voiceServerUpdate;
      const latestState = latestBotVoiceStates.get(guildId);
      const appliedSessionId =
        latestState &&
        latestState.sessionId &&
        Date.now() - latestState.seenAt <= BOT_VOICE_STATE_RECENCY_MS
          ? latestState.sessionId
          : null;

      pendingVoiceServerUpdates.set(guildId, {
        packet: data,
        appliedSessionId,
      });
    }

    await typedClient.lavalink.sendRawData(data);
  }

  // Discord の raw イベントを Lavalink に渡す
  typedClient.on(
    "raw",
    (data: LavalinkRawData) => {
      void forwardLavalinkRawData(data);
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
