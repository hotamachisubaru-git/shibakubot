import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

export async function handleHelp(interaction: ChatInputCommandInteraction) {
  const commands = [
    { name: "/ping", desc: "BOTが生きているか確認します" },
    { name: "/sbk", desc: "指定したユーザーをしばきます（理由と回数指定可）" },
    { name: "/check", desc: "指定ユーザーのしばかれ回数を確認します" },
    { name: "/top", desc: "しばかれランキングを表示します（ページ切替可能）" },
    {
      name: "/members",
      desc: "全メンバーのしばかれ回数一覧を表示（CSV出力付き）",
    },
    { name: "/control", desc: "特定ユーザーの回数を直接設定（管理者専用）" },
    { name: "/immune", desc: "しばき免除ユーザーを管理（管理者専用）" },
    { name: "/room", desc: "本日のルーム情報を投稿します" },
    { name: "/help", desc: "コマンド一覧を表示します" },
    { name: "/stats", desc: "全体統計を確認します（管理者専用）" },
    { name: "/menu", desc: "クイック操作メニューを開きます" }, // ★ menu を追加
    { name: "/suimin", desc: "指定ユーザーをVCへ移動（権限必須）" },
    { name: "/english", desc: "英語禁止モードを切り替えます（管理者専用）" },
  ];

  const lines = commands.map((c) => `• **${c.name}** — ${c.desc}`).join("\n");

  const embed = new EmbedBuilder()
    .setTitle("📘 コマンド一覧")
    .setDescription(lines)
    .setFooter({ text: "しばくbot - コマンドヘルプ" })
    .setColor(0x00aaff);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
