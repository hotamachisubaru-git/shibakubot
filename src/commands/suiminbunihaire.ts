import {
  ChannelType,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";

const OWNER_IDS = (process.env.OWNER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export async function handleSuimin(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "サーバー内で使ってね。",
      ephemeral: true,
    });
    return;
  }

  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
    false;
  const canMove =
    interaction.memberPermissions?.has(PermissionFlagsBits.MoveMembers) ??
    false;
  const isDev = OWNER_IDS.includes(interaction.user.id);
  if (!isAdmin && !canMove && !isDev) {
    await interaction.reply({
      content: "⚠️ VC移動は管理者/MoveMembers権限/開発者のみ使えます。",
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  const dest = interaction.options.getChannel("channel", true);

  if (
    dest.type !== ChannelType.GuildVoice &&
    dest.type !== ChannelType.GuildStageVoice
  ) {
    await interaction.reply({
      content: "移動先はボイスチャンネルを指定してください。",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const member = await interaction.guild!.members
    .fetch(targetUser.id)
    .catch(() => null);
  if (!member) {
    await interaction.editReply({
      content: "指定ユーザーが見つかりませんでした。",
    });
    return;
  }

  if (!member.voice?.channelId) {
    await interaction.editReply({
      content: "対象ユーザーはVCに参加していません。",
    });
    return;
  }

  if (member.voice.channelId === dest.id) {
    await interaction.editReply({
      content: "すでにそのVCに参加しています。",
    });
    return;
  }

  try {
    await member.voice.setChannel(dest.id);
    await interaction.editReply({
      content: `✅ ${member.displayName} を <#${dest.id}> に移動しました。`,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error("[/suimin] move failed", err);
    await interaction.editReply({
      content: "❌ 移動に失敗しました。権限や接続状況を確認してください。",
    });
  }
}
