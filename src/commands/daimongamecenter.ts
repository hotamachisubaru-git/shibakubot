import {
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';

export async function handleRoom(interaction: ChatInputCommandInteraction) {
  // 念のためサーバー内限定
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'サーバー内で使ってね。', ephemeral: true });
    return;
  }

  // 入力値取得
  const game = interaction.options.getString('game', true);
  const area = interaction.options.getInteger('area', true);
  const password = interaction.options.getString('pass', true); // ★ コマンド定義に合わせて 'password' から 'pass' に変更が必要かもしれません

  // 表示文言を作成
  const text = `本日は**${game}**の**${area}**で、**${password}**で入れます。`;

  // 送信用のきれいなEmbed
  const embed = new EmbedBuilder()
    .setTitle('🎮 本日のルーム案内')
    .setDescription(text)
    .setFooter({ text: new Date().toLocaleString('ja-JP') });

  // 公開でチャンネルに投稿（メンション抑止）
  await interaction.reply({
    embeds: [embed],
    allowedMentions: { parse: [] },
  });
}