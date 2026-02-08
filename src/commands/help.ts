import { type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

type HelpCommand = Readonly<{
  name: string;
  description: string;
}>;

const HELP_COMMANDS = [
  { name: "/ping", description: "BOTが生きているか確認します" },
  {
    name: "/sbk",
    description: "指定したユーザーをしばきます（理由と回数指定可）",
  },
  { name: "/check", description: "指定ユーザーのしばかれ回数を確認します" },
  {
    name: "/top",
    description: "しばかれランキングを表示します（ページ切替可能）",
  },
  {
    name: "/members",
    description: "全メンバーのしばかれ回数一覧を表示（CSV出力付き）",
  },
  {
    name: "/control",
    description: "特定ユーザーの回数を直接設定（管理者専用）",
  },
  { name: "/immune", description: "しばき免除ユーザーを管理（管理者専用）" },
  { name: "/room", description: "本日のルーム情報を投稿します" },
  { name: "/help", description: "コマンド一覧を表示します" },
  { name: "/stats", description: "全体統計を確認します（管理者専用）" },
  { name: "/menu", description: "クイック操作メニューを開きます" },
  { name: "/suimin", description: "指定ユーザーをVCへ移動（権限必須）" },
  {
    name: "/maintenance (/mt)",
    description: "メンテナンスモードを切り替えます（管理者専用）",
  },
] satisfies readonly HelpCommand[];

const HELP_TITLE = "📘 コマンド一覧";
const HELP_FOOTER = "しばくbot - コマンドヘルプ";
const HELP_COLOR = 0x00aaff;

function renderHelpLines(commands: readonly HelpCommand[]): string {
  return commands
    .map(({ name, description }) => `• **${name}** — ${description}`)
    .join("\n");
}

export async function handleHelp(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle(HELP_TITLE)
    .setDescription(renderHelpLines(HELP_COMMANDS))
    .setFooter({ text: HELP_FOOTER })
    .setColor(HELP_COLOR);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
