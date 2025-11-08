"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTop = handleTop;
// src/commands/top.ts
const discord_js_1 = require("discord.js");
const data_1 = require("../data");
const PAGE_SIZE = 10;
/** ギルドでは displayName（ニックネーム） → なければ user.tag → 最後にID */
async function getDisplayName(interaction, userId) {
    const g = interaction.guild;
    if (g) {
        const m = await g.members.fetch(userId).catch(() => null);
        if (m?.displayName)
            return m.displayName;
    }
    const u = await interaction.client.users.fetch(userId).catch(() => null);
    return u?.tag ?? userId;
}
/** 指定ページの埋め込みを作る（0-based page） */
async function makePageEmbed(interaction, sortedEntries, page) {
    const totalPages = Math.max(1, Math.ceil(sortedEntries.length / PAGE_SIZE));
    const start = page * PAGE_SIZE;
    const slice = sortedEntries.slice(start, start + PAGE_SIZE);
    const lines = await Promise.all(slice.map(async ([userId, count], i) => {
        const rank = start + i + 1;
        const name = await getDisplayName(interaction, userId);
        return `#${rank} ${name} × **${count}**`;
    }));
    return new discord_js_1.EmbedBuilder()
        .setTitle('🏆 しばきランキング')
        .setDescription(lines.join('\n') || 'まだ誰も しばかれていません。')
        .setFooter({
        text: `ページ ${page + 1}/${totalPages} • ${new Date().toLocaleString('ja-JP')}`,
    });
}
/** ページボタンの行を作る */
function makeRow(page, totalPages) {
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId('top_prev')
        .setLabel('◀')
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setDisabled(page === 0), new discord_js_1.ButtonBuilder()
        .setCustomId('top_next')
        .setLabel('▶')
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setDisabled(page === totalPages - 1 || totalPages <= 1));
    return row;
}
async function handleTop(interaction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: 'サーバー内で使ってね。', ephemeral: true });
        return;
    }
    await interaction.deferReply({ ephemeral: false });
    const store = (0, data_1.loadGuildStore)(interaction.guildId);
    const entries = Object.entries(store.counts);
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
        await interaction.editReply({
            embeds: [new discord_js_1.EmbedBuilder().setTitle('🏆 しばきランキング').setDescription('まだ誰も しばかれていません。')],
        });
        return;
    }
    let page = 0;
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const embed = await makePageEmbed(interaction, sorted, page);
    const row = makeRow(page, totalPages);
    // 一部の環境で InteractionReply の components が取得できないエラーを避けるため、reply → fetchReply の二段
    await interaction.editReply({
        embeds: [embed],
        components: [row],
        allowedMentions: { parse: [] },
    });
    const msg = await interaction.fetchReply();
    // ボタン収集
    const collector = msg.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        time: 60000,
        filter: (i) => i.user.id === interaction.user.id,
    });
    collector.on('collect', async (btn) => {
        // ❶ まずACK（これが超重要）。Unknown interaction対策
        try {
            await btn.deferUpdate();
        }
        catch {
            // 既に ACK 済みなら無視
        }
        // ❷ ページ更新
        const dir = btn.customId === 'top_prev' ? -1 : 1;
        page = Math.max(0, Math.min(page + dir, totalPages - 1));
        // ❸ メッセージ編集（Interaction.update は使わない）
        const newEmbed = await makePageEmbed(interaction, sorted, page);
        await msg.edit({
            embeds: [newEmbed],
            components: [makeRow(page, totalPages)],
            allowedMentions: { parse: [] },
        });
    });
    collector.on('end', async () => {
        // タイムアウトでボタン無効化
        const disabledRow = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId('top_prev')
            .setLabel('◀')
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setDisabled(true), new discord_js_1.ButtonBuilder()
            .setCustomId('top_next')
            .setLabel('▶')
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setDisabled(true));
        // メッセージの編集は、fetchReply が成功している前提で msg.edit を使う
        await msg.edit({ components: [disabledRow] }).catch(() => null);
    });
}
