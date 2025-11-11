// src/commands/menu.ts
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction,
  ComponentType, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonInteraction, UserSelectMenuBuilder, StringSelectMenuBuilder, ModalSubmitInteraction,
  PermissionFlagsBits
} from 'discord.js';

import {
  loadGuildStore, addCountGuild, getSbkRange, setSbkRange,
  setCountGuild, getImmuneList, addImmuneId, removeImmuneId
} from '../data';

const OWNER_IDS = (process.env.OWNER_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const PAGE_SIZE = 10;

/* ---------- ユーティリティ ---------- */
// ここを修正
async function displayNameFrom(
  i: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction, // ← 追加
  userId: string
) {
  const g = i.guild;
  if (g) {
    const m = await g.members.fetch(userId).catch(() => null);
    if (m?.displayName) return m.displayName;
  }
  const u = await i.client.users.fetch(userId).catch(() => null);
  return u?.tag ?? userId;
}

async function guildTopEmbed(i: ChatInputCommandInteraction | ButtonInteraction) {
  const gid = i.guildId!;
  const store = loadGuildStore(gid);
  const entries = Object.entries(store.counts);
  if (!entries.length) {
    return new EmbedBuilder().setTitle('しばきランキング').setDescription('まだ誰も しばかれていません。');
  }
  const lines = await Promise.all(
    entries.sort((a, b) => b[1] - a[1]).slice(0, PAGE_SIZE).map(async ([uid, cnt], idx) => {
      const name = await displayNameFrom(i, uid);
      return `#${idx + 1} ${name} × **${cnt}**`;
    })
  );
  return new EmbedBuilder()
    .setTitle('しばきランキング')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `上位 ${PAGE_SIZE} を表示 • ${new Date().toLocaleString('ja-JP')}` });
}

async function guildMembersEmbed(i: ChatInputCommandInteraction | ButtonInteraction) {
  const gid = i.guildId!;
  const store = loadGuildStore(gid);
  const members = await i.guild!.members.fetch();
  const humans = members.filter(m => !m.user.bot);

  const rows = await Promise.all(humans.map(async m => ({
    tag: m.displayName || m.user.tag,
    id: m.id,
    count: store.counts[m.id] ?? 0,
  })));

  rows.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  const top = rows.slice(0, 20);
  const lines = top.map((r, idx) => `#${idx + 1} \`${r.tag}\` × **${r.count}**`);
  return new EmbedBuilder()
    .setTitle('全メンバーのしばかれ回数（BOT除外）')
    .setDescription(lines.join('\n') || 'メンバーがいません（または全員 0）')
    .setFooter({ text: `合計 ${rows.length} 名 • ${new Date().toLocaleString('ja-JP')}` });
}

function disabledCopyOfRows(rows: ActionRowBuilder<ButtonBuilder>[]) {
  return rows.map(r => {
    const cloned = new ActionRowBuilder<ButtonBuilder>();
    const comps = r.components.map(c => ButtonBuilder.from(c).setDisabled(true));
    cloned.addComponents(comps);
    return cloned;
  });
}

/* ---------- メニュー UI ---------- */
function buildMenu(min: number, max: number) {
  const embed = new EmbedBuilder()
    .setTitle('しばくbot メニュー')
    .setDescription(
      `下のボタンから素早く操作できます（この表示は**あなたにだけ**見えます）。\n` +
      `現在のしばく回数: **${min}〜${max}**`
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('menu_top').setLabel('ランキング').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('menu_members').setLabel('メンバー一覧').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_stats').setLabel('統計').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('menu_sbk').setLabel('しばく').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('menu_room').setLabel('ルーム告知').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('menu_limit').setLabel('上限設定').setStyle(ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('menu_immune').setLabel('免除管理').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_control').setLabel('値を直接設定').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_help').setLabel('ヘルプ').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_close').setLabel('閉じる').setStyle(ButtonStyle.Danger),
  );

  return { embed, rows: [row1, row2, row3] };
}

