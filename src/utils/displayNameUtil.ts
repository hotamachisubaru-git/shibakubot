import type { BaseInteraction } from "discord.js";
import { fetchGuildMemberOrNull, fetchUserOrNull } from "./discordErrors";

export type AnyInteraction = Pick<BaseInteraction, "guild" | "guildId" | "client">;

async function tryFetchGuildDisplayName(
  interaction: AnyInteraction,
  userId: string,
): Promise<string | null> {
  const guild = interaction.guild;
  if (!guild) return null;

  const cachedMember = guild.members.cache.get(userId);
  if (cachedMember?.displayName) {
    return cachedMember.displayName;
  }

  const member = await fetchGuildMemberOrNull(guild, userId).catch((error: unknown) => {
    console.warn("[display-name] failed to fetch member; falling back to user tag", {
      guildId: guild.id, userId,
    }, error);
    return null;
  });
  return member?.displayName ?? null;
}

async function tryFetchUserTag(
  interaction: AnyInteraction,
  userId: string,
): Promise<string | null> {
  const cachedUser = interaction.client.users.cache.get(userId);
  if (cachedUser?.tag) {
    return cachedUser.tag;
  }

  const user = await fetchUserOrNull(interaction.client, userId).catch((error: unknown) => {
    console.warn("[display-name] failed to fetch user; falling back to user ID", {
      guildId: interaction.guildId, userId,
    }, error);
    return null;
  });
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
