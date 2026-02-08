import { ChannelType, type ChatInputCommandInteraction } from "discord.js";

function isVoiceDestination(channelType: ChannelType): boolean {
  return (
    channelType === ChannelType.GuildVoice ||
    channelType === ChannelType.GuildStageVoice
  );
}

export async function handleSuimin(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "サーバー内で使ってね。",
      ephemeral: true,
    });
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "サーバー情報を取得できませんでした。",
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  const destination = interaction.options.getChannel("channel", true);

  if (!isVoiceDestination(destination.type)) {
    await interaction.reply({
      content: "移動先はボイスチャンネルを指定してください。",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const member = await guild.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    await interaction.editReply({
      content: "指定ユーザーが見つかりませんでした。",
    });
    return;
  }

  if (!member.voice.channelId) {
    await interaction.editReply({
      content: "対象ユーザーはVCに参加していません。",
    });
    return;
  }

  if (member.voice.channelId === destination.id) {
    await interaction.editReply({
      content: "すでにそのVCに参加しています。",
    });
    return;
  }

  try {
    await member.voice.setChannel(destination.id);
    await interaction.editReply({
      content: `✅ ${member.displayName} を <#${destination.id}> に移動しました。`,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("[/suimin] move failed", error);
    await interaction.editReply({
      content: "❌ 移動に失敗しました。権限や接続状況を確認してください。",
    });
  }
}
