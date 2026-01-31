import { ChatInputCommandInteraction } from "discord.js";
import {
  addEnglishBanExemptGuild,
  getEnglishBanExemptGuilds,
  removeEnglishBanExemptGuild,
} from "../data";

const OWNER_IDS = (process.env.OWNER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function formatList(list: string[]) {
  if (!list.length) return "（なし）";
  return list.map((x, i) => `${i + 1}. ${x}`).join("\n");
}

export async function handleEnglishExempt(
  interaction: ChatInputCommandInteraction,
) {
  const isDev = OWNER_IDS.includes(interaction.user.id);
  if (!isDev) {
    await interaction.reply({
      content: "⚠️ このコマンドは開発者のみ利用できます。",
      ephemeral: true,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "list") {
    const list = getEnglishBanExemptGuilds();
    await interaction.reply({
      content: `英語禁止 免除ギルド一覧:\n${formatList(list)}`,
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.options.getString("guild", true).trim();
  if (!/^\d{17,20}$/.test(guildId)) {
    await interaction.reply({
      content: "⚠️ guild は 17〜20桁のIDを指定してください。",
      ephemeral: true,
    });
    return;
  }

  if (sub === "add") {
    const result = addEnglishBanExemptGuild(guildId);
    await interaction.reply({
      content: result.added
        ? `✅ 免除ギルドを追加しました: ${guildId}`
        : `⚠️ すでに免除登録済みです: ${guildId}`,
      ephemeral: true,
    });
    return;
  }

  if (sub === "remove") {
    const result = removeEnglishBanExemptGuild(guildId);
    await interaction.reply({
      content: result.removed
        ? `✅ 免除ギルドを削除しました: ${guildId}`
        : `⚠️ 免除ギルドにありません: ${guildId}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: "⚠️ 不明なサブコマンドです。",
    ephemeral: true,
  });
}
