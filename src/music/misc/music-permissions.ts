import { Message, PermissionFlagsBits } from "discord.js";
import { hasAdminGuildOwnerOrDevPermission } from "../../utils/permissions";
import { OWNER_IDS } from "./constants";

export type MusicVoiceAccess = Readonly<{
  allowed: boolean;
  message?: string;
}>;

export function canManageMusic(message: Message): boolean {
  return hasAdminGuildOwnerOrDevPermission(
    {
      memberPermissions: message.member?.permissions ?? null,
      user: message.author,
      guild: message.guild,
    },
    OWNER_IDS,
  );
}

export function getMusicVoiceAccess(
  userVoiceChannelId: string | null | undefined,
  botVoiceChannelId: string | null | undefined,
): MusicVoiceAccess {
  if (!botVoiceChannelId) return { allowed: true };
  if (!userVoiceChannelId) {
    return {
      allowed: false,
      message: "⚠️ 音楽を操作するには、Botと同じボイスチャンネルに参加してください。",
    };
  }
  if (userVoiceChannelId !== botVoiceChannelId) {
    return {
      allowed: false,
      message: "⚠️ 別のボイスチャンネルからは音楽を操作できません。Botと同じVCに参加してください。",
    };
  }
  return { allowed: true };
}

export async function requireSameMusicVoiceChannel(
  message: Message,
  botVoiceChannelId: string | null | undefined,
): Promise<boolean> {
  const access = getMusicVoiceAccess(
    message.member?.voice.channelId,
    botVoiceChannelId,
  );
  if (access.allowed) return true;
  await message.reply(access.message ?? "⚠️ Botと同じVCに参加してください。");
  return false;
}
