// src/logging.ts
import {
  ChannelType,
  TextChannel,
} from "discord.js";
import { getRuntimeConfig } from "./config/runtime";
import { SETTING_KEYS } from "./constants/settings";
import { getSetting } from "./data";
import { displayNameFrom, AnyInteraction } from "./utils/displayNameUtil";
import { parseCsvValues } from "./utils/env";

const runtimeConfig = getRuntimeConfig();

async function resolveLogChannel(
  interaction: AnyInteraction,
  guildId: string,
): Promise<TextChannel | null> {
  const envLogChannelIds = parseCsvValues(runtimeConfig.discord.logChannelId);
  const channelCandidates = Array.from(
    new Set(
      [getSetting(guildId, SETTING_KEYS.logChannelId), ...envLogChannelIds].filter((value): value is string =>
        Boolean(value),
      ),
    ),
  );

  for (const channelId of channelCandidates) {
    const channel = await interaction.client.channels
      .fetch(channelId)
      .catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) continue;
    if (channel.guildId !== guildId) continue;
    return channel;
  }

  return null;
}

export async function sendLog(
  interaction: AnyInteraction,
  actorId: string,
  targetId: string,
  reason: string,
  count: bigint,
  next: bigint,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const guildId = interaction.guildId ?? guild.id;
  const channel = await resolveLogChannel(interaction, guildId);
  if (!channel) return;

  const actorName = await displayNameFrom(interaction, actorId);
  const targetName = await displayNameFrom(interaction, targetId);

  await channel.send({
    content:
      `${actorName} → ${targetName}\n` +
      `理由: ${reason}\n` +
      `今回: ${count} 回\n` +
      `累計: ${next} 回`,
    allowedMentions: { parse: [] },
  });
}
