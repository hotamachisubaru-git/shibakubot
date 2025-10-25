// src/commands/top.ts
import {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { loadData } from '../data';

const PAGE_SIZE = 10;

// 通知ゼロ＆リンクなし(backtick)表記
async function getUserLabel(client: Client, id: string): Promise<string> {
  const u = await client.users.fetch(id).catch(() => null);
  const tag = u?.tag ?? id;
  return `\`${tag}\``;
}

function sliceTop(data: Record<string, number>, page: number, pageSize: number) {
  const entries = Object.entries(data)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const start = (clamped - 1) * pageSize;
  const items = entries.slice(start, start + pageSize);
  return { items, page: clamped, totalPages };
}

async function buildTopEmbed(client: Client, data: Record<string, number>, page = 1) {
  const { items, totalPages } = sliceTop(data, page, PAGE_SIZE);

  const lines = await Promise.all(
    items.map(async (e, idx) => {
      const rankNo = (page - 1) * PAGE_SIZE + (idx + 1);
      const name = await getUserLabel(client, e.id);
      return `#${rankNo} ${name} × **${e.count.toLocaleString()}**`;
    }),
  );

  const embed = new EmbedBuilder()
    .setColor(0xd94848)
    .setAuthor({ name: 'しばきランキング' })
    .setDescription(lines.join('\n') || 'まだ誰も しばかれていません。')
    .setFooter({ text: `Page ${page}/${totalPages}・更新: ${new Date().toLocaleString('ja-JP')}` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`top_prev_${page}`)
      .setLabel('前へ')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`top_next_${page}`)
      .setLabel('次へ')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId(`top_refresh_${page}`)
      .setLabel('更新')
      .setStyle(ButtonStyle.Success),
  );

  return { embed, components: [row] as const };
}

export async function handleTop(interaction: ChatInputCommandInteraction) {
  // 3秒制限回避：先にACKだけ返す（allowedMentionsはここでは指定しない）
  await interaction.deferReply({
    ephemeral: false,     // 公開にしたくなければ true
    withResponse: false,  // fetchReply: true でも可
  });

  let page = 1;
  const data = loadData();
  const first = await buildTopEmbed(interaction.client, data, page);

  await interaction.editReply({
    embeds: [first.embed],
    components: first.components,
    allowedMentions: { parse: [] },
  });

  const msg = await interaction.fetchReply();

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i) => i.user.id === interaction.user.id,
  });

  collector.on('collect', async (btn) => {
    await btn.deferUpdate();

    if (btn.customId.startsWith('top_prev_')) page = Math.max(1, page - 1);
    if (btn.customId.startsWith('top_next_')) page = page + 1;
    if (btn.customId.startsWith('top_refresh_')) {
      // ここでは特に何もしない（最新データで再描画）
    }

    const updated = await buildTopEmbed(interaction.client, loadData(), page);
    await interaction.editReply({
      embeds: [updated.embed],
      components: updated.components,
      allowedMentions: { parse: [] },
    });
  });

  collector.on('end', async () => {
    const disabled = first.components.map((row) => {
      const r = ActionRowBuilder.from(row) as ActionRowBuilder<ButtonBuilder>;
      r.components.forEach((c: any) => c.setDisabled(true));
      return r;
    });
    await interaction.editReply({ components: disabled });
  });
}
