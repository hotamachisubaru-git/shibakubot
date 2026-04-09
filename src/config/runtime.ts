import path from "node:path";
import type { SearchPlatform } from "lavalink-client";
import {
  parseBoolean,
  parseCsvSet,
  parseCsvValues,
  parseGuildValueMap,
  parseInteger,
  parseText,
} from "../utils/env";

const DISCORD_SELECT_OPTION_LIMIT = 25;
const DEFAULT_SBK_MIN = 1;
const DEFAULT_SBK_MAX = 25;
const DEFAULT_FILE_PORT = 3001;
const DEFAULT_FILE_HOST = "0.0.0.0";
const DEFAULT_FILE_DIR = "./files";
const DEFAULT_MUSIC_PREFIX = "s!";
const DEFAULT_MUSIC_FIXED_VOLUME = 20;
const DEFAULT_MUSIC_MAX_TRACK_MINUTES = 15;
const DEFAULT_PENDING_SEARCH_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_SELECTION_RESULTS = 10;
const DEFAULT_YT_DLP_ENABLED = true;
const DEFAULT_YT_DLP_AUTO_DOWNLOAD = true;
const DEFAULT_YT_DLP_TIMEOUT_MS = 3 * 60 * 1000;
const DEFAULT_LAVALINK_NODE_ID = "local";
const DEFAULT_LAVALINK_HOST = "127.0.0.1";
const DEFAULT_LAVALINK_PORT = 2333;
const DEFAULT_LAVALINK_PASSWORD = "youshallnotpass";
const DEFAULT_LAVALINK_USERNAME = "shibakubot";
const DEFAULT_LAVALINK_SECURE = false;
const DEFAULT_LAVALINK_TRACE_ENABLED = false;
const DEFAULT_LAVALINK_MAX_PREVIOUS_TRACKS = 25;
const DEFAULT_LAVALINK_EMPTY_QUEUE_DESTROY_MS = 60_000;
const DEFAULT_LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL = 150;
const DEFAULT_LAVALINK_VOLUME_DECREMENTER = 0.75;
const DEFAULT_MODEL_ENDPOINT = "http://localhost:11434/api/chat";
const DEFAULT_MODEL_NAME = "gpt-oss:20b";
const DEFAULT_MODEL_AUTO_DETECT_NAMES = ["gemma3:27b", "gpt-oss:20b"] as const;
const DEFAULT_MODEL_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_HISTORY_TURNS = 8;
const DEFAULT_MAX_RESPONSE_CHARS = 8_000;
const DEFAULT_AI_GUILD_MEMORY_ENABLED = true;
const DEFAULT_AI_GUILD_MEMORY_CHANNEL_LIMIT = 4;
const DEFAULT_AI_GUILD_MEMORY_MESSAGES_PER_CHANNEL = 30;
const DEFAULT_AI_GUILD_MEMORY_MAX_INPUT_CHARS = 12_000;
const DEFAULT_AI_GUILD_MEMORY_MAX_SUMMARY_CHARS = 1_200;
const DEFAULT_AI_GUILD_MEMORY_REFRESH_HOURS = 12;
const DEFAULT_AI_GUILD_MEMORY_LIVE_ENABLED = true;
const DEFAULT_AI_GUILD_MEMORY_LIVE_MESSAGE_THRESHOLD = 12;
const DEFAULT_AI_GUILD_MEMORY_LIVE_DEBOUNCE_MS = 60_000;
const DEFAULT_AI_GUILD_MEMORY_LIVE_MIN_INTERVAL_MINUTES = 15;
const DEFAULT_IMAGE_TIMEOUT_MS = 120_000;
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_IMAGE_STEPS = 25;
const DEFAULT_IMAGE_CFG_SCALE = 6.5;
const DEFAULT_IMAGE_SAMPLER_NAME = "DPM++ 2M Karras";
const DEFAULT_AI_SYSTEM_PROMPT = [
  "あなたはロールプレイ会話を行うAIアシスタントです。",
  "以下の「キャラクター設定」を最優先で守って回答してください。",
  "口調・語尾・性格・テンションを毎回一貫させてください。",
  "説明的な回答でも、話し方は必ずキャラクター設定に合わせてください。",
  "不明な情報は捏造せず、キャラクター口調のまま「分からない」と伝えてください。",
  "",
  "キャラクター設定:",
  "あなたは親切で実用的なAIアシスタントです。回答は日本語で行ってください。",
].join("\n");
const DISABLED_TEXT_VALUES = new Set(["none", "null", "undefined"]);

