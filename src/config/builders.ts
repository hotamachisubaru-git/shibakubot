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
  DEFAULT_MODEL_ENDPOINT,
  DEFAULT_MODEL_NAME,
  DEFAULT_MODEL_AUTO_DETECT_NAMES,
  DEFAULT_MODEL_TIMEOUT_MS,
  DEFAULT_MAX_HISTORY_TURNS,
  DEFAULT_MAX_RESPONSE_CHARS,
  DEFAULT_AI_GUILD_MEMORY_ENABLED,
  DEFAULT_AI_GUILD_MEMORY_CHANNEL_LIMIT,
  DEFAULT_AI_GUILD_MEMORY_MESSAGES_PER_CHANNEL,
  DEFAULT_AI_GUILD_MEMORY_MAX_INPUT_CHARS,
  DEFAULT_AI_GUILD_MEMORY_MAX_SUMMARY_CHARS,
  DEFAULT_AI_GUILD_MEMORY_REFRESH_HOURS,
  DEFAULT_AI_GUILD_MEMORY_LIVE_ENABLED,
  DEFAULT_AI_GUILD_MEMORY_LIVE_MESSAGE_THRESHOLD,
  DEFAULT_AI_GUILD_MEMORY_LIVE_DEBOUNCE_MS,
  DEFAULT_AI_GUILD_MEMORY_LIVE_MIN_INTERVAL_MINUTES,
  DEFAULT_IMAGE_TIMEOUT_MS,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_IMAGE_STEPS,
  DEFAULT_IMAGE_CFG_SCALE,
  DEFAULT_IMAGE_SAMPLER_NAME,
  DEFAULT_AI_SYSTEM_PROMPT,
  ALLOWED_EXTENSIONS,
  CONTENT_TYPE_TO_EXTENSION,
} from "./constants";
import { parseBoolean, parseInteger, parseText, parseGuildValueMap } from "../utils/env";
import { buildUploadUrlConfig, resolveGuildValue, parseOptionalText, parseModelAutoDetectNames, parseModelAutoDetectNamesWithFallback } from "./helpers";
import type { RuntimeConfig } from "./types";

export function buildSbkRange(): RuntimeConfig["sbk"] {
  const min = parseInteger(process.env.SBK_MIN, DEFAULT_SBK_MIN, { min: 1 });
  const maxCandidate = parseInteger(process.env.SBK_MAX, DEFAULT_SBK_MAX, { min: 1 });
  const max = Math.max(min, maxCandidate);
  const optionsMax = Math.min(max, min + DISCORD_SELECT_OPTION_LIMIT - 1);
  return {
    min,
    max,
    options: Array.from(
      { length: optionsMax - min + 1 },
      (_, index) => min + index,
    ),
  };
}

