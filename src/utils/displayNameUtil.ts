import type { BaseInteraction } from "discord.js";

export type AnyInteraction = Pick<BaseInteraction, "guild" | "guildId" | "client">;

async function tryFetchGuildDisplayName(
  interaction: AnyInteraction,
  userId: string,
): Promise<string | null> {
  const guild = interaction.guild;
  if (!guild) return null;

  const member = await guild.members.fetch(userId).catch(() => null);
  return member?.displayName ?? null;
}

async function tryFetchUserTag(
  interaction: AnyInteraction,
  userId: string,
): Promise<string | null> {
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  return user?.tag ?? null;
}

/**
 * ギルドに居ればニックネーム、いなければユーザータグを返す。
 */
export async function displayNameFrom(
  interaction: AnyInteraction,
  userId: string,
): Promise<string> {
  const guildDisplayName = await tryFetchGuildDisplayName(interaction, userId);
  if (guildDisplayName) return guildDisplayName;

  const userTag = await tryFetchUserTag(interaction, userId);
  return userTag ?? userId;
}
