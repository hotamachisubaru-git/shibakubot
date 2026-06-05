import { getRuntimeConfig } from "../config/runtime";

const aiConfig = getRuntimeConfig().ai;
export const guildMemoryConfig = aiConfig.guildMemory;
export const auxModelConfig = aiConfig.auxModel;

export type SampledGuildTranscript = Readonly<{
  transcript: string;
  sampledChannels: number;
  sampledMessages: number;
}>;
