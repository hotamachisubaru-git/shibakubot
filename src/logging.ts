// src/logging.ts
import {
  ChannelType,
  TextChannel,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { LOG_CHANNEL_ID } from './config';
import { displayNameFrom, AnyInteraction } from './utils/displayNameUtil';

export async function sendLog(
  interaction: AnyInteraction,
  actorId: string,
  targetId: string,
  reason: string,
  count: number,
  next: number,
): Promise<void> {
  if (!LOG_CHANNEL_ID) return;

  const guild = interaction.guild;
  if (!guild) return;

  const ch = await interaction.client.channels
  .fetch(LOG_CHANNEL_ID)
  .catch(() => null);
  
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
