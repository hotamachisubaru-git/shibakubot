import type { SearchPlatform } from "lavalink-client";

export const DISCORD_SELECT_OPTION_LIMIT = 25;
export const DEFAULT_SBK_MIN = 1;
export const DEFAULT_SBK_MAX = 25;
export const DEFAULT_FILE_PORT = 3001;
export const DEFAULT_FILE_HOST = "0.0.0.0";
export const DEFAULT_FILE_DIR = "./files";
export const DEFAULT_MUSIC_PREFIX = "s!";
export const DEFAULT_MUSIC_FIXED_VOLUME = 20;
export const DEFAULT_MUSIC_MAX_TRACK_MINUTES = 15;
export const MAX_MUSIC_MAX_TRACK_MINUTES = Math.floor(2_147_483_647 / 60_000);
export const DEFAULT_PENDING_SEARCH_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_MAX_SELECTION_RESULTS = 10;
export const DEFAULT_YT_DLP_ENABLED = true;
export const DEFAULT_YT_DLP_AUTO_DOWNLOAD = true;
export const DEFAULT_YT_DLP_TIMEOUT_MS = 3 * 60 * 1000;
export const DEFAULT_YT_DLP_CACHE_DIR = "./data/yt-dlp";
export const DEFAULT_LAVALINK_NODE_ID = "local";
export const DEFAULT_LAVALINK_HOST = "127.0.0.1";
export const DEFAULT_LAVALINK_PORT = 2333;
export const DEFAULT_LAVALINK_PASSWORD = "youshallnotpass";
export const DEFAULT_LAVALINK_USERNAME = "shibakubot";
export const DEFAULT_LAVALINK_SECURE = false;
export const DEFAULT_LAVALINK_TRACE_ENABLED = false;
export const DEFAULT_LAVALINK_MAX_PREVIOUS_TRACKS = 25;
export const DEFAULT_LAVALINK_EMPTY_QUEUE_DESTROY_MS = 60_000;
export const DEFAULT_LAVALINK_CLIENT_POSITION_UPDATE_INTERVAL = 150;
export const DEFAULT_LAVALINK_VOLUME_DECREMENTER = 0.75;
export const DEFAULT_MODEL_ENDPOINT = "http://localhost:11434/api/chat";
export const DEFAULT_MODEL_NAME = "gpt-oss:20b";
export const DEFAULT_MODEL_AUTO_DETECT_NAMES = ["gemma3:27b", "gpt-oss:20b"] as const;
export const DEFAULT_MODEL_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_HISTORY_TURNS = 8;
export const DEFAULT_MAX_RESPONSE_CHARS = 8_000;
export const DEFAULT_AI_GUILD_MEMORY_ENABLED = true;
export const DEFAULT_AI_GUILD_MEMORY_CHANNEL_LIMIT = 4;
export const DEFAULT_AI_GUILD_MEMORY_MESSAGES_PER_CHANNEL = 30;
export const DEFAULT_AI_GUILD_MEMORY_MAX_INPUT_CHARS = 12_000;
export const DEFAULT_AI_GUILD_MEMORY_MAX_SUMMARY_CHARS = 1_200;
export const DEFAULT_AI_GUILD_MEMORY_REFRESH_HOURS = 12;
export const DEFAULT_AI_GUILD_MEMORY_LIVE_ENABLED = true;
export const DEFAULT_AI_GUILD_MEMORY_LIVE_MESSAGE_THRESHOLD = 12;
export const DEFAULT_AI_GUILD_MEMORY_LIVE_DEBOUNCE_MS = 60_000;
export const DEFAULT_AI_GUILD_MEMORY_LIVE_MIN_INTERVAL_MINUTES = 15;
export const DEFAULT_IMAGE_TIMEOUT_MS = 120_000;
export const DEFAULT_IMAGE_SIZE = "1024x1024";
export const DEFAULT_IMAGE_STEPS = 25;
export const DEFAULT_IMAGE_CFG_SCALE = 6.5;
export const DEFAULT_IMAGE_SAMPLER_NAME = "DPM++ 2M Karras";

export const DEFAULT_AI_SYSTEM_PROMPT = [
  "あなたはロールプレイ会話を行うAIアシスタントです。",
  "以下の「キャラクター設定」を最優先で守って回答してください。",
  "口調・語尾・性格・テンションを毎回一貫させてください。",
  "説明的な回答でも、話し方は必ずキャラクター設定に合わせてください。",
  "不明な情報は捏造せず、キャラクター口調のまま「分からない」と伝えてください。",
  "",
  "キャラクター設定:",
  "あなたは親切で実用的なAIアシスタントです。回答は日本語で行ってください。",
].join("\n");

export const DISABLED_TEXT_VALUES = new Set(["none", "null", "undefined"]);

export const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"] as const;

export const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/flac": ".flac",
  "audio/x-flac": ".flac",
  "audio/mp4": ".m4a",
  "audio/aac": ".aac",
  "audio/ogg": ".ogg",
};