type UrlBaseConfig = Readonly<{
  publicBaseUrl: URL;
  internalBaseUrl: URL;
}>;

type GuildValueMap = ReadonlyMap<string, string>;

function parseOptionalText(raw: string | undefined): string | undefined {
  const value = parseText(raw);
  if (!value || isDisabledTextValue(value)) {
    return undefined;
  }

  return value;
}

function parseModelAutoDetectNames(raw: string | undefined): readonly string[] {
  const value = parseText(raw);
  if (!value) {
    return [...DEFAULT_MODEL_AUTO_DETECT_NAMES];
  }

  if (isDisabledTextValue(value)) {
    return [];
  }

  const values = parseCsvValues(raw).filter((item) => !isDisabledTextValue(item));
  return values.length > 0 ? values : [...DEFAULT_MODEL_AUTO_DETECT_NAMES];
}

function parseModelAutoDetectNamesWithFallback(
  raw: string | undefined,
  fallback: readonly string[],
): readonly string[] {
  const value = parseText(raw);
  if (!value) {
    return [...fallback];
  }

  if (isDisabledTextValue(value)) {
    return [];
  }

  const values = parseCsvValues(raw).filter((item) => !isDisabledTextValue(item));
  return values.length > 0 ? values : [...fallback];
}

function isDisabledTextValue(value: string): boolean {
  return DISABLED_TEXT_VALUES.has(value.trim().toLowerCase());
}

export type RuntimeConfig = Readonly<{
  discord: Readonly<{
    token: string;
    clientId: string;
    guildIds: readonly string[];
    ownerIds: ReadonlySet<string>;
    immuneIds: ReadonlySet<string>;
    logChannelId: string;
  }>;
  sbk: Readonly<{
    min: number;
    max: number;
    options: readonly number[];
  }>;
  fileServer: Readonly<{
    uploadDir: string;
    host: string;
    port: number;
  }>;
  upload: UrlBaseConfig;
  music: Readonly<{
    prefix: string;
    spotifyDebugEnabled: boolean;
    fixedVolume: number;
    maxTrackMinutes: number;
    maxTrackMs: number;
    pendingSearchTtlMs: number;
    maxSelectionResults: number;
    allowedExtensions: readonly string[];
    allowedExtensionsLabel: string;
    contentTypeToExtension: Readonly<Record<string, string>>;
  }>;
  ytdlp: Readonly<{
    enabled: boolean;
    binaryPath?: string;
    autoDownload: boolean;
    timeoutMs: number;
    cacheDir: string;
  }>;
  lavalink: Readonly<{
    nodeId: string;
    host: string;
    port: number;
    authorization: string;
    secure: boolean;
    traceEnabled: boolean;
    username: string;
    defaultSearchPlatform: SearchPlatform;
    maxPreviousTracks: number;
    emptyQueueDestroyMs: number;
    clientPositionUpdateInterval: number;
    volumeDecrementer: number;
  }>;
  app: Readonly<{
    clearGlobalCommandsOnRegister: boolean;
    maxLogReasonLength: number;
  }>;
  ai: Readonly<{
    modelEndpoint: string;
    modelName: string;
    autoDetectModelNames: readonly string[];
    googleSearchEnabled: boolean;
    modelApiKey?: string;
    modelApiKeysByGuild: GuildValueMap;
    modelTimeoutMs: number;
    auxModel: Readonly<{
      endpoint: string;
      modelName: string;
      autoDetectModelNames: readonly string[];
      apiKey?: string;
      apiKeysByGuild: GuildValueMap;
      inheritsModelApiKey: boolean;
      timeoutMs: number;
    }>;
    maxHistoryTurns: number;
    maxResponseChars: number;
    systemPrompt: string;
    guildMemory: Readonly<{
      enabled: boolean;
      channelLimit: number;
      messagesPerChannel: number;
      maxInputChars: number;
      maxSummaryChars: number;
      refreshHours: number;
      liveEnabled: boolean;
      liveMessageThreshold: number;
      liveDebounceMs: number;
      liveMinIntervalMinutes: number;
    }>;
    imageEndpoint?: string;
    imageModel?: string;
    imageApiKey?: string;
    imageApiKeysByGuild: GuildValueMap;
    imageTimeoutMs: number;
    imageDefaultSize: string;
    imageSteps: number;
    imageCfgScale: number;
    imageSamplerName: string;
    imageNegativePrompt?: string;
  }>;
}>;

