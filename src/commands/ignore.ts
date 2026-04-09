import { type ChatInputCommandInteraction } from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { COMMON_MESSAGES } from "../constants/messages";
import {
  addIgnoredUserId,
  getIgnoredUserList,
  removeIgnoredUserId,
} from "../data";
import { hasAdminOrDevPermission } from "../utils/permissions";

const runtimeConfig = getRuntimeConfig();
const OWNER_IDS = runtimeConfig.discord.ownerIds;

export async function handleIgnore(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildOnly,
      flags: "Ephemeral",
    });
    return;
  }

  if (!hasAdminOrDevPermission(interaction, OWNER_IDS)) {
    await interaction.reply({
      content: COMMON_MESSAGES.noPermissionAdminOrDev,
      flags: "Ephemeral",
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildUnavailable,
      flags: "Ephemeral",
    });
    return;
  }

  const subCommand = interaction.options.getSubcommand();

  if (subCommand === "add") {
    const user = interaction.options.getUser("user", true);
    if (user.bot) {
      await interaction.reply({
        content: COMMON_MESSAGES.botTargetExcluded,
        flags: "Ephemeral",
      });
      return;
    }

    if (user.id === interaction.user.id) {
      await interaction.reply({
        content: "自分自身は ignore できません。",
        flags: "Ephemeral",
      });
      return;
    }

    const added = addIgnoredUserId(guildId, user.id);
    await interaction.reply({
      content: added
        ? `\`${user.tag}\` を ignore 対象に追加しました。以後このユーザーのメッセージとコマンドは bot が自動で無視します。`
        : `\`${user.tag}\` はすでに ignore 対象です。`,
      allowedMentions: { parse: [] },
      flags: "Ephemeral",
    });
    return;
  }

  if (subCommand === "remove") {
    const user = interaction.options.getUser("user", true);
    const removed = removeIgnoredUserId(guildId, user.id);
    await interaction.reply({
      content: removed
        ? `\`${user.tag}\` を ignore 対象から解除しました。`
        : `\`${user.tag}\` は ignore 対象ではありません。`,
      allowedMentions: { parse: [] },
      flags: "Ephemeral",
    });
    return;
  }

  if (subCommand === "list") {
    const ignoredIds = getIgnoredUserList(guildId);
    const description = ignoredIds.length
      ? ignoredIds.map((id, index) => `${index + 1}. <@${id}> (\`${id}\`)`).join("\n")
      : "（なし）";

    await interaction.reply({
      embeds: [
        {
          title: "🙈 ignore 一覧",
          description,
        },
      ],
      allowedMentions: { parse: [] },
      flags: "Ephemeral",
    });
  }
}
