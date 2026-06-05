import { type ChatInputCommandInteraction } from "discord.js";
import { getRuntimeConfig } from "../config/runtime";
import { COMMON_MESSAGES } from "../constants/messages";
import { addImmuneId, getImmuneList, removeImmuneId } from "../data";
import { hasAdminOrDevPermission } from "../utils/permissions";

const runtimeConfig = getRuntimeConfig();
const OWNER_IDS = runtimeConfig.discord.ownerIds;
const IMMUNE_IDS = runtimeConfig.discord.immuneIds;

export async function handleImmune(
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
        content: "BOTはそもそもしばけません。",
        flags: "Ephemeral",
      });
      return;
    }

    const added = addImmuneId(guildId, user.id);
    await interaction.reply({
      content: added
        ? `\`${user.tag}\` を免除リストに追加しました。`
        : `\`${user.tag}\` はすでに免除リストに存在します。`,
      allowedMentions: { parse: [] },
      flags: "Ephemeral",
    });
    return;
  }

  if (subCommand === "remove") {
    const user = interaction.options.getUser("user", true);
    const removed = removeImmuneId(guildId, user.id);
    await interaction.reply({
      content: removed
        ? `\`${user.tag}\` を免除リストから削除しました。`
        : `\`${user.tag}\` は免除リストにありません。`,
      allowedMentions: { parse: [] },
      flags: "Ephemeral",
    });
    return;
  }

  if (subCommand === "list") {
    const localIds = getImmuneList(guildId);
    const globalIds = Array.from(IMMUNE_IDS);

    const localText = localIds.length
      ? localIds.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join("\n")
      : "（なし）";
    const globalText = globalIds.length
      ? globalIds.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join("\n")
      : "（なし）";

    await interaction.reply({
      embeds: [
        {
          title: "🛡️ しばき免除リスト",
          fields: [
            { name: "ギルド免除", value: localText },
            { name: "グローバル免除（.env IMMUNE_IDS）", value: globalText },
          ],
        },
      ],
      allowedMentions: { parse: [] },
      flags: "Ephemeral",
    });
  }
}