function normalizeUrl(raw: string | undefined, fallback: string): URL {
  const value = parseText(raw);
  if (!value) return new URL(fallback);

  try {
    return new URL(value);
  } catch {
    return new URL(fallback);
  }
}

function normalizeUploadBaseUrl(
  raw: string | undefined,
  fallback: string,
): URL {
  const url = normalizeUrl(raw, fallback);

  if (url.pathname === "/") {
    url.pathname = "/uploads/";
    return url;
  }

  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }

  return url;
}

function buildUploadUrlConfig(
  fileHost: string,
  filePort: number,
): UrlBaseConfig {
  const fallbackPublic = `http://localhost:${filePort}/uploads/`;
  const fallbackInternal = `http://127.0.0.1:${filePort}/uploads/`;

  const publicBase = normalizeUploadBaseUrl(
    process.env.UPLOAD_BASE_URL ?? process.env.FILE_BASE_URL,
    fallbackPublic,
  );
  const internalBase = normalizeUploadBaseUrl(
    process.env.UPLOAD_INTERNAL_URL,
    fallbackInternal,
  );

  if (!parseText(process.env.UPLOAD_INTERNAL_URL)) {
    const canUseFileHost =
      fileHost !== DEFAULT_FILE_HOST &&
      fileHost !== "localhost" &&
      fileHost !== "127.0.0.1";
    if (canUseFileHost) {
      return {
        publicBaseUrl: publicBase,
        internalBaseUrl: new URL(`http://${fileHost}:${filePort}/uploads/`),
      };
    }
  }

  return {
    publicBaseUrl: publicBase,
    internalBaseUrl: internalBase,
  };
}

