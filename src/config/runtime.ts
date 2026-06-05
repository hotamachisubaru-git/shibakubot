import path from "node:path";
import type { SearchPlatform } from "lavalink-client";
import {
  DEFAULT_SBK_MAX,
  DEFAULT_SBK_MIN,
  DISCORD_SELECT_OPTION_LIMIT,
  DEFAULT_FILE_HOST,
  DEFAULT_FILE_DIR,
  DEFAULT_MUSIC_PREFIX,
  DEFAULT_MUSIC_FIXED_VOLUME,
  DEFAULT_MUSIC_MAX_TRACK_MINUTES,
  MAX_MUSIC_MAX_TRACK_MINUTES,
  DEFAULT_PENDING_SEARCH_TTL_MS,
  DEFAULT_MAX_SELECTION_RESULTS,
  DEFAULT_YT_DLP_ENABLED,
  DEFAULT_YT_DLP_AUTO_DOWNLOAD,
  DEFAULT_YT_DLP_TIMEOUT_MS,
  DEFAULT_YT_DLP_CACHE_DIR,
  DEFAULT_LAVALINK_NODE_ID,
  DEFAULT_LAVALINK_HOST,
  DEFAULT_LAVALINK_PORT,
  DEFAULT_LAVALINK_PASSWORD,
  DEFAULT_LAVALINK_USERNAME,
  DEFAULT_LAVALINK_SECURE,
  DEFAULT_LAVALINK_TRACE_ENABLED,
  DEFAULT_LAVALINK_MAX_PREVIOUS_TRACKS,
  DEFAULT_LAVALINK_EMPTY_QUEUE_DESTROY_MS,
  DEFAULT_LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL,
  DEFAULT_LAVALINK_VOLUME_DECREMENTER,
  ALLOWED_EXTENSIONS,
  CONTENT_TYPE_TO_EXTENSION,
} from "./constants";
import { parseBoolean, parseInteger, parseText } from "../utils/env";
import { buildUploadUrlConfig, resolveGuildValue } from "./helpers";
import { buildAiConfig, buildSbkRange } from "./builders";
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

function buildMusicConfig(): RuntimeConfig["music"] {
  const musicMaxTrackMinutes = parseInteger(
    process.env.MUSIC_MAX_MINUTES,
    DEFAULT_MUSIC_MAX_TRACK_MINUTES,
    { min: 1, max: MAX_MUSIC_MAX_TRACK_MINUTES },
  );
  return {
    prefix: parseText(process.env.MUSIC_PREFIX) || DEFAULT_MUSIC_PREFIX,
    spotifyDebugEnabled: parseBoolean(process.env.SPOTIFY_DEBUG_ENABLED, false),
    fixedVolume: DEFAULT_MUSIC_FIXED_VOLUME,
    maxTrackMinutes: musicMaxTrackMinutes,
    maxTrackMs: musicMaxTrackMinutes * 60 * 1000,
    pendingSearchTtlMs: parseInteger(
      process.env.MUSIC_PENDING_SEARCH_TTL_MS,
      DEFAULT_PENDING_SEARCH_TTL_MS,
      { min: 1_000 },
    ),
    maxSelectionResults: parseInteger(
      process.env.MUSIC_MAX_SELECTION_RESULTS,
      DEFAULT_MAX_SELECTION_RESULTS,
      { min: 1, max: 25 },
    ),
    allowedExtensions: [...ALLOWED_EXTENSIONS],
    allowedExtensionsLabel: ALLOWED_EXTENSIONS.map((ext) => ext.replace(".", "")).join(", "),
    contentTypeToExtension: { ...CONTENT_TYPE_TO_EXTENSION },
  };
}

function buildYtdlpConfig(): RuntimeConfig["ytdlp"] {
  return {
    enabled: parseBoolean(process.env.YT_DLP_ENABLED, DEFAULT_YT_DLP_ENABLED),
    binaryPath: parseText(process.env.YT_DLP_PATH),
    autoDownload: parseBoolean(process.env.YT_DLP_AUTO_DOWNLOAD, DEFAULT_YT_DLP_AUTO_DOWNLOAD),
    timeoutMs: parseInteger(process.env.YT_DLP_TIMEOUT_MS, DEFAULT_YT_DLP_TIMEOUT_MS, { min: 1_000 }),
    cacheDir: path.resolve(parseText(process.env.YT_DLP_CACHE_DIR) || DEFAULT_YT_DLP_CACHE_DIR),
  };
}

