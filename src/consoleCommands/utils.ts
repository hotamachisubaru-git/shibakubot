import {
  ChannelType,
  type Client,
  type Guild,
  type GuildMember,
  type Role,
  type VoiceBasedChannel,
} from "discord.js";

export function parseDuration(input: string): number | null {
  const match = input.trim().toLowerCase().match(/^(\d+)(s|m|h)?$/);
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  switch (match[2] ?? "s") {
    case "s":
      return value * 1_000;
    case "m":
      return value * 60 * 1_000;
    case "h":
      return value * 60 * 60 * 1_000;
    default:
      return null;
  }
}

export async function fetchGuild(
  client: Client,
  guildId: string,
): Promise<Guild | null> {
  if (!client.isReady()) {
    console.log("クライアントの起動完了前です。ログイン完了後に再実行してください。");
    return null;
  }

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.log("ギルドが見つかりません。");
    return null;
  }

  return guild;
}

export async function fetchGuildMember(
  guild: Guild,
  userId: string,
): Promise<GuildMember | null> {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    console.log("ユーザーが見つかりません。");
    return null;
  }

  return member;
}

export async function fetchVoiceChannel(
  guild: Guild,
  channelId: string,
): Promise<VoiceBasedChannel | null> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildVoice &&
      channel.type !== ChannelType.GuildStageVoice)
  ) {
    console.log("指定されたチャンネルIDはVCではありません。");
    return null;
  }

  return channel;
}

export async function fetchRole(guild: Guild, roleId: string): Promise<Role | null> {
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    console.log("ロールが見つかりません。");
    return null;
  }

  return role;
}
