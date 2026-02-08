// src/commands/reset.ts
import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { loadGuildStore } from "../data";

const OWNER_IDS = new Set(
  (process.env.OWNER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is string => value.length > 0),
);

function canReset(interaction: ChatInputCommandInteraction): boolean {
  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
    false;
  const isOwner = OWNER_IDS.has(interaction.user.id);
  return isAdmin || isOwner;
}

export async function handleReset(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "このコマンドはサーバー内でのみ使用できます。",
      ephemeral: true,
    });
    return;
  }

  if (!canReset(interaction)) {
    await interaction.reply({
      content: "権限がありません（管理者/オーナーのみ）。",
      ephemeral: true,
    });
    return;
  }

  const guild = interaction.guild;
  const guildId = interaction.guildId;
  if (!guild || !guildId) {
    await interaction.reply({
      content: "サーバー情報を取得できませんでした。",
      ephemeral: true,
    });
    return;
  }

  const resetAll = interaction.options.getBoolean("all") ?? false;
  const target = interaction.options.getUser("user");
  const store = loadGuildStore(guildId);

  if (resetAll) {
    store.counts = {};

    await interaction.reply({
      content: "全員のしばき回数を0にリセットしました。",
      ephemeral: true,
    });
    return;
  }

  if (target) {
    store.counts[target.id] = 0n;

    const member = await guild.members.fetch(target.id).catch(() => null);
    const display = member?.displayName ?? target.tag;
    await interaction.reply({
      content: `**${display}** のしばき回数を0にリセットしました。`,
      allowedMentions: { parse: [] },
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: "リセット対象（`all: true` または `user`）を指定してください。",
    ephemeral: true,
  });
}