function buildLavalinkConfig(): RuntimeConfig["lavalink"] {
  const volumeDecrementerRaw = parseText(process.env.LAVALINK_VOLUME_DECREMENTER);
  const volumeDecrementerParsed = Number.parseFloat(volumeDecrementerRaw);
  const volumeDecrementer = Number.isFinite(volumeDecrementerParsed)
    ? volumeDecrementerParsed
    : DEFAULT_LAVALINK_VOLUME_DECREMENTER;
  return {
    nodeId: parseText(process.env.LAVALINK_NODE_ID) || DEFAULT_LAVALINK_NODE_ID,
    host: parseText(process.env.LAVALINK_HOST) || DEFAULT_LAVALINK_HOST,
    port: parseInteger(process.env.LAVALINK_PORT, DEFAULT_LAVALINK_PORT, { min: 1, max: 65_535 }),
    authorization: parseText(process.env.LAVALINK_PASSWORD) || DEFAULT_LAVALINK_PASSWORD,
    secure: parseBoolean(process.env.LAVALINK_SECURE, DEFAULT_LAVALINK_SECURE),
    traceEnabled: parseBoolean(process.env.LAVALINK_TRACE_ENABLED, DEFAULT_LAVALINK_TRACE_ENABLED),
    username: parseText(process.env.LAVALINK_USERNAME) || DEFAULT_LAVALINK_USERNAME,
    defaultSearchPlatform: (parseText(process.env.LAVALINK_DEFAULT_SEARCH_PLATFORM) || "ytmsearch") as SearchPlatform,
    maxPreviousTracks: parseInteger(process.env.LAVALINK_MAX_PREVIOUS_TRACKS, DEFAULT_LAVALINK_MAX_PREVIOUS_TRACKS, { min: 1 }),
    emptyQueueDestroyMs: parseInteger(process.env.LAVALINK_EMPTY_QUEUE_DESTROY_MS, DEFAULT_LAVALINK_EMPTY_QUEUE_DESTROY_MS, { min: 1_000 }),
    clientPositionUpdateInterval: parseInteger(process.env.LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL, DEFAULT_LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL, { min: 50 }),
    volumeDecrementer,
  };
}

function buildAppConfig(): RuntimeConfig["app"] {
  return {
    clearGlobalCommandsOnRegister: parseBoolean(process.env.CLEAR_GLOBAL, true),
    maxLogReasonLength: parseInteger(process.env.SBK_MAX_REASON_LENGTH, 2_000, { min: 50 }),
  };
}

let cachedRuntimeConfig: RuntimeConfig | null = null;

export function buildRuntimeConfig(): RuntimeConfig {
  const filePort = parseInteger(process.env.FILE_PORT, 3001, { min: 1, max: 65_535 });
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
    ai: buildAiConfig(),
  };
  return cachedRuntimeConfig;
}

export function getRuntimeConfig(): RuntimeConfig {
  if (cachedRuntimeConfig) return cachedRuntimeConfig;
  cachedRuntimeConfig = buildRuntimeConfig();
  return cachedRuntimeConfig;
}

export function resolveAiModelApiKey(guildId: string | null | undefined): string | undefined {
  const { ai } = getRuntimeConfig();
  return resolveGuildValue(ai.modelApiKeysByGuild, guildId, ai.modelApiKey);
}

export function resolveAiAuxModelApiKey(guildId: string | null | undefined): string | undefined {
  const { ai } = getRuntimeConfig();
  const resolvedAuxApiKey = resolveGuildValue(
    ai.auxModel.apiKeysByGuild,
    guildId,
    ai.auxModel.inheritsModelApiKey ? undefined : ai.auxModel.apiKey,
  );
  if (resolvedAuxApiKey !== undefined) {
    return resolvedAuxApiKey;
  }
  return resolveAiModelApiKey(guildId);
}

export function resolveAiImageApiKey(guildId: string | null | undefined): string | undefined {
  const { ai } = getRuntimeConfig();
  return resolveGuildValue(ai.imageApiKeysByGuild, guildId, ai.imageApiKey);
}