function buildSbkRange(): RuntimeConfig["sbk"] {
  const min = parseInteger(process.env.SBK_MIN, DEFAULT_SBK_MIN, { min: 1 });
  const maxCandidate = parseInteger(process.env.SBK_MAX, DEFAULT_SBK_MAX, {
    min: 1,
  });
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

function resolveGuildValue(
  valuesByGuild: GuildValueMap,
  guildId: string | null | undefined,
  fallback: string | undefined,
): string | undefined {
  const normalizedGuildId = guildId?.trim();
  if (!normalizedGuildId) {
    return fallback;
  }

  return valuesByGuild.get(normalizedGuildId) ?? fallback;
}

function buildRuntimeConfig(): RuntimeConfig {
  const filePort = parseInteger(process.env.FILE_PORT, DEFAULT_FILE_PORT, {
    min: 1,
    max: 65_535,
  });
  const fileHost = parseText(process.env.FILE_HOST) || DEFAULT_FILE_HOST;
  const uploadDir = path.resolve(
    parseText(process.env.FILE_DIR) || DEFAULT_FILE_DIR,
  );
  const ytDlpCacheDir = path.resolve(
    parseText(process.env.YT_DLP_CACHE_DIR) || "./data/yt-dlp",
  );

  const allowedExtensions = [".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"] as const;
  const contentTypeToExtension: Record<string, string> = {
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/flac": ".flac",
    "audio/x-flac": ".flac",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/ogg": ".ogg",
  };
  const musicMaxTrackMinutes = parseInteger(
    process.env.MUSIC_MAX_MINUTES,
    DEFAULT_MUSIC_MAX_TRACK_MINUTES,
    { min: 1 },
  );
  const volumeDecrementerRaw = parseText(process.env.LAVALINK_VOLUME_DECREMENTER);
  const volumeDecrementerParsed = Number.parseFloat(volumeDecrementerRaw);
  const volumeDecrementer = Number.isFinite(volumeDecrementerParsed)
    ? volumeDecrementerParsed
    : DEFAULT_LAVALINK_VOLUME_DECREMENTER;
  const modelEndpoint = parseText(process.env.MODEL_ENDPOINT) || DEFAULT_MODEL_ENDPOINT;
  const modelName = parseText(process.env.MODEL_NAME) || DEFAULT_MODEL_NAME;
  const autoDetectModelNames = parseModelAutoDetectNames(
    process.env.MODEL_AUTO_DETECT_NAMES,
  );
  const googleSearchEnabled = parseBoolean(
    process.env.MODEL_GOOGLE_SEARCH_ENABLED,
    false,
  );
  const modelApiKey = parseOptionalText(process.env.MODEL_API_KEY);
  const modelApiKeysByGuild = parseGuildValueMap(process.env.MODEL_API_KEY_BY_GUILD);
  const modelTimeoutMs = parseInteger(
    process.env.MODEL_TIMEOUT_MS,
    DEFAULT_MODEL_TIMEOUT_MS,
    { min: 1_000 },
  );
  const auxModelEndpoint = parseText(process.env.AUX_MODEL_ENDPOINT) || modelEndpoint;
  const auxModelName = parseText(process.env.AUX_MODEL_NAME) || modelName;
  const auxModelAutoDetectNames = parseModelAutoDetectNamesWithFallback(
    process.env.AUX_MODEL_AUTO_DETECT_NAMES,
    [auxModelName],
  );
  const auxModelApiKeyRaw = parseOptionalText(process.env.AUX_MODEL_API_KEY);
  const auxModelApiKey = auxModelApiKeyRaw ?? modelApiKey;
  const auxModelApiKeysByGuild = parseGuildValueMap(process.env.AUX_MODEL_API_KEY_BY_GUILD);
  const auxModelTimeoutMs = parseInteger(
    process.env.AUX_MODEL_TIMEOUT_MS,
    modelTimeoutMs,
    { min: 1_000 },
  );
  const maxHistoryTurns = parseInteger(
    process.env.MAX_HISTORY_TURNS,
    DEFAULT_MAX_HISTORY_TURNS,
    { min: 1, max: 100 },
  );
  const maxResponseChars = parseInteger(
    process.env.MAX_RESPONSE_CHARS,
    DEFAULT_MAX_RESPONSE_CHARS,
    { min: 200, max: 32_000 },
  );
  const guildMemoryEnabled = parseBoolean(
    process.env.AI_GUILD_MEMORY_ENABLED,
    DEFAULT_AI_GUILD_MEMORY_ENABLED,
  );
  const guildMemoryChannelLimit = parseInteger(
    process.env.AI_GUILD_MEMORY_CHANNEL_LIMIT,
    DEFAULT_AI_GUILD_MEMORY_CHANNEL_LIMIT,
    { min: 1, max: 20 },
  );
  const guildMemoryMessagesPerChannel = parseInteger(
    process.env.AI_GUILD_MEMORY_MESSAGES_PER_CHANNEL,
    DEFAULT_AI_GUILD_MEMORY_MESSAGES_PER_CHANNEL,
    { min: 5, max: 100 },
  );
  const guildMemoryMaxInputChars = parseInteger(
    process.env.AI_GUILD_MEMORY_MAX_INPUT_CHARS,
    DEFAULT_AI_GUILD_MEMORY_MAX_INPUT_CHARS,
    { min: 1_000, max: 100_000 },
  );
  const guildMemoryMaxSummaryChars = parseInteger(
    process.env.AI_GUILD_MEMORY_MAX_SUMMARY_CHARS,
    DEFAULT_AI_GUILD_MEMORY_MAX_SUMMARY_CHARS,
    { min: 200, max: 8_000 },
  );
  const guildMemoryRefreshHours = parseInteger(
    process.env.AI_GUILD_MEMORY_REFRESH_HOURS,
    DEFAULT_AI_GUILD_MEMORY_REFRESH_HOURS,
    { min: 1, max: 24 * 30 },
  );
  const guildMemoryLiveEnabled = parseBoolean(
    process.env.AI_GUILD_MEMORY_LIVE_ENABLED,
    DEFAULT_AI_GUILD_MEMORY_LIVE_ENABLED,
  );
  const guildMemoryLiveMessageThreshold = parseInteger(
    process.env.AI_GUILD_MEMORY_LIVE_MESSAGE_THRESHOLD,
    DEFAULT_AI_GUILD_MEMORY_LIVE_MESSAGE_THRESHOLD,
    { min: 1, max: 500 },
  );
  const guildMemoryLiveDebounceMs = parseInteger(
    process.env.AI_GUILD_MEMORY_LIVE_DEBOUNCE_MS,
    DEFAULT_AI_GUILD_MEMORY_LIVE_DEBOUNCE_MS,
    { min: 1_000, max: 60 * 60 * 1000 },
  );
  const guildMemoryLiveMinIntervalMinutes = parseInteger(
    process.env.AI_GUILD_MEMORY_LIVE_MIN_INTERVAL_MINUTES,
    DEFAULT_AI_GUILD_MEMORY_LIVE_MIN_INTERVAL_MINUTES,
    { min: 1, max: 24 * 60 },
  );
  const systemPromptRaw = parseText(process.env.SYSTEM_PROMPT);
  const systemPrompt = (systemPromptRaw || DEFAULT_AI_SYSTEM_PROMPT)
    .replace(/\\n/g, "\n")
    .trim();
  const imageEndpoint = parseOptionalText(process.env.IMAGE_ENDPOINT);
  const imageModel = parseOptionalText(process.env.IMAGE_MODEL);
  const imageApiKey = parseOptionalText(process.env.IMAGE_API_KEY);
  const imageApiKeysByGuild = parseGuildValueMap(process.env.IMAGE_API_KEY_BY_GUILD);
  const imageTimeoutMs = parseInteger(
    process.env.IMAGE_TIMEOUT_MS,
    DEFAULT_IMAGE_TIMEOUT_MS,
    { min: 1_000 },
  );
  const imageDefaultSizeRaw = parseText(process.env.IMAGE_DEFAULT_SIZE) || DEFAULT_IMAGE_SIZE;
  const imageDefaultSize = /^\d+x\d+$/.test(imageDefaultSizeRaw)
    ? imageDefaultSizeRaw
    : DEFAULT_IMAGE_SIZE;
  const imageSteps = parseInteger(process.env.IMAGE_STEPS, DEFAULT_IMAGE_STEPS, {
    min: 1,
  });
  const imageCfgScaleRaw = parseText(process.env.IMAGE_CFG_SCALE);
  const imageCfgScaleParsed = Number.parseFloat(imageCfgScaleRaw);
  const imageCfgScale =
    Number.isFinite(imageCfgScaleParsed) && imageCfgScaleParsed > 0
      ? imageCfgScaleParsed
      : DEFAULT_IMAGE_CFG_SCALE;
  const imageSamplerName =
    parseText(process.env.IMAGE_SAMPLER_NAME) || DEFAULT_IMAGE_SAMPLER_NAME;
  const imageNegativePrompt = parseOptionalText(process.env.IMAGE_NEGATIVE_PROMPT);
  return {
    discord: {
      token: parseText(process.env.TOKEN),
      clientId: parseText(process.env.CLIENT_ID),
      guildIds: parseCsvValues(process.env.GUILD_IDS ?? process.env.GUILD_ID),
      ownerIds: parseCsvSet(process.env.OWNER_IDS),
      immuneIds: parseCsvSet(process.env.IMMUNE_IDS),
      logChannelId: parseText(process.env.LOG_CHANNEL_ID),
    },
    sbk: buildSbkRange(),
    fileServer: {
      uploadDir,
      host: fileHost,
      port: filePort,
    },
    upload: buildUploadUrlConfig(fileHost, filePort),
    music: {
      prefix: parseText(process.env.MUSIC_PREFIX) || DEFAULT_MUSIC_PREFIX,
      spotifyDebugEnabled: parseBoolean(
        process.env.SPOTIFY_DEBUG_ENABLED,
        false,
      ),
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
      allowedExtensions,
      allowedExtensionsLabel: allowedExtensions
        .map((ext) => ext.replace(".", ""))
        .join(", "),
      contentTypeToExtension,
    },
    ytdlp: {
      enabled: parseBoolean(
        process.env.YT_DLP_ENABLED,
        DEFAULT_YT_DLP_ENABLED,
      ),
      binaryPath: parseOptionalText(process.env.YT_DLP_PATH),
      autoDownload: parseBoolean(
        process.env.YT_DLP_AUTO_DOWNLOAD,
        DEFAULT_YT_DLP_AUTO_DOWNLOAD,
      ),
      timeoutMs: parseInteger(
        process.env.YT_DLP_TIMEOUT_MS,
        DEFAULT_YT_DLP_TIMEOUT_MS,
        { min: 1_000 },
      ),
      cacheDir: ytDlpCacheDir,
    },
    lavalink: {
      nodeId: parseText(process.env.LAVALINK_NODE_ID) || DEFAULT_LAVALINK_NODE_ID,
      host: parseText(process.env.LAVALINK_HOST) || DEFAULT_LAVALINK_HOST,
      port: parseInteger(process.env.LAVALINK_PORT, DEFAULT_LAVALINK_PORT, {
        min: 1,
        max: 65_535,
      }),
      authorization:
        parseText(process.env.LAVALINK_PASSWORD) || DEFAULT_LAVALINK_PASSWORD,
      secure: parseBoolean(process.env.LAVALINK_SECURE, DEFAULT_LAVALINK_SECURE),
      traceEnabled: parseBoolean(
        process.env.LAVALINK_TRACE_ENABLED,
        DEFAULT_LAVALINK_TRACE_ENABLED,
      ),
      username:
        parseText(process.env.LAVALINK_USERNAME) || DEFAULT_LAVALINK_USERNAME,
      defaultSearchPlatform:
        (parseText(process.env.LAVALINK_DEFAULT_SEARCH_PLATFORM) ||
          "ytmsearch") as SearchPlatform,
      maxPreviousTracks: parseInteger(
        process.env.LAVALINK_MAX_PREVIOUS_TRACKS,
        DEFAULT_LAVALINK_MAX_PREVIOUS_TRACKS,
        { min: 1 },
      ),
      emptyQueueDestroyMs: parseInteger(
        process.env.LAVALINK_EMPTY_QUEUE_DESTROY_MS,
        DEFAULT_LAVALINK_EMPTY_QUEUE_DESTROY_MS,
        { min: 1_000 },
      ),
      clientPositionUpdateInterval: parseInteger(
        process.env.LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL,
        DEFAULT_LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL,
        { min: 50 },
      ),
      volumeDecrementer,
    },
    app: {
      clearGlobalCommandsOnRegister: parseBoolean(
        process.env.CLEAR_GLOBAL,
        true,
      ),
      maxLogReasonLength: parseInteger(process.env.SBK_MAX_REASON_LENGTH, 2_000, {
        min: 50,
      }),
    },
    ai: {
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
        enabled: guildMemoryEnabled,
        channelLimit: guildMemoryChannelLimit,
        messagesPerChannel: guildMemoryMessagesPerChannel,
        maxInputChars: guildMemoryMaxInputChars,
        maxSummaryChars: guildMemoryMaxSummaryChars,
        refreshHours: guildMemoryRefreshHours,
        liveEnabled: guildMemoryLiveEnabled,
        liveMessageThreshold: guildMemoryLiveMessageThreshold,
        liveDebounceMs: guildMemoryLiveDebounceMs,
        liveMinIntervalMinutes: guildMemoryLiveMinIntervalMinutes,
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
    },
  };
}

let cachedRuntimeConfig: RuntimeConfig | null = null;

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