export function buildMusicConfig(): RuntimeConfig["music"] {
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

export function buildYtdlpConfig(): RuntimeConfig["ytdlp"] {
  return {
    enabled: parseBoolean(process.env.YT_DLP_ENABLED, DEFAULT_YT_DLP_ENABLED),
    binaryPath: parseText(process.env.YT_DLP_PATH),
    autoDownload: parseBoolean(process.env.YT_DLP_AUTO_DOWNLOAD, DEFAULT_YT_DLP_AUTO_DOWNLOAD),
    timeoutMs: parseInteger(process.env.YT_DLP_TIMEOUT_MS, DEFAULT_YT_DLP_TIMEOUT_MS, { min: 1_000 }),
    cacheDir: path.resolve(parseText(process.env.YT_DLP_CACHE_DIR) || DEFAULT_YT_DLP_CACHE_DIR),
  };
}

export function buildLavalinkConfig(): RuntimeConfig["lavalink"] {
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

export function buildAiConfig(): RuntimeConfig["ai"] {
  const modelEndpoint = parseText(process.env.MODEL_ENDPOINT) || DEFAULT_MODEL_ENDPOINT;
  const modelName = parseText(process.env.MODEL_NAME) || DEFAULT_MODEL_NAME;
  const autoDetectModelNames = parseModelAutoDetectNames(process.env.MODEL_AUTO_DETECT_NAMES, [...DEFAULT_MODEL_AUTO_DETECT_NAMES]);
  const googleSearchEnabled = parseBoolean(process.env.MODEL_GOOGLE_SEARCH_ENABLED, false);
  const modelApiKey = parseOptionalText(process.env.MODEL_API_KEY);
  const modelApiKeysByGuild = parseGuildValueMap(process.env.MODEL_API_KEY_BY_GUILD);
  const modelTimeoutMs = parseInteger(process.env.MODEL_TIMEOUT_MS, DEFAULT_MODEL_TIMEOUT_MS, { min: 1_000 });

  const auxModelEndpoint = parseText(process.env.AUX_MODEL_ENDPOINT) || modelEndpoint;
  const auxModelName = parseText(process.env.AUX_MODEL_NAME) || modelName;
  const auxModelAutoDetectNames = parseModelAutoDetectNamesWithFallback(
    process.env.AUX_MODEL_AUTO_DETECT_NAMES,
    [auxModelName],
  );
  const auxModelApiKeyRaw = parseOptionalText(process.env.AUX_MODEL_API_KEY);
  const auxModelApiKey = auxModelApiKeyRaw ?? modelApiKey;
  const auxModelApiKeysByGuild = parseGuildValueMap(process.env.AUX_MODEL_API_KEY_BY_GUILD);
  const auxModelTimeoutMs = parseInteger(process.env.AUX_MODEL_TIMEOUT_MS, modelTimeoutMs, { min: 1_000 });

  const maxHistoryTurns = parseInteger(process.env.MAX_HISTORY_TURNS, DEFAULT_MAX_HISTORY_TURNS, { min: 1, max: 100 });
  const maxResponseChars = parseInteger(process.env.MAX_RESPONSE_CHARS, DEFAULT_MAX_RESPONSE_CHARS, { min: 200, max: 32_000 });

  const systemPromptRaw = parseText(process.env.SYSTEM_PROMPT);
  const systemPrompt = (systemPromptRaw || DEFAULT_AI_SYSTEM_PROMPT).replace(/\\n/g, "\n").trim();

  const imageEndpoint = parseOptionalText(process.env.IMAGE_ENDPOINT);
  const imageModel = parseOptionalText(process.env.IMAGE_MODEL);
  const imageApiKey = parseOptionalText(process.env.IMAGE_API_KEY);
  const imageApiKeysByGuild = parseGuildValueMap(process.env.IMAGE_API_KEY_BY_GUILD);
  const imageTimeoutMs = parseInteger(process.env.IMAGE_TIMEOUT_MS, DEFAULT_IMAGE_TIMEOUT_MS, { min: 1_000 });
  const imageDefaultSizeRaw = parseText(process.env.IMAGE_DEFAULT_SIZE) || DEFAULT_IMAGE_SIZE;
  const imageDefaultSize = /^\d+x\d+$/.test(imageDefaultSizeRaw) ? imageDefaultSizeRaw : DEFAULT_IMAGE_SIZE;
  const imageSteps = parseInteger(process.env.IMAGE_STEPS, DEFAULT_IMAGE_STEPS, { min: 1 });
  const imageCfgScaleRaw = parseText(process.env.IMAGE_CFG_SCALE);
  const imageCfgScaleParsed = Number.parseFloat(imageCfgScaleRaw);
  const imageCfgScale = Number.isFinite(imageCfgScaleParsed) && imageCfgScaleParsed > 0
    ? imageCfgScaleParsed
    : DEFAULT_IMAGE_CFG_SCALE;
  const imageSamplerName = parseText(process.env.IMAGE_SAMPLER_NAME) || DEFAULT_IMAGE_SAMPLER_NAME;
  const imageNegativePrompt = parseOptionalText(process.env.IMAGE_NEGATIVE_PROMPT);

  return {
    modelEndpoint,
    modelName,
    autoDetectModelNames,
    googleSearchEnabled,
    modelApiKey,
    modelApiKeysByGuild,
    modelTimeoutMs,
    auxModel: {
      endpoint: auxModelEndpoint,
      modelName: auxModelName,
      autoDetectModelNames: auxModelAutoDetectNames,
      apiKey: auxModelApiKey,
      apiKeysByGuild: auxModelApiKeysByGuild,
      inheritsModelApiKey: auxModelApiKeyRaw === undefined,
      timeoutMs: auxModelTimeoutMs,
    },
    maxHistoryTurns,
    maxResponseChars,
    systemPrompt,
    guildMemory: {
      enabled: parseBoolean(process.env.AI_GUILD_MEMORY_ENABLED, DEFAULT_AI_GUILD_MEMORY_ENABLED),
      channelLimit: parseInteger(process.env.AI_GUILD_MEMORY_CHANNEL_LIMIT, DEFAULT_AI_GUILD_MEMORY_CHANNEL_LIMIT, { min: 1, max: 20 }),
      messagesPerChannel: parseInteger(process.env.AI_GUILD_MEMORY_MESSAGES_PER_CHANNEL, DEFAULT_AI_GUILD_MEMORY_MESSAGES_PER_CHANNEL, { min: 5, max: 100 }),
      maxInputChars: parseInteger(process.env.AI_GUILD_MEMORY_MAX_INPUT_CHARS, DEFAULT_AI_GUILD_MEMORY_MAX_INPUT_CHARS, { min: 1_000, max: 100_000 }),
      maxSummaryChars: parseInteger(process.env.AI_GUILD_MEMORY_MAX_SUMMARY_CHARS, DEFAULT_AI_GUILD_MEMORY_MAX_SUMMARY_CHARS, { min: 200, max: 8_000 }),
      refreshHours: parseInteger(process.env.AI_GUILD_MEMORY_REFRESH_HOURS, DEFAULT_AI_GUILD_MEMORY_REFRESH_HOURS, { min: 1, max: 24 * 30 }),
      liveEnabled: parseBoolean(process.env.AI_GUILD_MEMORY_LIVE_ENABLED, DEFAULT_AI_GUILD_MEMORY_LIVE_ENABLED),
      liveMessageThreshold: parseInteger(process.env.AI_GUILD_MEMORY_LIVE_MESSAGE_THRESHOLD, DEFAULT_AI_GUILD_MEMORY_LIVE_MESSAGE_THRESHOLD, { min: 1, max: 500 }),
      liveDebounceMs: parseInteger(process.env.AI_GUILD_MEMORY_LIVE_DEBOUNCE_MS, DEFAULT_AI_GUILD_MEMORY_LIVE_DEBOUNCE_MS, { min: 1_000, max: 60 * 60 * 1000 }),
      liveMinIntervalMinutes: parseInteger(process.env.AI_GUILD_MEMORY_LIVE_MIN_INTERVAL_MINUTES, DEFAULT_AI_GUILD_MEMORY_LIVE_MIN_INTERVAL_MINUTES, { min: 1, max: 24 * 60 }),
    },
    imageEndpoint,
    imageModel,
    imageApiKey,
    imageApiKeysByGuild,
    imageTimeoutMs,
    imageDefaultSize,
    imageSteps,
    imageCfgScale,
    imageSamplerName,
    imageNegativePrompt,
  };
}
