// src/commands/menu.ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  ModalSubmitInteraction,
} from 'discord.js';

import { loadGuildStore, addCountGuild } from '../data';
import { SBK_MAX, SBK_MIN,SBK_OPTIONS } from '../config';

// ===== 共通ユーティリティ =====
const PAGE_SIZE = 10;

async function getDisplayNameFromId(
  i: ChatInputCommandInteraction | ButtonInteraction,
  userId: string
): Promise<string> {
  const g = i.guild;
  if (g) {
    const m = await g.members.fetch(userId).catch(() => null);
    if (m?.displayName) return m.displayName;
  }
  const u = await i.client.users.fetch(userId).catch(() => null);
  return u?.tag ?? userId;
}

async function displayName(
  g: ChatInputCommandInteraction['guild'] | null,
  userId: string
) {
  if (g) {
    const m = await g.members.fetch(userId).catch(() => null);
    if (m?.displayName) return m.displayName;
  }
  return (await g?.client.users.fetch(userId).catch(() => null))?.tag ?? userId;
}

// ===== メニューUI =====
function buildMenu() {
  const embed = new EmbedBuilder()
    .setTitle('しばくbot メニュー')
    .setDescription(
      '下のボタンから素早く操作できます（この表示は**あなたにだけ**見えます）。'
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('menu_top')
      .setLabel('ランキング')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('menu_members')
      .setLabel('メンバー一覧')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('menu_sbk')
      .setLabel('しばく')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('menu_room')
      .setLabel('ルーム告知')
      .setStyle(ButtonStyle.Success)
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('menu_help')
      .setLabel('ヘルプ')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu_close')
      .setLabel('閉じる')
      .setStyle(ButtonStyle.Danger)
  );

  return { embed, rows: [row1, row2, row3] };
}

// ===== 簡易 /top =====
async function buildTopEmbedForGuild(
  i: ChatInputCommandInteraction | ButtonInteraction
) {
  const gid = i.guildId!;
  const store = loadGuildStore(gid);
  const entries = Object.entries(store.counts);
  if (entries.length === 0) {
    return new EmbedBuilder()
      .setTitle('しばきランキング')
      .setDescription('まだ誰も しばかれていません。');
  }
  const sorted = entries.sort((a, b) => b[1] - a[1]).slice(0, PAGE_SIZE);

  const lines = await Promise.all(
    sorted.map(async ([uid, cnt], idx) => {
      const name = await getDisplayNameFromId(i, uid);
      const rank = idx + 1;
      return `#${rank} ${name} × **${cnt}**`;
    })
  );

  return new EmbedBuilder()
    .setTitle('しばきランキング')
    .setDescription(lines.join('\n'))
    .setFooter({
      text: `上位 ${PAGE_SIZE} を表示 • ${new Date().toLocaleString('ja-JP')}`,
    });
}

// ===== 簡易 /members =====
async function buildMembersEmbedForGuild(
  i: ChatInputCommandInteraction | ButtonInteraction
) {
  const gid = i.guildId!;
  const store = loadGuildStore(gid);
  const members = await i.guild!.members.fetch();
  const humans = members.filter((m) => !m.user.bot);

  const rows = await Promise.all(
    humans.map(async (m) => ({
      tag: m.displayName || m.user.tag,
      id: m.id,
      count: store.counts[m.id] ?? 0,
    }))
  );

  rows.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  const top = rows.slice(0, 20);
  const lines = top.map((r, idx) => `#${idx + 1} \`${r.tag}\` × **${r.count}**`);

  return new EmbedBuilder()
    .setTitle('全メンバーのしばかれ回数（BOT除外）')
    .setDescription(lines.join('\n') || 'メンバーがいません（または全員 0）')
    .setFooter({
      text: `合計 ${rows.length} 名 • ${new Date().toLocaleString('ja-JP')}`,
    });
}

// ==== 送信に使った rows を無効化して再利用 ====
function disabledCopyOfRows(rows: ActionRowBuilder<ButtonBuilder>[]) {
  return rows.map((r) => {
    const cloned = new ActionRowBuilder<ButtonBuilder>();
    const comps = r.components.map((c) => ButtonBuilder.from(c).setDisabled(true));
    cloned.addComponents(comps);
    return cloned;
  });
}

