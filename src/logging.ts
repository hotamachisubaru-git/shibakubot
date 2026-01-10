// src/logging.ts
import {
  ChannelType,
  TextChannel,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { LOG_CHANNEL_ID } from './config';
import { getSetting } from './data';
import { displayNameFrom, AnyInteraction } from './utils/displayNameUtil';

const LOG_CHANNEL_KEY = 'logChannelId';

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
  const customChannelId = guildId ? getSetting(guildId, LOG_CHANNEL_KEY) : null;
  let channelId = customChannelId || LOG_CHANNEL_ID;
  if (!channelId) return;

  let ch = await interaction.client.channels
    .fetch(channelId)
    .catch(() => null);

  if (!ch && customChannelId && LOG_CHANNEL_ID && LOG_CHANNEL_ID !== customChannelId) {
    channelId = LOG_CHANNEL_ID;
    ch = await interaction.client.channels
      .fetch(channelId)
      .catch(() => null);
  }
  
  if (!ch || ch.type !== ChannelType.GuildText) return;

  const actorName = await displayNameFrom(interaction, actorId);
  const targetName = await displayNameFrom(interaction, targetId);

  await (ch as TextChannel).send({
    content:
      `${actorName} → ${targetName}\n` +
      `理由: ${reason}\n` +
      `今回: ${count} 回\n` +
      `累計: ${next} 回`,
    allowedMentions: { parse: [] },
  });
}
