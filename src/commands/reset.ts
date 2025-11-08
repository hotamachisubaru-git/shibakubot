// src/commands/reset.ts
import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { loadGuildStore, saveGuildStore } from '../data';

// .env の OWNER_IDS=id1,id2,... を参照
const OWNER_IDS = (process.env.OWNER_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export async function handleReset(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'このコマンドはサーバー内でのみ使用できます。',
      ephemeral: true,
    });
    return;
  }

  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  const isOwner = OWNER_IDS.includes(interaction.user.id);
  if (!isAdmin && !isOwner) {
    await interaction.reply({
      content: '権限がありません（管理者/オーナーのみ）。',
      ephemeral: true,
    });
    return;
  }

  const gid = interaction.guildId!;
  const resetAll = interaction.options.getBoolean('all') ?? false;
  const target = interaction.options.getUser('user');

  if (resetAll) {
    const store = loadGuildStore(gid);
    store.counts = {};
    saveGuildStore(gid, store);
    await interaction.reply({ content: '全員のしばき回数を0にリセットしました。', ephemeral: true });
    return;
  }

  if (target) {
    const store = loadGuildStore(gid);
    store.counts[target.id] = 0;
    saveGuildStore(gid, store);

    const member = await interaction.guild!.members.fetch(target.id).catch(() => null);
    const display = member?.displayName ?? target.tag;
    await interaction.reply({
      content: `**${display}** のしばき回数を0にリセットしました。`,
      allowedMentions: { parse: [] },
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({ content: 'リセット対象（`all: true` または `user`）を指定してください。', ephemeral: true });
}