// ===== メイン処理 =====
export async function handleMenu(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'サーバー内で使ってね。', ephemeral: true });
    return;
  }

  const built = buildMenu();
  await interaction.reply({
    embeds: [built.embed],
    components: built.rows,
    ephemeral: true,
  });

  const msg = await interaction.fetchReply();

  const collector = interaction.channel!.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i) =>
      i.user.id === interaction.user.id && i.message.id === (msg as any).id,
  });

  collector.on('collect', async (btn) => {
    try {
      switch (btn.customId) {
        case 'menu_room': {
          // showModal の前に deferUpdate はしない
          const modal = new ModalBuilder()
            .setCustomId('menu_room_modal')
            .setTitle('ルーム告知');

          const game = new TextInputBuilder()
            .setCustomId('game')
            .setLabel('ゲーム名（例: PPR）')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(16);

          const area = new TextInputBuilder()
            .setCustomId('area')
            .setLabel('エリア番号（例: 156）')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(4);

          const pass = new TextInputBuilder()
            .setCustomId('pass')
            .setLabel('パスワード（例: 10005）')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(18);

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(game),
            new ActionRowBuilder<TextInputBuilder>().addComponents(area),
            new ActionRowBuilder<TextInputBuilder>().addComponents(pass)
          );

          await btn.showModal(modal);

          const submitted = await btn
            .awaitModalSubmit({
              time: 60_000,
              filter: (m: ModalSubmitInteraction) => m.user.id === btn.user.id,
            })
            .catch(() => null);

          if (!submitted) return;

          const g = submitted.fields.getTextInputValue('game').trim() || 'PPR';
          const a = Number(
            submitted.fields.getTextInputValue('area').trim() || '156'
          );
          const p = submitted.fields.getTextInputValue('pass').trim() || '10005';
          const shortPass = p.slice(0, 16);
          const areaNum = isNaN(a) ? 156 : a;

          await submitted.reply({
            content: `本日は **${g}** の **${areaNum}** で、**${shortPass}** で入れます。`,
            allowedMentions: { parse: [] },
          });
          break;
        }

        case 'menu_top': {
          await btn.deferUpdate();
          const topEmbed = await buildTopEmbedForGuild(btn);
          await btn.followUp({ embeds: [topEmbed], ephemeral: true });
          break;
        }

        case 'menu_members': {
          await btn.deferUpdate();
          const membersEmbed = await buildMembersEmbedForGuild(btn);
          await btn.followUp({ embeds: [membersEmbed], ephemeral: true });
          break;
        }

        case 'menu_help': {
          await btn.deferUpdate();
          await btn.followUp({ embeds: [new EmbedBuilder()
            .setTitle('ヘルプ')
            .setDescription(
              [
                '主なコマンド：',
                '• `/sbk @ユーザー 理由 [回数]` … しばく（回数は${SBK_MIN}～${SBK_MAX} 、理由は50文字まで）',
                '• `/check @ユーザー` … しばかれ回数を見る',
                '• `/top` … ランキングを表示',
                '• `/members` … 全メンバー一覧（CSV付き・自分だけ見える）',
                '• `/control` … しばかれ回数を直接設定（管理者/開発者）',
                '• `/immune add|remove|list` … 免除の追加/削除/表示（管理者/開発者）',
                '• `/menu` … このメニューを表示',
              ].join('\n')
            )], ephemeral: true });
          break;
        }

        case 'menu_sbk': {
          // 対象/回数 UI を1メッセージで
          const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId('sbk_pick_user')
              .setPlaceholder('しばく相手を選ぶ')
              .setMaxValues(1)
          );

            const rowCount = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(
              new StringSelectMenuBuilder()
              .setCustomId('sbk_pick_count')
              .setPlaceholder('回数を選ぶ')
              .addOptions(
                ...SBK_OPTIONS.map(n => ({
                label: `${n}回`,
                value: String(n)
                }))
              )
            );

          await btn.reply({
            content:
              'しばく対象と回数を選んで、最後に「理由を入力して実行」を押してください。',
            components: [
              rowUser,
              rowCount,
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId('sbk_exec')
                  .setLabel('理由を入力して実行')
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId('sbk_cancel')
                  .setLabel('キャンセル')
                  .setStyle(ButtonStyle.Secondary)
              ),
            ],
            ephemeral: true,
          });

          const panel = await btn.fetchReply();
          let pickedUserId: string | null = null;
          let pickedCount = 1;

          // ★ ここは複数種（UserSelect/StringSelect/Button）を扱うので
          // componentType は指定しない
          const sub = btn.channel!.createMessageComponentCollector({
            time: 60_000,
            filter: (i) =>
              i.user.id === btn.user.id && i.message.id === (panel as any).id,
          });

          sub.on('collect', async (i) => {
            if (i.isUserSelectMenu() && i.customId === 'sbk_pick_user') {
              pickedUserId = i.values[0] ?? null;
              await i.deferUpdate();
            } else if (i.isStringSelectMenu() && i.customId === 'sbk_pick_count') {
              pickedCount = Math.max(
                1,
                Math.min(20, Number(i.values[0] ?? 1))
              );
              await i.deferUpdate();
            } else if (i.isButton() && i.customId === 'sbk_cancel') {
              await i.update({ content: 'キャンセルしました。', components: [] });
              sub.stop('cancel');
            } else if (i.isButton() && i.customId === 'sbk_exec') {
              if (!pickedUserId) {
                await i.reply({ content: '相手を選んでください。', ephemeral: true });
                return;
              }

              // 理由モーダル
              const modal = new ModalBuilder()
                .setCustomId('sbk_modal')
                .setTitle('しばく理由');
              modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                  new TextInputBuilder()
                    .setCustomId('reason')
                    .setStyle(TextInputStyle.Paragraph)
                    .setLabel('理由（50文字まで）')
                    .setRequired(true)
                    .setMaxLength(50)
                )
              );
              await i.showModal(modal);

              const submitted = await i
                .awaitModalSubmit({
                  time: 60_000,
                  filter: (m: ModalSubmitInteraction) => m.user.id === i.user.id,
                })
                .catch(() => null);
              if (!submitted) return;

              const reason = submitted.fields.getTextInputValue('reason').trim();

              const gid = submitted.guildId!;
              const targetId = pickedUserId!;
              const countArg = pickedCount;

              
                const next = addCountGuild(gid, targetId, countArg);
                const name = await displayName(submitted.guild, targetId);

                // 元の小パネルを閉じる（エラーは無視）
                try {
                await (panel as any).edit({ components: [] });
                } catch {}

                // ★ モーダルへの最初の応答は reply() を使う（followUp や update はNG）
                await submitted.reply({
                content: `**${name}** が ${countArg} 回 しばかれました！（累計 ${next} 回）\n理由: ${reason}`,
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

        case 'menu_close': {
          await btn.deferUpdate();
          try {
            const disabledRows = disabledCopyOfRows(built.rows);
            await btn.message.edit({
              content: '✅ メニューを閉じました。',
              components: disabledRows,
            });
          } catch {}
          collector.stop('close');
          break;
        }

        default: {
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
      const disabledRows = disabledCopyOfRows(built.rows);
      await (msg as any).edit({ components: disabledRows }).catch(() => {});
    } catch {}
  });
}
