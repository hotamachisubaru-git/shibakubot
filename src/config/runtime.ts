import path from "node:path";
import type { SearchPlatform } from "lavalink-client";
import { parseBoolean, parseCsvSet, parseCsvValues, parseInteger, parseText } from "../utils/env";

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
const DEFAULT_LAVALINK_NODE_ID = "local";
const DEFAULT_LAVALINK_HOST = "127.0.0.1";
const DEFAULT_LAVALINK_PORT = 2333;
const DEFAULT_LAVALINK_PASSWORD = "youshallnotpass";
const DEFAULT_LAVALINK_USERNAME = "shibakubot";
const DEFAULT_LAVALINK_SECURE = false;
const DEFAULT_LAVALINK_MAX_PREVIOUS_TRACKS = 25;
const DEFAULT_LAVALINK_EMPTY_QUEUE_DESTROY_MS = 60_000;
const DEFAULT_LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL = 150;
const DEFAULT_LAVALINK_VOLUME_DECREMENTER = 0.75;
const DEFAULT_MODEL_ENDPOINT = "http://localhost:11434/api/chat";
const DEFAULT_MODEL_NAME = "gpt-oss:20b";
const DEFAULT_MODEL_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_HISTORY_TURNS = 8;
const DEFAULT_MAX_RESPONSE_CHARS = 8_000;
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

type UrlBaseConfig = Readonly<{
  publicBaseUrl: URL;
  internalBaseUrl: URL;
}>;

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
    fixedVolume: number;
    maxTrackMinutes: number;
    maxTrackMs: number;
    pendingSearchTtlMs: number;
    maxSelectionResults: number;
    allowedExtensions: readonly string[];
    allowedExtensionsLabel: string;
    contentTypeToExtension: Readonly<Record<string, string>>;
  }>;
  lavalink: Readonly<{
    nodeId: string;
    host: string;
    port: number;
    authorization: string;
    secure: boolean;
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
    modelApiKey?: string;
    modelTimeoutMs: number;
    maxHistoryTurns: number;
    maxResponseChars: number;
    systemPrompt: string;
    imageEndpoint?: string;
    imageModel?: string;
    imageApiKey?: string;
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

function buildRuntimeConfig(): RuntimeConfig {
  const filePort = parseInteger(process.env.FILE_PORT, DEFAULT_FILE_PORT, {
    min: 1,
    max: 65_535,
  });
  const fileHost = parseText(process.env.FILE_HOST) || DEFAULT_FILE_HOST;
  const uploadDir = path.resolve(
    parseText(process.env.FILE_DIR) || DEFAULT_FILE_DIR,
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
  const modelApiKey = parseText(process.env.MODEL_API_KEY) || undefined;
  const modelTimeoutMs = parseInteger(
    process.env.MODEL_TIMEOUT_MS,
    DEFAULT_MODEL_TIMEOUT_MS,
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
  const systemPromptRaw = parseText(process.env.SYSTEM_PROMPT);
  const systemPrompt = (systemPromptRaw || DEFAULT_AI_SYSTEM_PROMPT)
    .replace(/\\n/g, "\n")
    .trim();
  const imageEndpoint = parseText(process.env.IMAGE_ENDPOINT) || undefined;
  const imageModel = parseText(process.env.IMAGE_MODEL) || undefined;
  const imageApiKey = parseText(process.env.IMAGE_API_KEY) || undefined;
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
  const imageNegativePrompt = parseText(process.env.IMAGE_NEGATIVE_PROMPT) || undefined;

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
      fixedVolume: parseInteger(
        process.env.MUSIC_FIXED_VOLUME,
        DEFAULT_MUSIC_FIXED_VOLUME,
        { min: 0, max: 20 },
      ),
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
      modelApiKey,
      modelTimeoutMs,
      maxHistoryTurns,
      maxResponseChars,
      systemPrompt,
      imageEndpoint,
      imageModel,
      imageApiKey,
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
