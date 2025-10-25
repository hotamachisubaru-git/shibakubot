"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTop = handleTop;
// src/commands/top.ts
const discord_js_1 = require("discord.js");
const data_1 = require("../data");
const PAGE_SIZE = 10;
/** サーバー内の表示名（ニックネーム→なければ通常名）を取得 */
async function getDisplayName(client, userId, guild) {
    // ギルド内なら displayName を最優先
    if (guild) {
        try {
            const member = await guild.members.fetch(userId);
            return member.displayName;
        }
        catch {
            /* 取得失敗時は fallthrough */
        }
    }
    // ギルド外/失敗時はユーザー名で
    try {
        const u = await client.users.fetch(userId);
        // 新ユーザー名（global name が欲しければ u.globalName ?? u.username でもOK）
        return u.username;
    }
    catch {
        // どうしても取れない場合はIDを返す
        return userId;
    }
}
function sliceTop(data, page, pageSize) {
    const entries = Object.entries(data)
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count);
    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    const clamped = Math.min(Math.max(1, page), totalPages);
    const start = (clamped - 1) * pageSize;
    const items = entries.slice(start, start + pageSize);
    return { items, page: clamped, totalPages };
}
async function buildTopEmbed(client, data, page = 1, guild) {
    const { items, totalPages } = sliceTop(data, page, PAGE_SIZE);
    const lines = await Promise.all(items.map(async (e, idx) => {
        const rankNo = (page - 1) * PAGE_SIZE + (idx + 1);
        const name = await getDisplayName(client, e.id, guild);
        // メンション通知が飛ばないよう @ 記号は使わず、素の表示名のみ
        return `#${rankNo} ${name} × **${e.count.toLocaleString()}**`;
    }));
    const embed = new discord_js_1.EmbedBuilder()
        .setColor(0xd94848)
        .setAuthor({ name: 'しばきランキング' })
        .setDescription(lines.join('\n') || 'まだ誰も しばかれていません。')
        .setFooter({ text: `Page ${page}/${totalPages}・更新: ${new Date().toLocaleString('ja-JP')}` });
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId(`top_prev_${page}`)
        .setLabel('前へ')
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setDisabled(page <= 1), new discord_js_1.ButtonBuilder()
        .setCustomId(`top_next_${page}`)
        .setLabel('次へ')
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setDisabled(items.length < PAGE_SIZE && page >= totalPages), new discord_js_1.ButtonBuilder()
        .setCustomId(`top_refresh_${page}`)
        .setLabel('更新')
        .setStyle(discord_js_1.ButtonStyle.Success));
    return { embed, components: [row] };
}
/** /top の実装（defer→editReplyで安定運用） */
async function handleTop(interaction) {
    await interaction.deferReply({
        ephemeral: false,
        withResponse: false,
    });
    let page = 1;
    const store = (0, data_1.loadData)();
    const first = await buildTopEmbed(interaction.client, store, page, interaction.inGuild() ? interaction.guild ?? undefined : undefined);
    await interaction.editReply({
        embeds: [first.embed],
        components: first.components,
        allowedMentions: { parse: [] }, // 念のため通知抑止
    });
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
        componentType: discord_js_1.ComponentType.Button,
        time: 60000,
        filter: (i) => i.user.id === interaction.user.id,
    });
    collector.on('collect', async (btn) => {
        await btn.deferUpdate();
        if (btn.customId.startsWith('top_prev_'))
            page = Math.max(1, page - 1);
        if (btn.customId.startsWith('top_next_'))
            page = page + 1;
        if (btn.customId.startsWith('top_refresh_')) {
            // 何もしなくても最新データで再描画する
        }
        const updated = await buildTopEmbed(interaction.client, (0, data_1.loadData)(), page, interaction.inGuild() ? interaction.guild ?? undefined : undefined);
        await interaction.editReply({
            embeds: [updated.embed],
            components: updated.components,
            allowedMentions: { parse: [] },
        });
    });
    collector.on('end', async () => {
        // タイムアウトでボタン無効化
        const disabled = first.components.map((row) => {
            const r = discord_js_1.ActionRowBuilder.from(row);
            r.components.forEach((c) => c.setDisabled(true));
            return r;
        });
        await interaction.editReply({ components: disabled });
    });
}
