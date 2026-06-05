import { createInterface } from "node:readline";
import {
  ChannelType,
  Client,
  Guild,
  GuildMember,
  Role,
  type VoiceBasedChannel,
} from "discord.js";

const DURATION_ERROR_MESSAGE =
  "duration は 例: 10s, 5m, 2h, 300 (秒) の形式で指定してください。";

const CONSOLE_COMMAND_LINES = [
  "コンソールコマンド:",
  "ID は Discord の開発者モードでコピーしたサーバーID / ユーザーID / チャンネルID / ロールIDを使ってください。",
  "",
  "  move <guildId> <userId> <voiceChannelId>",
  "    指定ユーザーを指定VCへ移動します。",
  "    例: move 111111111111111111 222222222222222222 333333333333333333",
  "",
  "  disconnect <guildId> <userId>",
  "    指定ユーザーをVCから切断します。",
  "    例: disconnect 111111111111111111 222222222222222222",
  "",
  "  timeout <guildId> <userId> <時間>",
  "    指定ユーザーをタイムアウトします。0s を指定すると解除します。",
  "    例: timeout 111111111111111111 222222222222222222 10m",
  "",
  "  serverMute <guildId> <userId> <時間>",
  "    指定ユーザーをサーバーミュートし、時間後に自動解除します。",
  "    例: serverMute 111111111111111111 222222222222222222 1h",
  "",
  "  moveAll <guildId> <voiceChannelId>",
  "    ギルド内でVCにいる全員を指定VCへ移動します。",
  "    例: moveAll 111111111111111111 333333333333333333",
  "",
  "  disconnectAll <guildId>",
  "    ギルド内でVCにいる全員を切断します。",
  "    例: disconnectAll 111111111111111111",
  "",
  "  muteAll <guildId> <時間>",
  "    ギルド内でVCにいる全員をサーバーミュートし、時間後に自動解除します。",
  "    例: muteAll 111111111111111111 15m",
  "",
  "  unmute <guildId> <userId>",
  "    指定ユーザーのサーバーミュートをすぐ解除します。",
  "    例: unmute 111111111111111111 222222222222222222",
  "",
  "  addrole <guildId> <userId> <roleId>",
  "    指定ユーザーにロールを付与します。",
  "    例: addrole 111111111111111111 222222222222222222 444444444444444444",
  "",
  "  delmsg <channelId> <messageId>",
  "    指定チャンネル内のメッセージを1件削除します。",
  "    例: delmsg 555555555555555555 666666666666666666",
  "",
  "時間の書式: 10s = 10秒 / 5m = 5分 / 2h = 2時間 / 300 = 300秒",
  "help と入力するとコマンド一覧を表示します。",
  "------------------------------",
] as const;

let isConsoleCommandRegistered = false;

function printConsoleCommandHelp(): void {
  for (const line of CONSOLE_COMMAND_LINES) {
    console.log(line);
  }
}

function parseDuration(input: string): number | null {
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

async function fetchGuild(
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

async function fetchGuildMember(
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

async function fetchVoiceChannel(
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

async function moveUser(
  client: Client,
  guildId: string,
  userId: string,
  channelId: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) {
    return;
  }

  const member = await fetchGuildMember(guild, userId);
  if (!member) {
    return;
  }

  const channel = await fetchVoiceChannel(guild, channelId);
  if (!channel) {
    return;
  }

  await member.voice.setChannel(channel);
  console.log(`✅ ${member.user.tag} を ${channel.name} に移動しました。`);
}

async function disconnectUser(
  client: Client,
  guildId: string,
  userId: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) {
    return;
  }

  const member = await fetchGuildMember(guild, userId);
  if (!member) {
    return;
  }

  if (!member.voice.channel) {
    console.log("ユーザーはどのVCにも接続していません。");
    return;
  }

  await member.voice.disconnect();
  console.log(`✅ ${member.user.tag} を VC から切断しました。`);
}

async function timeoutUser(
  client: Client,
  guildId: string,
  userId: string,
  durationMs: number,
  label?: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) {
    return;
  }

  const member = await fetchGuildMember(guild, userId);
  if (!member) {
    return;
  }

  if (durationMs <= 0) {
    await member.timeout(null, "コンソールコマンドによるタイムアウト解除");
    console.log(`✅ ${member.user.tag} のタイムアウトを解除しました。`);
    return;
  }

  await member.timeout(durationMs, "コンソールコマンドによるタイムアウト");
  const humanDuration = label ?? `${durationMs / 1_000}秒`;
  console.log(`✅ ${member.user.tag} を ${humanDuration} タイムアウトしました。`);
}

async function serverUserMute(
  client: Client,
  guildId: string,
  userId: string,
  durationMs: number,
  label?: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) {
    return;
  }

  const member = await fetchGuildMember(guild, userId);
  if (!member) {
    return;
  }

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

async function autoUnmuteUser(guild: Guild, userId: string): Promise<void> {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || !member.voice.channel) {
      return;
    }

    await member.voice.setMute(false, "サーバーミュートの自動解除");
    console.log(`✅ ${member.user.tag} のサーバーミュートを解除しました。`);
  } catch (error) {
    console.error("自動解除でエラー:", error);
  }
}

