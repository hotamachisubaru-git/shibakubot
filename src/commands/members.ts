// src/commands/members.ts
import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { loadGuildStore } from '../data';

export async function handleMembers(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'サーバー内で使ってね。', ephemeral: true });
    return;
  }

  try {
    await interaction.deferReply({ ephemeral: true });

    const store = loadGuildStore(interaction.guildId!);
    const members = await interaction.guild!.members.fetch();
    const humans = members.filter(m => !m.user.bot);

    const rows = humans
      .map(m => ({
        tag: m.displayName || m.user.tag,
        id: m.id,
        count: store.counts[m.id] ?? 0,
      }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    const top = rows.slice(0, 20);
    const lines = top.map((r, i) => `#${i + 1} \`${r.tag}\` × **${r.count}**`);

    const embed = {
      title: '全メンバーのしばかれ回数（BOT除外）',
      description: lines.join('\n') || 'メンバーがいません（または全員 0）',
      footer: { text: `合計 ${rows.length} 名 • ${new Date().toLocaleString('ja-JP')}` },
    };

    const header = 'rank,tag,id,count';
    const csv = [header, ...rows.map((r, i) => `${i + 1},${r.tag},${r.id},${r.count}`)].join('\n');
    const file = new AttachmentBuilder(Buffer.from(csv, 'utf8'), { name: 'members.csv' });

    await interaction.editReply({
      embeds: [embed],
      files: [file],
    });
  } catch (e) {
    console.error('[members] error', e);
    await interaction.editReply({ content: 'エラーが発生しました。' });


  }
}