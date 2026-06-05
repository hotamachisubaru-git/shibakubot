import { type Client, type Guild } from "discord.js";
import {
  fetchGuild,
  fetchGuildMember,
  fetchVoiceChannel,
} from "./utils.js";

export async function moveUser(
  client: Client,
  guildId: string,
  userId: string,
  channelId: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) return;

  const member = await fetchGuildMember(guild, userId);
  if (!member) return;

  const channel = await fetchVoiceChannel(guild, channelId);
  if (!channel) return;

  await member.voice.setChannel(channel);
  console.log(`✅ ${member.user.tag} を ${channel.name} に移動しました。`);
}

export async function disconnectUser(
  client: Client,
  guildId: string,
  userId: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) return;

  const member = await fetchGuildMember(guild, userId);
  if (!member) return;

  if (!member.voice.channel) {
    console.log("ユーザーはどのVCにも接続していません。");
    return;
  }

  await member.voice.disconnect();
  console.log(`✅ ${member.user.tag} を VC から切断しました。`);
}

export async function timeoutUser(
  client: Client,
  guildId: string,
  userId: string,
  durationMs: number,
  label?: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) return;

  const member = await fetchGuildMember(guild, userId);
  if (!member) return;

  if (durationMs <= 0) {
    await member.timeout(null, "コンソールコマンドによるタイムアウト解除");
    console.log(`✅ ${member.user.tag} のタイムアウトを解除しました。`);
    return;
  }

  await member.timeout(durationMs, "コンソールコマンドによるタイムアウト");
  const humanDuration = label ?? `${durationMs / 1_000}秒`;
  console.log(`✅ ${member.user.tag} を ${humanDuration} タイムアウトしました。`);
}

export async function serverUserMute(
  client: Client,
  guildId: string,
  userId: string,
  durationMs: number,
  label?: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) return;

  const member = await fetchGuildMember(guild, userId);
  if (!member) return;

  if (!member.voice.channel) {
    console.log("ユーザーはどのVCにも接続していません。");
    return;
  }

  try {
    await member.voice.setMute(true, "コンソールコマンドによるサーバーミュート");
    const humanDuration = label ?? `${durationMs / 1_000}秒`;
    console.log(
      `✅ ${member.user.tag} を ${humanDuration} サーバーミュートしました。`,
    );

    if (durationMs > 0) {
      setTimeout(() => {
        void autoUnmuteUser(guild, userId);
      }, durationMs);
    }
  } catch (error) {
    console.error("サーバーミュートに失敗しました:", error);
  }
}

export async function autoUnmuteUser(guild: Guild, userId: string): Promise<void> {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || !member.voice.channel) return;

    await member.voice.setMute(false, "サーバーミュートの自動解除");
    console.log(`✅ ${member.user.tag} のサーバーミュートを解除しました。`);
  } catch (error) {
    console.error("自動解除でエラー:", error);
  }
}

export async function moveAll(
  client: Client,
  guildId: string,
  targetChannelId: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) return;

  const targetChannel = await fetchVoiceChannel(guild, targetChannelId);
  if (!targetChannel) return;

  let movedCount = 0;
  for (const voiceState of guild.voiceStates.cache.values()) {
    const member = voiceState.member;
    if (!member || member.user.bot) continue;

    try {
      await member.voice.setChannel(targetChannel);
      movedCount += 1;
    } catch (error) {
      console.error(`移動失敗: ${member.user.tag}`, error);
    }
  }

  console.log(`✅ ${movedCount}人を ${targetChannel.name} に移動しました。`);
}

export async function disconnectAll(client: Client, guildId: string): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) return;

  let disconnectedCount = 0;
  for (const voiceState of guild.voiceStates.cache.values()) {
    const member = voiceState.member;
    if (!member || member.user.bot) continue;

    try {
      await member.voice.disconnect();
      disconnectedCount += 1;
    } catch (error) {
      console.error(`切断失敗: ${member.user.tag}`, error);
    }
  }

  console.log(`✅ ${disconnectedCount}人を VC から切断しました。`);
}

export async function muteAll(
  client: Client,
  guildId: string,
  durationMs: number,
  label?: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) return;

  let mutedCount = 0;
  for (const voiceState of guild.voiceStates.cache.values()) {
    const member = voiceState.member;
    if (!member || member.user.bot) continue;

    try {
      await member.voice.setMute(
        true,
        "コンソールコマンドによる一括サーバーミュート",
      );
      mutedCount += 1;
    } catch (error) {
      console.error(`ミュート失敗: ${member.user.tag}`, error);
    }
  }

  const humanDuration = label ?? `${durationMs / 1_000}秒`;
  console.log(`✅ ${mutedCount}人を ${humanDuration} サーバーミュートしました。`);

  if (durationMs > 0) {
    setTimeout(() => {
      void autoUnmuteAll(guild);
    }, durationMs);
  }
}

export async function autoUnmuteAll(guild: Guild): Promise<void> {
  try {
    let unmutedCount = 0;
    for (const voiceState of guild.voiceStates.cache.values()) {
      const member = voiceState.member;
      if (!member || member.user.bot || !member.voice.serverMute) continue;

      try {
        await member.voice.setMute(false, "一括サーバーミュートの自動解除");
        unmutedCount += 1;
      } catch (error) {
        console.error(`自動解除失敗: ${member.user.tag}`, error);
      }
    }

    console.log(`✅ 一括サーバーミュートを解除しました。（${unmutedCount}人）`);
  } catch (error) {
    console.error("一括自動解除でエラー:", error);
  }
}

export async function unmuteUser(
  client: Client,
  guildId: string,
  userId: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) return;

  const member = await fetchGuildMember(guild, userId);
  if (!member) return;

  if (!member.voice.channel) {
    console.log("ユーザーはどのVCにも接続していません。");
    return;
  }

  await member.voice.setMute(false, "コンソールコマンドによるサーバーミュート解除");
  console.log(`✅ ${member.user.tag} のサーバーミュートを解除しました。`);
}

export async function addRoleToUser(
  client: Client,
  guildId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) return;

  const member = await fetchGuildMember(guild, userId);
  if (!member) return;

  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    console.log("ロールが見つかりません。");
    return;
  }

  if (member.roles.cache.has(role.id)) {
    console.log(`${member.user.tag} はすでにロール ${role.name} を持っています。`);
    return;
  }

  await member.roles.add(role, "コンソールコマンドによるロール付与");
  console.log(`✅ ${member.user.tag} にロール ${role.name} を付与しました。`);
}

export async function deleteMessage(
  client: Client,
  channelId: string,
  messageId: string,
): Promise<void> {
  if (!client.isReady()) {
    console.log("クライアントの起動完了前です。ログイン完了後に再実行してください。");
    return;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("messages" in channel)) {
    console.log("指定されたチャンネルIDはテキストチャンネルではありません。");
    return;
  }

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) {
    console.log("メッセージが見つかりません。");
    return;
  }

  if (!message.deletable) {
    console.log("メッセージを削除できません。（権限不足の可能性）");
    return;
  }

  await message.delete();
  console.log(`✅ メッセージを削除しました。 id=${message.id}`);
}