async function moveAll(
  client: Client,
  guildId: string,
  targetChannelId: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) {
    return;
  }

  const targetChannel = await fetchVoiceChannel(guild, targetChannelId);
  if (!targetChannel) {
    return;
  }

  let movedCount = 0;
  for (const voiceState of guild.voiceStates.cache.values()) {
    const member = voiceState.member;
    if (!member || member.user.bot) {
      continue;
    }

    try {
      await member.voice.setChannel(targetChannel);
      movedCount += 1;
    } catch (error) {
      console.error(`移動失敗: ${member.user.tag}`, error);
    }
  }

  console.log(`✅ ${movedCount}人を ${targetChannel.name} に移動しました。`);
}

async function disconnectAll(client: Client, guildId: string): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) {
    return;
  }

  let disconnectedCount = 0;
  for (const voiceState of guild.voiceStates.cache.values()) {
    const member = voiceState.member;
    if (!member || member.user.bot) {
      continue;
    }

    try {
      await member.voice.disconnect();
      disconnectedCount += 1;
    } catch (error) {
      console.error(`切断失敗: ${member.user.tag}`, error);
    }
  }

  console.log(`✅ ${disconnectedCount}人を VC から切断しました。`);
}

async function muteAll(
  client: Client,
  guildId: string,
  durationMs: number,
  label?: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) {
    return;
  }

  let mutedCount = 0;
  for (const voiceState of guild.voiceStates.cache.values()) {
    const member = voiceState.member;
    if (!member || member.user.bot) {
      continue;
    }

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

async function autoUnmuteAll(guild: Guild): Promise<void> {
  try {
    let unmutedCount = 0;
    for (const voiceState of guild.voiceStates.cache.values()) {
      const member = voiceState.member;
      if (!member || member.user.bot || !member.voice.serverMute) {
        continue;
      }

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

async function unmuteUser(
  client: Client,
  guildId: string,
  userId: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) {
    return;
  }

  const member = await fetchGuildMember(guild, userId);
  if (!member) {
    return;
  }

  if (!member.voice.channel) {
    console.log("ユーザーはどのVCにも接続していません。");
    return;
  }

  await member.voice.setMute(false, "コンソールコマンドによるサーバーミュート解除");
  console.log(`✅ ${member.user.tag} のサーバーミュートを解除しました。`);
}

async function fetchRole(guild: Guild, roleId: string): Promise<Role | null> {
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    console.log("ロールが見つかりません。");
    return null;
  }

  return role;
}

async function addRoleToUser(
  client: Client,
  guildId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  const guild = await fetchGuild(client, guildId);
  if (!guild) {
    return;
  }

  const member = await fetchGuildMember(guild, userId);
  if (!member) {
    return;
  }

  const role = await fetchRole(guild, roleId);
  if (!role) {
    return;
  }

  if (member.roles.cache.has(role.id)) {
    console.log(`${member.user.tag} はすでにロール ${role.name} を持っています。`);
    return;
  }

  await member.roles.add(role, "コンソールコマンドによるロール付与");
  console.log(`✅ ${member.user.tag} にロール ${role.name} を付与しました。`);
}

async function deleteMessage(
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

async function executeConsoleCommand(
  client: Client,
  input: string,
): Promise<void> {
  const args = input.trim().split(/\s+/);
  const command = args[0]?.toLowerCase();

  if (!command) {
    return;
  }

  if (command === "help") {
    printConsoleCommandHelp();
    return;
  }

  if (command === "move" && args.length === 4) {
    await moveUser(client, args[1], args[2], args[3]);
    return;
  }

  if (command === "disconnect" && args.length === 3) {
    await disconnectUser(client, args[1], args[2]);
    return;
  }

  if (command === "timeout" && args.length === 4) {
    const rawDuration = args[3];
    const durationMs = parseDuration(rawDuration);
    if (durationMs === null) {
      console.log(DURATION_ERROR_MESSAGE);
      return;
    }

    await timeoutUser(client, args[1], args[2], durationMs, rawDuration);
    return;
  }

  if (command === "servermute" && args.length === 4) {
    const rawDuration = args[3];
    const durationMs = parseDuration(rawDuration);
    if (durationMs === null) {
      console.log(DURATION_ERROR_MESSAGE);
      return;
    }

    await serverUserMute(client, args[1], args[2], durationMs, rawDuration);
    return;
  }

  if (command === "moveall" && args.length === 3) {
    await moveAll(client, args[1], args[2]);
    return;
  }

  if (command === "disconnectall" && args.length === 2) {
    await disconnectAll(client, args[1]);
    return;
  }

  if (command === "muteall" && args.length === 3) {
    const rawDuration = args[2];
    const durationMs = parseDuration(rawDuration);
    if (durationMs === null) {
      console.log(DURATION_ERROR_MESSAGE);
      return;
    }

    await muteAll(client, args[1], durationMs, rawDuration);
    return;
  }

  if (command === "unmute" && args.length === 3) {
    await unmuteUser(client, args[1], args[2]);
    return;
  }

  if (command === "addrole" && args.length === 4) {
    await addRoleToUser(client, args[1], args[2], args[3]);
    return;
  }

  if (command === "delmsg" && args.length === 3) {
    await deleteMessage(client, args[1], args[2]);
    return;
  }

  console.log("不明なコマンドです。help で一覧を確認できます。");
}

export function registerConsoleCommands(client: Client): void {
  if (isConsoleCommandRegistered) {
    return;
  }

  isConsoleCommandRegistered = true;
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  printConsoleCommandHelp();

  readline.on("line", (input) => {
    void executeConsoleCommand(client, input).catch((error) => {
      console.error("エラーが発生しました:", error);
    });
  });
}
