import path from "node:path";
import {
  DEFAULT_FILE_HOST,
  DEFAULT_FILE_PORT,
  DEFAULT_FILE_DIR,
  DEFAULT_SBK_MAX_REASON_LENGTH,
  MAX_SBK_MAX_REASON_LENGTH,
} from "./constants";
import { parseBoolean, parseInteger, parseText } from "../utils/env";
import { buildUploadUrlConfig } from "./helpers";
import {
  buildLavalinkConfig,
  buildMusicConfig,
  buildSbkRange,
  buildYtdlpConfig,
} from "./builders";
import type { RuntimeConfig } from "./types";

function buildDiscordConfig(): RuntimeConfig["discord"] {
  return {
    token: parseText(process.env.TOKEN),
    clientId: parseText(process.env.CLIENT_ID),
    guildIds: parseText(process.env.GUILD_IDS)
      ? parseText(process.env.GUILD_IDS)!.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    ownerIds: new Set(parseText(process.env.OWNER_IDS)?.split(",").map((s) => s.trim()).filter(Boolean) || []),
    immuneIds: new Set(parseText(process.env.IMMUNE_IDS)?.split(",").map((s) => s.trim()).filter(Boolean) || []),
    logChannelId: parseText(process.env.LOG_CHANNEL_ID),
  };
}

function buildAppConfig(): RuntimeConfig["app"] {
  return {
    clearGlobalCommandsOnRegister: parseBoolean(process.env.CLEAR_GLOBAL, true),
    maxLogReasonLength: parseInteger(
      process.env.SBK_MAX_REASON_LENGTH,
      DEFAULT_SBK_MAX_REASON_LENGTH,
      { min: 50, max: MAX_SBK_MAX_REASON_LENGTH },
    ),
  };
}

let cachedRuntimeConfig: RuntimeConfig | null = null;

export function buildRuntimeConfig(): RuntimeConfig {
  const filePort = parseInteger(process.env.FILE_PORT, DEFAULT_FILE_PORT, { min: 1, max: 65_535 });
  const fileHost = parseText(process.env.FILE_HOST) || DEFAULT_FILE_HOST;
  const uploadDir = path.resolve(parseText(process.env.FILE_DIR) || DEFAULT_FILE_DIR);

  cachedRuntimeConfig = {
    discord: buildDiscordConfig(),
    sbk: buildSbkRange(),
    fileServer: {
      uploadDir,
      host: fileHost,
      port: filePort,
    },
    upload: buildUploadUrlConfig(fileHost, filePort),
    music: buildMusicConfig(),
    ytdlp: buildYtdlpConfig(),
    lavalink: buildLavalinkConfig(),
    app: buildAppConfig(),
  };
  return cachedRuntimeConfig;
}

export function getRuntimeConfig(): RuntimeConfig {
  if (cachedRuntimeConfig) return cachedRuntimeConfig;
  cachedRuntimeConfig = buildRuntimeConfig();
  return cachedRuntimeConfig;
}