/* ---------- メイン：/menu ---------- */
export async function handleMenu(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'サーバー内で使ってね。', ephemeral: true });
    return;
  }

  const gid = interaction.guildId!;
  let { min: SBK_MIN, max: SBK_MAX } = getSbkRange(gid);

  let built = buildMenu(SBK_MIN, SBK_MAX);
  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply({ embeds: [built.embed], components: built.rows });
  const msg = await interaction.fetchReply();

  const collector = interaction.channel!.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: i => i.user.id === interaction.user.id && i.message.id === (msg as any).id,
  });

  collector.on('collect', async (btn) => {
    try {
      switch (btn.customId) {
        /* --- ランキング --- */
        case 'menu_top': {
          await btn.deferUpdate();
          const emb = await guildTopEmbed(btn);
          await btn.followUp({ embeds: [emb], ephemeral: true });
          break;
        }
        /* --- メンバー一覧 --- */
        case 'menu_members': {
          await btn.deferUpdate();
          const emb = await guildMembersEmbed(btn);
          await btn.followUp({ embeds: [emb], ephemeral: true });
          break;
        }
        /* --- 統計 --- */
        case 'menu_stats': {
          await btn.deferUpdate();
          const store = loadGuildStore(gid);
          const total = Object.values(store.counts).reduce((a, b) => a + b, 0);
          const unique = Object.keys(store.counts).length;
          const immune = store.immune.length;
          await btn.followUp({
            embeds: [
              new EmbedBuilder()
                .setTitle('サーバー統計')
                .addFields(
                  { name: '総しばき回数', value: String(total), inline: true },
                  { name: '対象人数', value: String(unique), inline: true },
                  { name: '免除ユーザー', value: String(immune), inline: true },
                )
            ],
            ephemeral: true
          });
          break;
        }
        /* --- ルーム告知 --- */
        case 'menu_room': {
          const modal = new ModalBuilder().setCustomId('menu_room_modal').setTitle('ルーム告知');
          const game = new TextInputBuilder().setCustomId('game').setLabel('ゲーム名（例: PPR）').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16);
          const area = new TextInputBuilder().setCustomId('area').setLabel('エリア番号（例: 156）').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4);
          const pass = new TextInputBuilder().setCustomId('pass').setLabel('パスワード（例: 10005）').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(18);
          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(game),
            new ActionRowBuilder<TextInputBuilder>().addComponents(area),
            new ActionRowBuilder<TextInputBuilder>().addComponents(pass),
          );
          await btn.showModal(modal);
          const submitted = await btn.awaitModalSubmit({
            time: 60_000, filter: (m: ModalSubmitInteraction) => m.user.id === btn.user.id
          }).catch(() => null);
          if (!submitted) return;
          const g = submitted.fields.getTextInputValue('game').trim() || 'PPR';
          const a = Number(submitted.fields.getTextInputValue('area').trim() || '156');
          const p = submitted.fields.getTextInputValue('pass').trim() || '10005';
          await submitted.reply({
            content: `本日は **${g}** の **${isNaN(a) ? 156 : a}** で、**${p.slice(0, 16)}** で入れます。`,
            allowedMentions: { parse: [] },
          });
          break;
        }
        /* --- しばく（UI） --- */
        case 'menu_sbk': {
          const counts = Array.from({ length: SBK_MAX - SBK_MIN + 1 }, (_, i) => i + SBK_MIN);
          const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>()
            .addComponents(new UserSelectMenuBuilder().setCustomId('sbk_pick_user').setPlaceholder('しばく相手を選ぶ').setMaxValues(1));
          const rowCount = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(new StringSelectMenuBuilder().setCustomId('sbk_pick_count').setPlaceholder('回数を選ぶ')
              .addOptions(...counts.map(n => ({ label: `${n}回`, value: String(n) }))));

          await btn.reply({
            content: 'しばく対象と回数を選んで、最後に「理由を入力して実行」を押してください。',
            components: [
              rowUser,
              rowCount,
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('sbk_exec').setLabel('理由を入力して実行').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('sbk_cancel').setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
              ),
            ],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let pickedUserId: string | null = null;
          let pickedCount = SBK_MIN;

          const sub = btn.channel!.createMessageComponentCollector({
            time: 60_000,
            filter: i => i.user.id === btn.user.id && i.message.id === (panel as any).id,
          });

          sub.on('collect', async (i) => {
            if (i.isUserSelectMenu() && i.customId === 'sbk_pick_user') {
              pickedUserId = i.values[0] ?? null; await i.deferUpdate();
            } else if (i.isStringSelectMenu() && i.customId === 'sbk_pick_count') {
              pickedCount = Math.max(SBK_MIN, Math.min(SBK_MAX, Number(i.values[0] ?? SBK_MIN))); await i.deferUpdate();
            } else if (i.isButton() && i.customId === 'sbk_cancel') {
              await i.update({ content: 'キャンセルしました。', components: [] }); sub.stop('cancel');
            } else if (i.isButton() && i.customId === 'sbk_exec') {
              if (!pickedUserId) { await i.reply({ content: '相手を選んでください。', ephemeral: true }); return; }
              const modal = new ModalBuilder().setCustomId('sbk_modal').setTitle('しばく理由');
              modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder().setCustomId('reason').setStyle(TextInputStyle.Paragraph).setLabel('理由（50文字まで）').setRequired(true).setMaxLength(50)
              ));
              await i.showModal(modal);
              const submitted = await i.awaitModalSubmit({
                time: 60_000, filter: (m: ModalSubmitInteraction) => m.user.id === i.user.id
              }).catch(() => null);
              if (!submitted) return;

              const reason = submitted.fields.getTextInputValue('reason').trim();
              const next = addCountGuild(gid, pickedUserId!, pickedCount, i.user.username, reason);
              const name = await displayNameFrom(submitted, pickedUserId!);
              try { await (panel as any).edit({ components: [] }); } catch {}
              await submitted.reply({
                content: `**${name}** が ${pickedCount} 回 しばかれました！（累計 ${next} 回）\n理由: ${reason}`,
                allowedMentions: { parse: [] },
              });
              sub.stop('done');
            }
          });

          sub.on('end', async () => { try { await (panel as any).edit({ components: [] }); } catch {} });
          break;
        }
        /* --- 上限設定（管理者/開発者） --- */
        case 'menu_limit': {
          const isAdmin = btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
          const isDev = OWNER_IDS.includes(btn.user.id);
          if (!isAdmin && !isDev) { await btn.reply({ content: '⚠️ 上限設定は管理者/開発者のみ。', ephemeral: true }); return; }

          const modal = new ModalBuilder().setCustomId('limit_modal').setTitle('しばく回数の上限設定');
          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('min').setLabel(`最小（現在 ${SBK_MIN}）`).setStyle(TextInputStyle.Short).setPlaceholder('1〜25').setRequired(true)),
            new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('max').setLabel(`最大（現在 ${SBK_MAX}）`).setStyle(TextInputStyle.Short).setPlaceholder('1〜25 / 最小以上').setRequired(true)),
          );
          await btn.showModal(modal);
          const submitted = await btn.awaitModalSubmit({ time: 60_000, filter: m => m.user.id === btn.user.id }).catch(() => null);
          if (!submitted) return;
          const minIn = Number(submitted.fields.getTextInputValue('min'));
          const maxIn = Number(submitted.fields.getTextInputValue('max'));
          if (!Number.isFinite(minIn) || !Number.isFinite(maxIn)) { await submitted.reply({ content: '数値を入力してください。', ephemeral: true }); return; }

          const { min, max } = setSbkRange(gid, minIn, maxIn);
          SBK_MIN = min; SBK_MAX = max;

          built = buildMenu(SBK_MIN, SBK_MAX);
          try { await interaction.editReply({ embeds: [built.embed], components: built.rows }); } catch {}
          await submitted.reply({ content: `✅ しばく回数の範囲を **${min}〜${max}** に変更しました。`, ephemeral: true });
          break;
        }
        /* --- 免除管理（追加/削除/一覧） --- */
        case 'menu_immune': {
          const isAdmin = btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
          const isDev = OWNER_IDS.includes(btn.user.id);
          if (!isAdmin && !isDev) { await btn.reply({ content: '⚠️ 免除管理は管理者/開発者のみ。', ephemeral: true }); return; }

          const rowAct = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(new StringSelectMenuBuilder()
              .setCustomId('imm_act').setPlaceholder('操作を選択')
              .addOptions(
                { label: '追加', value: 'add' },
                { label: '削除', value: 'remove' },
                { label: '一覧', value: 'list' },
              ));
          const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>()
            .addComponents(new UserSelectMenuBuilder().setCustomId('imm_user').setPlaceholder('対象ユーザー').setMaxValues(1));

          await btn.reply({
            content: '免除の操作を選んでください（追加/削除はユーザーも選択）。',
            components: [rowAct, rowUser,
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('imm_exec').setLabel('実行').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('imm_cancel').setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
              )],
            ephemeral: true
          });
          const panel = await btn.fetchReply();
          let act: 'add'|'remove'|'list'|null = null;
          let target: string | null = null;

          const sub = btn.channel!.createMessageComponentCollector({
            time: 60_000, filter: i => i.user.id === btn.user.id && i.message.id === (panel as any).id
          });

          sub.on('collect', async i => {
            if (i.isStringSelectMenu() && i.customId === 'imm_act') { act = i.values[0] as any; await i.deferUpdate(); }
            else if (i.isUserSelectMenu() && i.customId === 'imm_user') { target = i.values[0] ?? null; await i.deferUpdate(); }
            else if (i.isButton() && i.customId === 'imm_cancel') { await i.update({ content: 'キャンセルしました。', components: [] }); sub.stop('cancel'); }
            else if (i.isButton() && i.customId === 'imm_exec') {
              if (!act) { await i.reply({ content: '操作を選んでください。', ephemeral: true }); return; }
              if ((act === 'add' || act === 'remove') && !target) { await i.reply({ content: '対象を選んでください。', ephemeral: true }); return; }

              if (act === 'list') {
                const list = getImmuneList(gid);
                await i.reply({ content: list.length ? list.map((x, n) => `${n+1}. <@${x}> (\`${x}\`)`).join('\n') : '（なし）', ephemeral: true });
              } else if (act === 'add') {
                const ok = addImmuneId(gid, target!);
                const tag = await displayNameFrom(i as any, target!);
                await i.reply({ content: ok ? `\`${tag}\` を免除リストに追加しました。` : `\`${tag}\` は既に免除リストに存在します。`, ephemeral: true });
              } else if (act === 'remove') {
                const ok = removeImmuneId(gid, target!);
                const tag = await displayNameFrom(i as any, target!);
                await i.reply({ content: ok ? `\`${tag}\` を免除リストから削除しました。` : `\`${tag}\` は免除リストにありません。`, ephemeral: true });
              }
              try { await (panel as any).edit({ components: [] }); } catch {}
              sub.stop('done');
            }
          });
          sub.on('end', async () => { try { await (panel as any).edit({ components: [] }); } catch {} });
          break;
        }
        /* --- 値を直接設定（/control のUI版） --- */
        case 'menu_control': {
          const isAdmin = btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
          const isDev = OWNER_IDS.includes(btn.user.id);
          if (!isAdmin && !isDev) { await btn.reply({ content: '⚠️ 値の直接設定は管理者/開発者のみ。', ephemeral: true }); return; }

          const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>()
            .addComponents(new UserSelectMenuBuilder().setCustomId('ctl_user').setPlaceholder('対象ユーザー').setMaxValues(1));
          await btn.reply({
            content: '対象を選んで「設定」を押すと回数を入力できます。',
            components: [rowUser,
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('ctl_set').setLabel('設定').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ctl_cancel').setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
              )],
            ephemeral: true
          });

          const panel = await btn.fetchReply();
          let target: string | null = null;

          const sub = btn.channel!.createMessageComponentCollector({
            time: 60_000, filter: i => i.user.id === btn.user.id && i.message.id === (panel as any).id
          });

          sub.on('collect', async i => {
            if (i.isUserSelectMenu() && i.customId === 'ctl_user') { target = i.values[0] ?? null; await i.deferUpdate(); }
            else if (i.isButton() && i.customId === 'ctl_cancel') { await i.update({ content: 'キャンセルしました。', components: [] }); sub.stop('cancel'); }
            else if (i.isButton() && i.customId === 'ctl_set') {
              if (!target) { await i.reply({ content: '対象を選んでください。', ephemeral: true }); return; }
              const modal = new ModalBuilder().setCustomId('ctl_modal').setTitle('しばかれ回数を設定');
              modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder().setCustomId('value').setLabel('回数（0以上の整数）').setStyle(TextInputStyle.Short).setRequired(true)));
              await i.showModal(modal);
              const submitted = await i.awaitModalSubmit({ time: 60_000, filter: m => m.user.id === i.user.id }).catch(() => null);
              if (!submitted) return;
              const value = Number(submitted.fields.getTextInputValue('value'));
              if (!Number.isFinite(value) || value < 0) { await submitted.reply({ content: '0以上の数値を入力してください。', ephemeral: true }); return; }
              const next = setCountGuild(gid, target!, value);
              const tag = await displayNameFrom(submitted, target!);
              try { await (panel as any).edit({ components: [] }); } catch {}
              await submitted.reply({ content: `**${tag}** のしばかれ回数を **${next} 回** に設定しました。`, ephemeral: true });
              sub.stop('done');
            }
          });
          sub.on('end', async () => { try { await (panel as any).edit({ components: [] }); } catch {} });
          break;
        }
        /* --- ヘルプ --- */
        case 'menu_help': {
          await btn.deferUpdate();
          await btn.followUp({
            embeds: [new EmbedBuilder().setTitle('ヘルプ').setDescription([
              'このメニューから、ランキング/メンバー/統計/しばく/ルーム告知/上限設定/免除管理/値の直接設定 ができます。',
              '※ 上限設定・免除管理・値の直接設定は管理者 or OWNER_IDS のみ。',
            ].join('\n'))],
            ephemeral: true
          });
          break;
        }
        /* --- 閉じる --- */
        case 'menu_close': {
          await btn.deferUpdate();
          try {
            const disabled = disabledCopyOfRows(built.rows);
            await btn.message.edit({ content: '✅ メニューを閉じました。', components: disabled });
          } catch {}
          collector.stop('close');
          break;
        }
        default: { await btn.deferUpdate().catch(() => {}); break; }
      }
    } catch (e) { console.error('[menu] error', e); }
  });

  collector.on('end', async () => {
    try {
      const disabled = disabledCopyOfRows(built.rows);
      await (msg as any).edit({ components: disabled }).catch(() => {});
    } catch {}
  });
}
