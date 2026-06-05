// src/commands/top.ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getCountRankingPage, getTrackedUserCount } from "../data";

const PAGE_SIZE = 10;

/** ギルドでは displayName（ニックネーム） → なければ user.tag → 最後にID */
async function resolveDisplayName(
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<string> {
  const g = interaction.guild;
  if (g) {
    const cachedMember = g.members.cache.get(userId);
    if (cachedMember?.displayName) return cachedMember.displayName;

    const m = await g.members.fetch(userId).catch(() => null);
    if (m?.displayName) return m.displayName;
  }

  const cachedUser = interaction.client.users.cache.get(userId);
  if (cachedUser?.tag) return cachedUser.tag;

  const u = await interaction.client.users.fetch(userId).catch(() => null);
  return u?.tag ?? userId;
}

/** 指定ページの埋め込みを作る（0-based page） */
async function buildPageEmbed(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  totalEntries: number,
  page: number,
): Promise<EmbedBuilder> {
  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const slice = getCountRankingPage(guildId, start, PAGE_SIZE);

  const lines = await Promise.all(
    slice.map(async ([userId, count], i) => {
      const rank = start + i + 1;
      const name = await resolveDisplayName(interaction, userId);
      return `#${rank} ${name} × **${count.toString()}**`;
    }),
  );

  return new EmbedBuilder()
    .setTitle("🏆 しばきランキング")
    .setDescription(lines.join("\n") || "まだ誰も しばかれていません。")
    .setFooter({
      text: `ページ ${page + 1}/${totalPages} • ${new Date().toLocaleString("ja-JP")}`,
    });
}

/** ページボタンの行を作る */
function buildNavRow(
  page: number,
  totalPages: number,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("top_prev")
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("top_next")
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages - 1 || totalPages <= 1),
  );
}

export async function handleTop(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "サーバー内で使ってね。",
      flags: "Ephemeral",
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "サーバー情報を取得できませんでした。",
      flags: "Ephemeral",
    });
    return;
  }

  await interaction.deferReply();

  const totalEntries = getTrackedUserCount(guildId);

  if (totalEntries === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏆 しばきランキング")
          .setDescription("まだ誰も しばかれていません。"),
      ],
    });
    return;
  }

  let page = 0;
  const totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));

  const embed = await buildPageEmbed(interaction, guildId, totalEntries, page);
  const row = buildNavRow(page, totalPages);

  // 一部の環境で InteractionReply の components が取得できないエラーを避けるため、reply → fetchReply の二段
  await interaction.editReply({
    embeds: [embed],
    components: [row],
    allowedMentions: { parse: [] },
  });
  const message = await interaction.fetchReply();

  // ボタン収集
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i) => i.user.id === interaction.user.id,
  });

  collector.on("collect", async (btn) => {
    // ❶ まずACK（これが超重要）。Unknown interaction対策
    try {
      await btn.deferUpdate();
    } catch {
      // 既に ACK 済みなら無視
    }

    // ❷ ページ更新
    const dir = btn.customId === "top_prev" ? -1 : 1;
    page = Math.max(0, Math.min(page + dir, totalPages - 1));

    // ❸ メッセージ編集（Interaction.update は使わない）
    const newEmbed = await buildPageEmbed(interaction, guildId, totalEntries, page);
    await message.edit({
      embeds: [newEmbed],
      components: [buildNavRow(page, totalPages)],
      allowedMentions: { parse: [] },
    });
  });

  collector.on("end", async () => {
    // タイムアウトでボタン無効化
    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("top_prev")
        .setLabel("◀")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("top_next")
        .setLabel("▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
    // メッセージの編集は、fetchReply が成功している前提で msg.edit を使う
    await message.edit({ components: [disabledRow] }).catch(() => undefined);
  });
}
