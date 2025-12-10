// src/commands/menu.ts
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction,
  ComponentType, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonInteraction, UserSelectMenuBuilder, StringSelectMenuBuilder, ModalSubmitInteraction,
  PermissionFlagsBits, ChannelSelectMenuBuilder, ChannelType, MessageFlags
} from 'discord.js';
import { handleMedalRankingButton, handleMedalSendButton } from './medal';
import {
  loadGuildStore, addCountGuild, getSbkRange, setSbkRange,
  setCountGuild, getImmuneList, addImmuneId, removeImmuneId,
  getMedalBalance,addMedals,setMedals,isImmune
} from '../data';
import {sendLog } from '../logging';
import { displayNameFrom } from '../utils/displayNameUtil';
/* ===== 設定 ===== */
const OWNER_IDS = (process.env.OWNER_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const IMMUNE_IDS = (process.env.IMMUNE_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const PAGE_SIZE = 10;

async function guildTopEmbed(i: ChatInputCommandInteraction | ButtonInteraction) {
  const gid = i.guildId!;
  const store = loadGuildStore(gid);
  const entries = Object.entries(store.counts);
  if (!entries.length)
    return new EmbedBuilder().setTitle('しばきランキング').setDescription('まだ誰も しばかれていません。');

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

/* ===== メニューUI ===== */
function buildMenu(min: number, max: number, page: number = 1) {
  const maxPage = 4;

  const embed = new EmbedBuilder()
    .setTitle('しばくbot メニュー')
    .setDescription(
      `下のボタンから素早く操作できます（この表示は**あなたにだけ**見えます）。\n` +
      `現在のしばく回数: **${min}〜${max}**\n` +
      `表示カテゴリ: **${page === 1 ? '基本' : page === 2 ? 'メダル' : 'VC'} (${page}/${maxPage})**`
    );

  // 基本操作
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('menu_top').setLabel('ランキング').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('menu_members').setLabel('メンバー一覧').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_stats').setLabel('統計').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_help').setLabel('ヘルプ').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_close').setLabel('閉じる').setStyle(ButtonStyle.Danger),
  );

  // sbk / ルーム告知 / 上限設定 / 免除管理 / 値直接設定
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('menu_room').setLabel('ルーム告知').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('menu_limit').setLabel('上限設定').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_immune').setLabel('免除管理').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_control').setLabel('値を直接設定').setStyle(ButtonStyle.Secondary),
  );

  // メダル周りの管理
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('menu_admin').setLabel('メダル管理').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_bank').setLabel('メダルバンク').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_medal_ranking').setLabel('メダルランキング').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('menu_medal_send').setLabel('メダル送金').setStyle(ButtonStyle.Success),
  );

  // VC 関連
  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('menu_movevc').setLabel('VC移動').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('menu_vcdisconnect').setLabel('VC切断').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('menu_vcmute').setLabel('VCミュート').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_vcunmute').setLabel('VCアンミュート').setStyle(ButtonStyle.Secondary),
  );

  // 管理者向け（監査ログなど）
  const row5 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('menu_audit').setLabel('監査ログ').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_settings').setLabel('サーバー設定').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_devtools').setLabel('開発者ツール').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_sysstats').setLabel('システム統計').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_backup').setLabel('バックアップ作業').setStyle(ButtonStyle.Secondary),
  );
   
 

  // ページごとに出す行を切り替える
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  if (page === 1) {
    rows.push(row1, row2);       // 基本
  } else if (page === 2) {
    rows.push(row3);             // メダル
  } else if (page === 3) {
    rows.push(row4);             // VC
  }

  // 下部ページナビ
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('menu_page_basic')
      .setLabel('基本')
      .setStyle(page === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu_page_medal')
      .setLabel('メダル')
      .setStyle(page === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu_page_vc')
      .setLabel('VC')
      .setStyle(page === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu_page_admin')
      .setLabel('管理者')
      .setStyle(page === 4 ? ButtonStyle.Primary : ButtonStyle.Secondary),  
  );
  rows.push(navRow);

  return { embed, rows };
}

/* ===== /menu メイン ===== */
export async function handleMenu(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: '⚠️ このコマンドはサーバー内でのみ使用できます。',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const gid = interaction.guildId!;
  let { min: sbkMin, max: sbkMax } = getSbkRange(gid);

  // 現在ページ（1 = 基本）
  let currentPage = 1;

  // ページ指定でメニュー生成
  let built = buildMenu(sbkMin, sbkMax, currentPage);

  // ★ 1回だけ返信（ephemeral は flags を使う）
  await interaction.reply({
    embeds: [built.embed],
    components: built.rows,
    flags: MessageFlags.Ephemeral,
  });

  // ★ メッセージオブジェクトは別途取得
  const msg = await interaction.fetchReply();

    const collector = interaction.channel!.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: i => i.user.id === interaction.user.id && i.message.id === (msg as any).id,
  });

  collector.on('collect', async (btn) => {
    try {
      switch (btn.customId) {
        /* --- ページ切り替え --- */
        case 'menu_page_basic':
        case 'menu_page_medal':
        case 'menu_page_vc':
        case 'menu_page_admin': {
          await btn.deferUpdate();

          if (btn.customId === 'menu_page_basic') currentPage = 1;
          if (btn.customId === 'menu_page_medal') currentPage = 2;
          if (btn.customId === 'menu_page_vc') currentPage = 3;
          if (btn.customId === 'menu_page_admin') currentPage = 4;

          const rebuilt = buildMenu(sbkMin, sbkMax, currentPage);
          built = rebuilt;

          await interaction.editReply({
            embeds: [rebuilt.embed],
            components: rebuilt.rows,
          });
          break;
        }

        /* --- ランキング --- */
        case 'menu_top': {
          await btn.deferUpdate();
          await btn.followUp({ embeds: [await guildTopEmbed(btn)], ephemeral: true });
          break;
        }

        /* --- メンバー一覧 --- */
        case 'menu_members': {
          await btn.deferUpdate();
          await btn.followUp({ embeds: [await guildMembersEmbed(btn)], ephemeral: true });
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
                ),
            ],
            ephemeral: true,
          });
          break;
        }

        /* --- ルーム告知 --- */
        case 'menu_room': {
          const modal = new ModalBuilder().setCustomId('menu_room_modal').setTitle('ルーム告知');
          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('game')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(16)
                .setLabel('ゲーム名（例: PPR）'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('area')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(4)
                .setLabel('エリア番号（例: 156）'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('pass')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(18)
                .setLabel('パスワード（例: 10005）'),
            ),
          );
          await btn.showModal(modal);
          const submitted = await btn
            .awaitModalSubmit({
              time: 60_000,
              filter: (m: ModalSubmitInteraction) => m.user.id === btn.user.id,
            })
            .catch(() => null);
          if (!submitted) break;

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
          const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId('sbk_pick_user')
              .setPlaceholder('しばく相手を選ぶ')
              .setMaxValues(1),
          );

          await btn.reply({
            content: 'しばく相手を選んで、「理由と回数を入力して実行」を押してください。',
            components: [
              rowUser,
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId('sbk_exec')
                  .setLabel('理由と回数を入力して実行')
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId('sbk_cancel')
                  .setLabel('キャンセル')
                  .setStyle(ButtonStyle.Secondary),
              ),
            ],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let pickedUserId: string | null = null;

          const sub = btn.channel!.createMessageComponentCollector({
            time: 60_000,
            filter: i => i.user.id === btn.user.id && i.message.id === (panel as any).id,
          });

          sub.on('collect', async (i) => {
            if (i.isUserSelectMenu() && i.customId === 'sbk_pick_user') {
              pickedUserId = i.values[0] ?? null;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === 'sbk_cancel') {
              await i.update({ content: 'キャンセルしました。', components: [] });
              sub.stop('cancel');
              return;
            }

            if (i.isButton() && i.customId === 'sbk_exec') {
              if (!pickedUserId) {
                await i.reply({ content: '相手を選んでください。', ephemeral: true });
                return;
              }

              const modal = new ModalBuilder()
                .setCustomId('sbk_modal')
                .setTitle('しばく回数と理由');
              modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                  new TextInputBuilder()
                    .setCustomId('count')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setLabel(`回数（${sbkMin}〜${sbkMax} の整数）`),
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                  new TextInputBuilder()
                    .setCustomId('reason')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(100)
                    .setLabel('理由（100文字まで）'),
                ),
              );

              await i.showModal(modal);
              const submitted = await i
                .awaitModalSubmit({
                  time: 60_000,
                  filter: (m: ModalSubmitInteraction) => m.user.id === i.user.id,
                })
                .catch(() => null);
              if (!submitted) return;

              const localImmune = isImmune(gid, pickedUserId!);
              const globalImmune = IMMUNE_IDS.includes(pickedUserId!);
              if (localImmune || globalImmune) {
                await submitted.reply({
                  content: '🛡️ このユーザーはしばき免除のため実行できません。',
                  ephemeral: true,
                });
                return;
              }

              const countRaw = submitted.fields.getTextInputValue('count').trim();
              const pickedCount = Number(countRaw);
              if (
                !Number.isInteger(pickedCount) ||
                pickedCount < sbkMin ||
                pickedCount > sbkMax
              ) {
                await submitted.reply({
                  content: `回数は ${sbkMin}〜${sbkMax} の整数で入力してください。`,
                  ephemeral: true,
                });
                return;
              }

              const reason = submitted.fields.getTextInputValue('reason').trim();
              const next = addCountGuild(gid, pickedUserId!, pickedCount, i.user.tag, reason);
              const name = await displayNameFrom(submitted, pickedUserId!);

              try {
                await (panel as any).edit({ components: [] });
              } catch {}

              await submitted.reply({
                content: `**${name}** が ${pickedCount} 回 しばかれました！（累計 ${next} 回）\n理由: ${reason}`,
                allowedMentions: { parse: [] },
              });

              await sendLog(
                submitted,
                i.user.id,
                pickedUserId!,
                reason,
                pickedCount,
                next,
              );

              sub.stop('done');
            }
          });

          sub.on('end', async () => {
            try {
              await (panel as any).edit({ components: [] });
            } catch {}
          });

          break;
        }

        /* --- 上限設定 --- */
        case 'menu_limit': {
          const isAdmin = btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
          const isDev = OWNER_IDS.includes(btn.user.id);
          if (!isAdmin && !isDev) {
            await btn.reply({ content: '⚠️ 上限設定は管理者/開発者のみ。', ephemeral: true });
            break;
          }

          const modal = new ModalBuilder().setCustomId('limit_modal').setTitle('しばく回数の上限設定');
          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('min')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('1以上の整数')
                .setRequired(true)
                .setLabel(`最小（現在 ${sbkMin}）`),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId('max')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('最小以上の整数')
                .setRequired(true)
                .setLabel(`最大（現在 ${sbkMax}）`),
            ),
          );

          await btn.showModal(modal);
          const submitted = await btn
            .awaitModalSubmit({
              time: 60_000,
              filter: m => m.user.id === btn.user.id,
            })
            .catch(() => null);
          if (!submitted) break;

          const minIn = Number(submitted.fields.getTextInputValue('min'));
          const maxIn = Number(submitted.fields.getTextInputValue('max'));
          if (!Number.isFinite(minIn) || !Number.isFinite(maxIn)) {
            await submitted.reply({ content: '数値を入力してください。', ephemeral: true });
            break;
          }

          const { min, max } = setSbkRange(gid, minIn, maxIn);
          sbkMin = min;
          sbkMax = max;
          built = buildMenu(sbkMin, sbkMax, currentPage);
          try {
            await interaction.editReply({ embeds: [built.embed], components: built.rows });
          } catch {}
          await submitted.reply({
            content: `✅ しばく回数の範囲を **${min}〜${max}** に変更しました。`,
            ephemeral: true,
          });
          break;
        }

        /* --- 免除管理 --- */
        case 'menu_immune': {
          const isAdmin = btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
          const isDev = OWNER_IDS.includes(btn.user.id);
          if (!isAdmin && !isDev) {
            await btn.reply({ content: '⚠️ 免除管理は管理者/開発者のみ。', ephemeral: true });
            break;
          }

          const rowAct = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('imm_act')
              .setPlaceholder('操作を選択')
              .addOptions(
                { label: '追加', value: 'add' },
                { label: '削除', value: 'remove' },
                { label: '一覧', value: 'list' },
              ),
          );
          const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId('imm_user')
              .setPlaceholder('対象ユーザー')
              .setMaxValues(1),
          );

          await btn.reply({
            content: '免除の操作を選んでください（追加/削除はユーザーも選択）。',
            components: [
              rowAct,
              rowUser,
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('imm_exec').setLabel('実行').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('imm_cancel').setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
              ),
            ],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let act: 'add' | 'remove' | 'list' | null = null;
          let target: string | null = null;

          const sub = btn.channel!.createMessageComponentCollector({
            time: 60_000,
            filter: i => i.user.id === btn.user.id && i.message.id === (panel as any).id,
          });

          sub.on('collect', async (i) => {
            if (i.isStringSelectMenu() && i.customId === 'imm_act') {
              act = i.values[0] as any;
              await i.deferUpdate();
              return;
            }

            if (i.isUserSelectMenu() && i.customId === 'imm_user') {
              target = i.values[0] ?? null;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === 'imm_cancel') {
              await i.update({ content: 'キャンセルしました。', components: [] });
              sub.stop('cancel');
              return;
            }

            if (i.isButton() && i.customId === 'imm_exec') {
              if (!act) {
                await i.reply({ content: '操作を選んでください。', ephemeral: true });
                return;
              }
              if ((act === 'add' || act === 'remove') && !target) {
                await i.reply({ content: '対象を選んでください。', ephemeral: true });
                return;
              }

              if (act === 'list') {
                const list = getImmuneList(gid);
                await i.reply({
                  content: list.length
                    ? list.map((x, n) => `${n + 1}. <@${x}> (\`${x}\`)`).join('\n')
                    : '（なし）',
                  ephemeral: true,
                });
              } else if (act === 'add') {
                const ok = addImmuneId(gid, target!);
                const tag = await displayNameFrom(i as any, target!);
                await i.reply({
                  content: ok
                    ? `\`${tag}\` を免除リストに追加しました。`
                    : `\`${tag}\` は既に免除リストに存在します。`,
                  ephemeral: true,
                });
              } else if (act === 'remove') {
                const ok = removeImmuneId(gid, target!);
                const tag = await displayNameFrom(i as any, target!);
                await i.reply({
                  content: ok
                    ? `\`${tag}\` を免除リストから削除しました。`
                    : `\`${tag}\` は免除リストにありません。`,
                  ephemeral: true,
                });
              }

              try {
                await (panel as any).edit({ components: [] });
              } catch {}
              sub.stop('done');
            }
          });

          sub.on('end', async () => {
            try {
              await (panel as any).edit({ components: [] });
            } catch {}
          });

          break;
        }

        /* --- 値を直接設定 --- */
        case 'menu_control': {
          const isAdmin = btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
          const isDev = OWNER_IDS.includes(btn.user.id);
          if (!isAdmin && !isDev) {
            await btn.reply({ content: '⚠️ 値の直接設定は管理者/開発者のみ。', ephemeral: true });
            break;
          }

          const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId('ctl_user')
              .setPlaceholder('対象ユーザー')
              .setMaxValues(1),
          );

          await btn.reply({
            content: '対象を選んで「設定」を押すと回数を入力できます。',
            components: [
              rowUser,
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('ctl_set').setLabel('設定').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ctl_cancel').setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
              ),
            ],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let target: string | null = null;

          const sub = btn.channel!.createMessageComponentCollector({
            time: 60_000,
            filter: i => i.user.id === btn.user.id && i.message.id === (panel as any).id,
          });

          sub.on('collect', async (i) => {
            if (i.isUserSelectMenu() && i.customId === 'ctl_user') {
              target = i.values[0] ?? null;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === 'ctl_cancel') {
              await i.update({ content: 'キャンセルしました。', components: [] });
              sub.stop('cancel');
              return;
            }

            if (i.isButton() && i.customId === 'ctl_set') {
              if (!target) {
                await i.reply({ content: '対象を選んでください。', ephemeral: true });
                return;
              }

              const modal = new ModalBuilder().setCustomId('ctl_modal').setTitle('しばかれ回数を設定');
              modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                  new TextInputBuilder()
                    .setCustomId('value')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setLabel('回数（0以上の整数）'),
                ),
              );
              await i.showModal(modal);

              const submitted = await i
                .awaitModalSubmit({
                  time: 60_000,
                  filter: m => m.user.id === i.user.id,
                })
                .catch(() => null);
              if (!submitted) return;

              const value = Number(submitted.fields.getTextInputValue('value'));
              if (!Number.isFinite(value) || value < 0) {
                await submitted.reply({ content: '0以上の数値を入力してください。', ephemeral: true });
                return;
              }

              const next = setCountGuild(gid, target!, value);
              const tag = await displayNameFrom(submitted, target!);

              try {
                await (panel as any).edit({ components: [] });
              } catch {}

              await submitted.reply({
                content: `**${tag}** のしばかれ回数を **${next} 回** に設定しました。`,
                ephemeral: true,
              });

              sub.stop('done');
            }
          });

          sub.on('end', async () => {
            try {
              await (panel as any).edit({ components: [] });
            } catch {}
          });

          break;
        }

        /* --- VC移動 --- */
        case 'menu_movevc': {
          const isAdmin = btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
          const canMove = btn.memberPermissions?.has(PermissionFlagsBits.MoveMembers) ?? false;
          const isDev = OWNER_IDS.includes(btn.user.id);
          if (!isAdmin && !canMove && !isDev) {
            await btn.reply({
              content: '⚠️ VC移動は管理者/MoveMembers権限/開発者のみ使えます。',
              ephemeral: true,
            });
            break;
          }

          const rowUsers = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId('movevc_users')
              .setPlaceholder('移動するメンバーを選択（複数可）')
              .setMinValues(1)
              .setMaxValues(20),
          );
          const rowDest = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId('movevc_dest')
              .setPlaceholder('移動先のボイスチャンネルを選択')
              .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
              .setMinValues(1)
              .setMaxValues(1),
          );
          const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('movevc_exec').setLabel('移動を実行').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('movevc_cancel').setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
          );

          await btn.reply({
            content: '🎧 移動するメンバーと移動先VCを選んでください。',
            components: [rowUsers, rowDest, rowExec],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let pickedUsers: string[] = [];
          let destChannelId: string | null = null;

          const sub = btn.channel!.createMessageComponentCollector({
            time: 60_000,
            filter: i => i.user.id === btn.user.id && i.message.id === (panel as any).id,
          });

          sub.on('collect', async (i) => {
            if (i.isUserSelectMenu() && i.customId === 'movevc_users') {
              pickedUsers = i.values;
              await i.deferUpdate();
              return;
            }

            if (i.isChannelSelectMenu() && i.customId === 'movevc_dest') {
              destChannelId = i.values[0] ?? null;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === 'movevc_cancel') {
              await i.update({ content: 'キャンセルしました。', components: [] });
              sub.stop('cancel');
              return;
            }

            if (i.isButton() && i.customId === 'movevc_exec') {
              if (!pickedUsers.length) {
                await i.reply({ content: '移動するメンバーを選んでください。', ephemeral: true });
                return;
              }
              if (!destChannelId) {
                await i.reply({ content: '移動先のVCを選んでください。', ephemeral: true });
                return;
              }

              await i.deferUpdate();

              const g = i.guild!;
              const dest = await g.channels.fetch(destChannelId).catch(() => null);
              if (
                !dest ||
                (dest.type !== ChannelType.GuildVoice && dest.type !== ChannelType.GuildStageVoice)
              ) {
                await i.followUp({
                  content: '❌ 移動先がボイスチャンネルではありません。',
                  ephemeral: true,
                });
                return;
              }

              const results: string[] = [];
              for (const uid of pickedUsers) {
                const m = await g.members.fetch(uid).catch(() => null);
                if (!m) {
                  results.push(`- <@${uid}>: 見つかりません`);
                  continue;
                }
                if (!m.voice?.channelId) {
                  results.push(`- ${m.displayName}: VC未参加`);
                  continue;
                }
                try {
                  await m.voice.setChannel(destChannelId!);
                  results.push(`- ${m.displayName}: ✅ 移動しました`);
                } catch {
                  results.push(`- ${m.displayName}: ❌ 失敗（権限/接続状況を確認）`);
                }
              }

              try {
                await (panel as any).edit({ components: [] });
              } catch {}
              await i.followUp({
                content: `📦 VC移動結果（→ <#${destChannelId}>）\n${results.join('\n')}`,
                ephemeral: true,
                allowedMentions: { parse: [] },
              });
              sub.stop('done');
            }
          });

          sub.on('end', async () => {
            try {
              await (panel as any).edit({ components: [] });
            } catch {}
          });

          break;
        }

        /* --- VC切断 --- */
        case 'menu_vcdisconnect': {
          const isAdmin = btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
          const canMove = btn.memberPermissions?.has(PermissionFlagsBits.MoveMembers) ?? false;
          const isDev = OWNER_IDS.includes(btn.user.id);
          if (!isAdmin && !canMove && !isDev) {
            await btn.reply({
              content: '⚠️ VC切断は管理者/MoveMembers権限/開発者のみ使えます。',
              ephemeral: true,
            });
            break;
          }

          const rowUsers = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId('discvc_users')
              .setPlaceholder('切断するメンバーを選択（最大10人）')
              .setMinValues(1)
              .setMaxValues(10),
          );
          const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('discvc_exec').setLabel('切断を実行').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('discvc_cancel').setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
          );

          await btn.reply({
            content: '🔇 VCから切断するメンバーを選んでください。',
            components: [rowUsers, rowExec],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let pickedUsers: string[] = [];

          const sub = btn.channel!.createMessageComponentCollector({
            time: 60_000,
            filter: i => i.user.id === btn.user.id && i.message.id === (panel as any).id,
          });

          sub.on('collect', async (i) => {
            if (i.isUserSelectMenu() && i.customId === 'discvc_users') {
              pickedUsers = i.values;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === 'discvc_cancel') {
              await i.update({ content: 'キャンセルしました。', components: [] });
              sub.stop('cancel');
              return;
            }

            if (i.isButton() && i.customId === 'discvc_exec') {
              if (!pickedUsers.length) {
                await i.reply({ content: '切断するメンバーを選んでください。', ephemeral: true });
                return;
              }

              await i.deferUpdate();

              const g = i.guild!;
              const results: string[] = [];
              for (const uid of pickedUsers) {
                const m = await g.members.fetch(uid).catch(() => null);
                if (!m) {
                  results.push(`- <@${uid}>: 見つかりません`);
                  continue;
                }
                if (!m.voice?.channelId) {
                  results.push(`- ${m.displayName}: VC未参加`);
                  continue;
                }
                try {
                  await m.voice.setChannel(null);
                  results.push(`- ${m.displayName}: ✅ 切断しました`);
                } catch {
                  results.push(`- ${m.displayName}: ⚠️ 失敗（権限/接続状態を確認）`);
                }
              }

              try {
                await (panel as any).edit({ components: [] });
              } catch {}
              await i.followUp({
                content: `🪓 VC切断結果\n${results.join('\n')}`,
                ephemeral: true,
                allowedMentions: { parse: [] },
              });
              sub.stop('done');
            }
          });

          sub.on('end', async () => {
            try {
              await (panel as any).edit({ components: [] });
            } catch {}
          });

          break;
        }

        /* --- VCミュート --- */
        case 'menu_vcmute': {
          const isAdmin = btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
          const canMute = btn.memberPermissions?.has(PermissionFlagsBits.MuteMembers) ?? false;
          const isDev = OWNER_IDS.includes(btn.user.id);
          if (!isAdmin && !canMute && !isDev) {
            await btn.reply({
              content: '⚠️ VCミュートは管理者/MuteMembers権限/開発者のみ使えます。',
              ephemeral: true,
            });
            break;
          }

          const rowUsers = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId('mutevc_users')
              .setPlaceholder('ミュートするメンバーを選択（最大10人）')
              .setMinValues(1)
              .setMaxValues(10),
          );
          const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('mutevc_exec').setLabel('ミュートを実行').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('mutevc_cancel').setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
          );

          await btn.reply({
            content: '🔇 VCでミュートするメンバーを選んでください。',
            components: [rowUsers, rowExec],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let pickedUsers: string[] = [];

          const sub = btn.channel!.createMessageComponentCollector({
            time: 60_000,
            filter: i => i.user.id === btn.user.id && i.message.id === (panel as any).id,
          });

          sub.on('collect', async (i) => {
            if (i.isUserSelectMenu() && i.customId === 'mutevc_users') {
              pickedUsers = i.values;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === 'mutevc_cancel') {
              await i.update({ content: 'キャンセルしました。', components: [] });
              sub.stop('cancel');
              return;
            }

            if (i.isButton() && i.customId === 'mutevc_exec') {
              if (!pickedUsers.length) {
                await i.reply({ content: 'ミュートするメンバーを選んでください。', ephemeral: true });
                return;
              }

              await i.deferUpdate();

              const g = i.guild!;
              const results: string[] = [];
              for (const uid of pickedUsers) {
                const m = await g.members.fetch(uid).catch(() => null);
                if (!m) {
                  results.push(`- <@${uid}>: 見つかりません`);
                  continue;
                }
                if (!m.voice?.channelId) {
                  results.push(`- ${m.displayName}: VC未参加`);
                  continue;
                }
                try {
                  await m.voice.setMute(true);
                  results.push(`- ${m.displayName}: ✅ ミュートしました`);
                } catch {
                  results.push(`- ${m.displayName}: ⚠️ 失敗（権限/接続状態を確認）`);
                }
              }

              try {
                await (panel as any).edit({ components: [] });
              } catch {}
              await i.followUp({
                content: `🔇 VCミュート結果\n${results.join('\n')}`,
                ephemeral: true,
                allowedMentions: { parse: [] },
              });
              sub.stop('done');
            }
          });

          sub.on('end', async () => {
            try {
              await (panel as any).edit({ components: [] });
            } catch {}
          });

          break;
        }

        /* --- VCミュート解除 --- */
        case 'menu_vcunmute': {
          const isAdmin = btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
          const canMute = btn.memberPermissions?.has(PermissionFlagsBits.MuteMembers) ?? false;
          const isDev = OWNER_IDS.includes(btn.user.id);
          if (!isAdmin && !canMute && !isDev) {
            await btn.reply({
              content: '⚠️ VCミュート解除は管理者/MuteMembers権限/開発者のみ使えます。',
              ephemeral: true,
            });
            break;
          }

          const rowUsers = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId('unmutevc_users')
              .setPlaceholder('ミュート解除するメンバーを選択（最大10人）')
              .setMinValues(1)
              .setMaxValues(10),
          );
          const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('unmutevc_exec').setLabel('ミュート解除を実行').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('unmutevc_cancel').setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
          );

          await btn.reply({
            content: '🔈 VCでミュート解除するメンバーを選んでください。',
            components: [rowUsers, rowExec],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let pickedUsers: string[] = [];

          const sub = btn.channel!.createMessageComponentCollector({
            time: 60_000,
            filter: i => i.user.id === btn.user.id && i.message.id === (panel as any).id,
          });

          sub.on('collect', async (i) => {
            if (i.isUserSelectMenu() && i.customId === 'unmutevc_users') {
              pickedUsers = i.values;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === 'unmutevc_cancel') {
              await i.update({ content: 'キャンセルしました。', components: [] });
              sub.stop('cancel');
              return;
            }

            if (i.isButton() && i.customId === 'unmutevc_exec') {
              if (!pickedUsers.length) {
                await i.reply({ content: 'ミュート解除するメンバーを選んでください。', ephemeral: true });
                return;
              }

              await i.deferUpdate();

              const g = i.guild!;
              const results: string[] = [];
              for (const uid of pickedUsers) {
                const m = await g.members.fetch(uid).catch(() => null);
                if (!m) {
                  results.push(`- <@${uid}>: 見つかりません`);
                  continue;
                }
                if (!m.voice?.channelId) {
                  results.push(`- ${m.displayName}: VC未参加`);
                  continue;
                }
                try {
                  await m.voice.setMute(false);
                  results.push(`- ${m.displayName}: ✅ ミュート解除しました`);
                } catch {
                  results.push(`- ${m.displayName}: ⚠️ 失敗（権限/接続状態を確認）`);
                }
              }

              try {
                await (panel as any).edit({ components: [] });
              } catch {}
              await i.followUp({
                content: `🔈 VCミュート解除結果\n${results.join('\n')}`,
                ephemeral: true,
                allowedMentions: { parse: [] },
              });
              sub.stop('done');
            }
          });

          sub.on('end', async () => {
            try {
              await (panel as any).edit({ components: [] });
            } catch {}
          });

          break;
        }

        /* --- メダルバンク --- */
        case 'menu_bank': {
          await btn.deferUpdate();
          const balance = await getMedalBalance(btn.user.id);
          await btn.followUp({
            content: `💰 あなたのメダル残高は **${balance} 枚** です。`,
            ephemeral: true,
          });
          break;
        }

        /* --- メダル管理 --- */
        case 'menu_admin': {
          const isAdmin = btn.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
          const isDev = OWNER_IDS.includes(btn.user.id);
          if (!isAdmin && !isDev) {
            await btn.reply({
              content: '⚠️ メダル管理は管理者/開発者のみ利用できます。',
              ephemeral: true,
            });
            break;
          }

          const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId('bank_user')
              .setPlaceholder('対象ユーザーを選択')
              .setMaxValues(1),
          );

          await btn.reply({
            content: 'メダル残高を変更するユーザーを選んでください。',
            components: [
              rowUser,
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('bank_set').setLabel('残高を設定').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('bank_add').setLabel('増減させる').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('bank_cancel').setLabel('キャンセル').setStyle(ButtonStyle.Danger),
              ),
            ],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let targetId: string | null = null;

          const sub = btn.channel!.createMessageComponentCollector({
            time: 60_000,
            filter: i => i.user.id === btn.user.id && i.message.id === (panel as any).id,
          });

          sub.on('collect', async (i) => {
            if (i.isUserSelectMenu() && i.customId === 'bank_user') {
              targetId = i.values[0] ?? null;
              await i.deferUpdate();
              return;
            }

            if (i.isButton() && i.customId === 'bank_cancel') {
              await i.update({ content: 'キャンセルしました。', components: [] });
              sub.stop('cancel');
              return;
            }

            if (i.isButton() && (i.customId === 'bank_set' || i.customId === 'bank_add')) {
              if (!targetId) {
                await i.reply({ content: '先に対象ユーザーを選択してください。', ephemeral: true });
                return;
              }

              const mode = i.customId === 'bank_set' ? 'set' : 'add';
              const modal = new ModalBuilder()
                .setCustomId(`bank_modal_${mode}`)
                .setTitle(mode === 'set' ? 'メダル残高を設定' : 'メダル残高を増減');

              modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                  new TextInputBuilder()
                    .setCustomId('value')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setLabel(
                      mode === 'set'
                        ? '新しい残高（0以上の整数）'
                        : '増減する枚数（+/- の整数）',
                    ),
                ),
              );

              await i.showModal(modal);

              const submitted = await i
                .awaitModalSubmit({
                  time: 60_000,
                  filter: m => m.user.id === i.user.id,
                })
                .catch(() => null);
              if (!submitted) return;

              const raw = submitted.fields.getTextInputValue('value');
              const num = Number(raw);
              if (!Number.isFinite(num)) {
                await submitted.reply({ content: '数値を入力してください。', ephemeral: true });
                return;
              }

              let after: number;
              if (mode === 'set') {
                after = await setMedals(targetId!, num);
              } else {
                after = await addMedals(targetId!, num);
              }

              const targetName = await displayNameFrom(submitted, targetId!);

              try {
                await (panel as any).edit({ components: [] });
              } catch {}

              await submitted.reply({
                content:
                  `💰 **${targetName}** のメダル残高を更新しました。\n` +
                  (mode === 'set'
                    ? `新しい残高: **${after} 枚**`
                    : `変化量: ${num >= 0 ? '+' : ''}${num} 枚 → 残高: **${after} 枚**`),
                ephemeral: true,
              });

              sub.stop('done');
            }
          });

          sub.on('end', async () => {
            try {
              await (panel as any).edit({ components: [] });
            } catch {}
          });

          break;
        }

        /* --- メダルランキング/送金 --- */
        case 'menu_medal_ranking': {
          await handleMedalRankingButton(btn);
          break;
        }
        case 'menu_medal_send': {
          await handleMedalSendButton(btn);
          break;
        }

        /* --- ヘルプ --- */
        case 'menu_help': {
          await btn.deferUpdate();
          await btn.followUp({
            embeds: [
              new EmbedBuilder()
                .setTitle('ヘルプ')
                .setDescription(
                  [
                    'このメニューから、ランキング/メンバー/統計/ルーム告知/上限設定/免除管理/値の直接設定/VC移動/VC切断/VCミュート/VCミュート解除/メダル機能 が使えます。',
                    '※ 上限設定・免除管理・値の直接設定・VC移動・VC切断・VCミュート・ミュート解除・メダル管理は 管理者 or OWNER_IDS で利用可。',
                    `現在の回数レンジ: **${sbkMin}〜${sbkMax}**`,
                  ].join('\n'),
                ),
            ],
            ephemeral: true,
          });
          break;
        }

        /* --- 閉じる --- */
        case 'menu_close': {
          await btn.deferUpdate();
          try {
            await btn.message.edit({
              content: '✅ メニューを閉じました。',
              components: disabledCopyOfRows(built.rows),
            });
          } catch {}
          collector.stop('close');
          break;
        }

        default: {
          // 何もしない（とりあえず更新だけしておく）
          await btn.deferUpdate().catch(() => {});
          break;
        }
      }
    } catch (e) {
      console.error('[menu] error', e);
    }
  });

  collector.on('end', async () => {
    try {
      await (msg as any).edit({ components: disabledCopyOfRows(built.rows) });
    } catch {}
  });
}
