// src/commands/top.ts
import {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ChatInputCommandInteraction,
  type Guild,
} from 'discord.js';
import { loadData } from '../data';

const PAGE_SIZE = 10;

/** サーバー内の表示名（ニックネーム→なければ通常名）を取得 */
async function getDisplayName(client: Client, userId: string, guild?: Guild): Promise<string> {
  // ギルド内なら displayName を最優先
  if (guild) {
    try {
      const member = await guild.members.fetch(userId);
      return member.displayName;
    } catch {
      /* 取得失敗時は fallthrough */
    }
  }
  // ギルド外/失敗時はユーザー名で
  try {
    const u = await client.users.fetch(userId);
    // 新ユーザー名（global name が欲しければ u.globalName ?? u.username でもOK）
    return u.username;
  } catch {
    // どうしても取れない場合はIDを返す
    return userId;
  }
}

function sliceTop(
  data: Record<string, number>,
  page: number,
  pageSize: number
) {
  const entries = Object.entries(data)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const start = (clamped - 1) * pageSize;
  const items = entries.slice(start, start + pageSize);

  return { items, page: clamped, totalPages };
}

async function buildTopEmbed(
  client: Client,
  data: Record<string, number>,
  page = 1,
  guild?: Guild
) {
  const { items, totalPages } = sliceTop(data, page, PAGE_SIZE);

  const lines = await Promise.all(
    items.map(async (e, idx) => {
      const rankNo = (page - 1) * PAGE_SIZE + (idx + 1);
      const name = await getDisplayName(client, e.id, guild);
      // メンション通知が飛ばないよう @ 記号は使わず、素の表示名のみ
      return `#${rankNo} ${name} × **${e.count.toLocaleString()}**`;
    })
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
      .setDisabled(items.length < PAGE_SIZE && page >= totalPages),
    new ButtonBuilder()
      .setCustomId(`top_refresh_${page}`)
      .setLabel('更新')
      .setStyle(ButtonStyle.Success),
  );

  return { embed, components: [row] as const };
}

/** /top の実装（defer→editReplyで安定運用） */
export async function handleTop(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({
    ephemeral: false,
    withResponse: false,
  });

  let page = 1;
  const store = loadData();

  const first = await buildTopEmbed(
    interaction.client,
    store,
    page,
    interaction.inGuild() ? interaction.guild ?? undefined : undefined
  );

  await interaction.editReply({
    embeds: [first.embed],
    components: first.components,
    allowedMentions: { parse: [] }, // 念のため通知抑止
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
      // 何もしなくても最新データで再描画する
    }

    const updated = await buildTopEmbed(
      interaction.client,
      loadData(),
      page,
      interaction.inGuild() ? interaction.guild ?? undefined : undefined
    );

    await interaction.editReply({
      embeds: [updated.embed],
      components: updated.components,
      allowedMentions: { parse: [] },
    });
  });

  collector.on('end', async () => {
    // タイムアウトでボタン無効化
    const disabled = first.components.map((row) => {
      const r = ActionRowBuilder.from(row) as ActionRowBuilder<ButtonBuilder>;
      r.components.forEach((c: any) => c.setDisabled(true));
      return r;
    });
    await interaction.editReply({ components: disabled });
  });
}
