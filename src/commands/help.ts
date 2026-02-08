import { type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

type HelpCommand = Readonly<{
  name: string;
  description: string;
}>;

const HELP_COMMANDS = [
  { name: "/ping", description: "BOTが生きているか確認する" },
  { name: "/sbk", description: "ユーザーをしばく" },
  { name: "/menu", description: "しばくbot メニューを表示する" },
  { name: "/help", description: "コマンド一覧を表示する" },
  { name: "/suimin", description: "指定ユーザーをVCに移動" },
  {
    name: "/maintenance",
    description: "メンテナンスモードを切り替える（管理者のみ）",
  },
  {
    name: "/mt",
    description: "メンテナンスモードを切り替える（短縮コマンド）",
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
