import { type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { EMBED_COLORS } from "../constants/embedColors";
import { HELP_COMMANDS, type HelpCommand } from "../discord/commandCatalog";

const HELP_TITLE = "📘 コマンド一覧";
const HELP_FOOTER = "しばくbot - コマンドヘルプ";
const HELP_COLOR = EMBED_COLORS.info;

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
