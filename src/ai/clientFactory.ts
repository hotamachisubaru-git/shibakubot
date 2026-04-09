import {
  getRuntimeConfig,
  resolveAiAuxModelApiKey,
  resolveAiImageApiKey,
  resolveAiModelApiKey,
} from "../config/runtime";
import { SdxlImageClient, type SdxlImageClientOptions } from "./image-client";
import {
  OllamaCompatibleClient,
  type OllamaCompatibleClientOptions,
} from "./model-client";

const aiConfig = getRuntimeConfig().ai;

const conversationModelClientCache = new Map<string, OllamaCompatibleClient>();
const guildMemoryAuxModelClientCache = new Map<string, OllamaCompatibleClient>();
const guildMemoryFallbackModelClientCache = new Map<string, OllamaCompatibleClient>();
const imageClientCache = new Map<string, SdxlImageClient>();

export function getConversationModelClient(
  guildId: string | null | undefined,
): OllamaCompatibleClient {
  const options: OllamaCompatibleClientOptions = {
    endpoint: aiConfig.modelEndpoint,
    modelName: aiConfig.modelName,
    autoDetectModelNames: aiConfig.autoDetectModelNames,
    googleSearchEnabled: aiConfig.googleSearchEnabled,
    apiKey: resolveAiModelApiKey(guildId),
    timeoutMs: aiConfig.modelTimeoutMs,
  };

  return getOrCreateModelClient(conversationModelClientCache, options);
}

export function getGuildMemoryAuxModelClient(
  guildId: string | null | undefined,
): OllamaCompatibleClient {
  const options: OllamaCompatibleClientOptions = {
    endpoint: aiConfig.auxModel.endpoint,
    modelName: aiConfig.auxModel.modelName,
    autoDetectModelNames: aiConfig.auxModel.autoDetectModelNames,
    apiKey: resolveAiAuxModelApiKey(guildId),
    timeoutMs: aiConfig.auxModel.timeoutMs,
  };

  return getOrCreateModelClient(guildMemoryAuxModelClientCache, options);
}

export function getGuildMemoryFallbackModelClient(
  guildId: string | null | undefined,
): OllamaCompatibleClient {
  const options: OllamaCompatibleClientOptions = {
    endpoint: aiConfig.modelEndpoint,
    modelName: aiConfig.modelName,
    autoDetectModelNames: aiConfig.autoDetectModelNames,
    apiKey: resolveAiModelApiKey(guildId),
    timeoutMs: aiConfig.modelTimeoutMs,
  };

  return getOrCreateModelClient(guildMemoryFallbackModelClientCache, options);
}

export function hasDistinctGuildMemoryFallbackModel(
  guildId: string | null | undefined,
): boolean {
  const auxApiKey = resolveAiAuxModelApiKey(guildId);
  const modelApiKey = resolveAiModelApiKey(guildId);

  return (
    aiConfig.auxModel.endpoint !== aiConfig.modelEndpoint ||
    aiConfig.auxModel.modelName !== aiConfig.modelName ||
    aiConfig.auxModel.timeoutMs !== aiConfig.modelTimeoutMs ||
    auxApiKey !== modelApiKey ||
    aiConfig.auxModel.autoDetectModelNames.join("\u0000") !==
      aiConfig.autoDetectModelNames.join("\u0000")
  );
}

export function getImageClient(
  guildId: string | null | undefined,
): SdxlImageClient | undefined {
  if (!aiConfig.imageEndpoint) {
    return undefined;
  }

  const options: SdxlImageClientOptions = {
    endpoint: aiConfig.imageEndpoint,
    modelName: aiConfig.imageModel,
    apiKey: resolveAiImageApiKey(guildId),
    timeoutMs: aiConfig.imageTimeoutMs,
    steps: aiConfig.imageSteps,
    cfgScale: aiConfig.imageCfgScale,
    samplerName: aiConfig.imageSamplerName,
    negativePrompt: aiConfig.imageNegativePrompt,
  };

  return getOrCreateImageClient(options);
}

function getOrCreateModelClient(
  cache: Map<string, OllamaCompatibleClient>,
  options: OllamaCompatibleClientOptions,
): OllamaCompatibleClient {
  const cacheKey = JSON.stringify({
    endpoint: options.endpoint,
    modelName: options.modelName,
    autoDetectModelNames: options.autoDetectModelNames ?? [],
    googleSearchEnabled: options.googleSearchEnabled ?? false,
    apiKey: options.apiKey ?? "",
    timeoutMs: options.timeoutMs,
  });
  const existing = cache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const client = new OllamaCompatibleClient(options);
  cache.set(cacheKey, client);
  return client;
}

function getOrCreateImageClient(options: SdxlImageClientOptions): SdxlImageClient {
  const cacheKey = JSON.stringify({
    endpoint: options.endpoint,
    modelName: options.modelName ?? "",
    apiKey: options.apiKey ?? "",
    timeoutMs: options.timeoutMs,
    steps: options.steps,
    cfgScale: options.cfgScale,
    samplerName: options.samplerName,
    negativePrompt: options.negativePrompt ?? "",
  });
  const existing = imageClientCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const client = new SdxlImageClient(options);
  imageClientCache.set(cacheKey, client);
  return client;
}
