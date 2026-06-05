import { setTimeout as delay } from "node:timers/promises";
import { Client } from "discord.js";
import { LavalinkManager, type Player } from "lavalink-client";
import { getRuntimeConfig } from "../config/runtime";
import { ShibakuClient, createLavalinkOptions } from "./lavalinkConfig";
import { setupLavalinkEventHandlers } from "./lavalinkEvents";
import { LavalinkNotReadyError, probeLavalinkVersion } from "./lavalinkHealth";

const LAVALINK_READY_CHECK_INTERVAL_MS = 3_000;

export function initLavalink(client: Client): ShibakuClient {
  const typedClient = client as ShibakuClient;
  const pendingVoiceServerUpdates = new Map<string, import("./lavalinkEvents").CachedVoiceServerUpdate>();
  const latestBotVoiceStates = new Map<string, import("./lavalinkEvents").LatestBotVoiceState>();

  typedClient.lavalink = new LavalinkManager<Player>(
    createLavalinkOptions(typedClient),
  );

  setupLavalinkEventHandlers(
    typedClient,
    typedClient.lavalink,
    pendingVoiceServerUpdates,
    latestBotVoiceStates,
  );

  return typedClient;
}

export async function waitForLavalinkReady(): Promise<void> {
  const healthUrl = getHealthUrl();
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

function getHealthUrl(): string {
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
