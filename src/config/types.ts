import type { SearchPlatform } from "lavalink-client";

export type UrlBaseConfig = Readonly<{
  publicBaseUrl: URL;
  internalBaseUrl: URL;
}>;

export type GuildValueMap = ReadonlyMap<string, string>;

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
