import { getRuntimeConfig } from "./config/runtime";

const runtimeConfig = getRuntimeConfig();

export const SBK_MIN = runtimeConfig.sbk.min;
export const SBK_MAX = runtimeConfig.sbk.max;
export const LOG_CHANNEL_ID = runtimeConfig.discord.logChannelId;
export const SBK_OPTIONS: readonly number[] = runtimeConfig.sbk.options;
