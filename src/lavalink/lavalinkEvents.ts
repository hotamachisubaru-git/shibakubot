import { type Client } from "discord.js";
import { type LavalinkManager, type LavalinkNode, type ModifyRequest, type Player } from "lavalink-client";
import { getRuntimeConfig } from "../config/runtime";
import { LAVALINK_READY_CHECK_INTERVAL_MS, BOT_VOICE_STATE_RECENCY_MS } from "./lavalinkConfig";

type LavalinkRawData = Parameters<LavalinkManager<Player>["sendRawData"]>[0];
export type CachedVoiceServerUpdate = Readonly<{
  packet: LavalinkRawData;
  appliedSessionId: string | null;
}>;
export type LatestBotVoiceState = Readonly<{
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

function normalizeOptionalId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

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
        if (paramKey === "trace") continue;
        url.searchParams.append(paramKey, paramValue);
      }
    }
    const { path, extraQueryUrlParams, ...fetchOptions } = options;
    const response = await fetch(url.toString(), fetchOptions);
    patchedNode.calls += 1;
    return { response, options };
  };
}

function parseDiscordVoiceServerUpdate(data: LavalinkRawData): ParsedDiscordVoiceServerUpdate | null {
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

function parseDiscordVoiceStateUpdate(data: LavalinkRawData): ParsedDiscordVoiceStateUpdate | null {
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
  return { guildId, userId, sessionId, channelId };
}

export function setupLavalinkEventHandlers(
  client: Client,
  lavalink: LavalinkManager<Player>,
  pendingVoiceServerUpdates: Map<string, CachedVoiceServerUpdate>,
  latestBotVoiceStates: Map<string, LatestBotVoiceState>,
): void {
  const typedClient = client as Client & { lavalink: LavalinkManager<Player> };

  for (const node of typedClient.lavalink.nodeManager.nodes.values()) {
    patchNodeRawRequestToDisableTrace(node);
  }

  typedClient.lavalink.nodeManager.on("create", (node) => {
    patchNodeRawRequestToDisableTrace(node);
  });

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

  client.on("raw", (data: LavalinkRawData) => {
    void forwardLavalinkRawData(data);
  });
}
