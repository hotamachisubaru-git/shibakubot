import { getRuntimeConfig } from "./config/runtime";
import { parseCsvValues } from "./utils/env";

const runtimeConfig = getRuntimeConfig();

export const SBK_MIN = runtimeConfig.sbk.min;
export const SBK_MAX = runtimeConfig.sbk.max;
export const LOG_CHANNEL_ID = parseCsvValues(runtimeConfig.discord.logChannelId)[0] ?? "";
export const SBK_OPTIONS: readonly number[] = runtimeConfig.sbk.options;
