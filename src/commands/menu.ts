// src/commands/menu.ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';

import {
  addCountGuild,
  isImmune,
} from '../data';

// ────────────────────────────────────────────────────────────────
// メニュー本体
// ────────────────────────────────────────────────────────────────
export async function handleMenu(interaction: ChatInputCommandInteraction) {
  // メニューメッセージ（ephemeral）
  const embed = new EmbedBuilder()
    .setTitle('しばくbot メニュー')
    .setDescription('下のボタンから素早く操作できます（この表示は**あなたにだけ**見えます）。');

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('menu_top').setLabel('ランキング').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('menu_members').setLabel('メンバー一覧').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    // 追加：UIからしばく
    new ButtonBuilder().setCustomId('menu_sbk').setLabel('しばく').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('menu_room').setLabel('ルーム告知').setStyle(ButtonStyle.Success),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('menu_help').setLabel('ヘルプ').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_close').setLabel('閉じる').setStyle(ButtonStyle.Danger),
  );

  const msg = await interaction.reply({
    embeds: [embed],
    components: [row1, row2, row3],
    ephemeral: true,
    fetchReply: true,
  });

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i) => i.user.id === interaction.user.id,
  });

  collector.on('collect', async (btn) => {
    switch (btn.customId) {
      case 'menu_top':
        await btn.reply({ content: '💡 `/top` を使ってください。', ephemeral: true });
        break;
      case 'menu_members':
        await btn.reply({ content: '💡 `/members` を使ってください。（CSV付きで自分だけに表示）', ephemeral: true });
        break;
      case 'menu_help':
        await btn.reply({ content: '💡 `/help` を実行してください。', ephemeral: true });
        break;
      case 'menu_room':
        await btn.reply({ content: '💡 `/room` で告知文を作れます。', ephemeral: true });
        break;
      case 'menu_close':
        try {
          await btn.update({ components: disableAll(msg.components) });
        } catch {}
        collector.stop('closed');
        break;
      case 'menu_sbk':
        await startSbkFlow(btn);
        break;
    }
  });

  collector.on('end', async () => {
    try { await msg.edit({ components: disableAll(msg.components) }); } catch {}
  });
}

// ────────────────────────────────────────────────────────────────
// 「UIでしばく」フロー
// 1) 対象ユーザー選択 + 回数選択（1〜10）
// 2) 理由入力（モーダル）
// 3) 実行
// ────────────────────────────────────────────────────────────────

type Draft = { userId?: string; count: number };
const drafts = new Map<string, Draft>(); // key = initiator user id

async function startSbkFlow(btn: ButtonInteraction) {
  const who = btn.user.id;
  drafts.set(who, { count: 1 });

  // 対象ユーザー選択
  const userPick = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('sbk_pick_user')
      .setPlaceholder('対象ユーザーを選択')
      .setMinValues(1)
      .setMaxValues(1),
  );

  // 回数（1〜10）
  const countMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('sbk_pick_count')
      .setPlaceholder('回数を選択（既定1）')
      .addOptions(
        ...Array.from({ length: 10 }, (_, i) =>
          new StringSelectMenuOptionBuilder().setLabel(`${i + 1} 回`).setValue(String(i + 1)),
        ),
      ),
  );

  const rowBtn = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('sbk_open_reason').setLabel('理由を入力して実行').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('sbk_cancel').setLabel('キャンセル').setStyle(ButtonStyle.Secondary),
  );

  await btn.reply({
    content: '🎯 しばく対象と回数を選び、最後に「理由を入力して実行」を押してください。',
    components: [userPick, countMenu, rowBtn],
    ephemeral: true,
  });

  const reply = await btn.fetchReply();

  // 以降、このメッセージに対する操作を収集
  const compCollector = reply.createMessageComponentCollector({
    time: 120_000,
    filter: (i) => i.user.id === who,
  });

  compCollector.on('collect', async (i) => {
    try {
      if (i.isUserSelectMenu() && i.customId === 'sbk_pick_user') {
        drafts.set(who, { ...(drafts.get(who) ?? { count: 1 }), userId: i.values[0] });
        await i.reply({ content: `✅ 対象: <@${i.values[0]}>`, ephemeral: true, allowedMentions: { parse: [] } });
      } else if (i.isStringSelectMenu() && i.customId === 'sbk_pick_count') {
        const n = Math.max(1, Math.min(10, Number(i.values[0] ?? '1')));
        drafts.set(who, { ...(drafts.get(who) ?? { count: 1 }), count: n });
        await i.reply({ content: `✅ 回数: ${n} 回`, ephemeral: true });
      } else if (i.isButton() && i.customId === 'sbk_cancel') {
        drafts.delete(who);
        await i.update({ content: 'キャンセルしました。', components: disableAll(reply.components) });
        compCollector.stop('cancel');
      } else if (i.isButton() && i.customId === 'sbk_open_reason') {
        const d = drafts.get(who) ?? { count: 1 };
        if (!d.userId) {
          await i.reply({ content: '⚠️ 先に「対象ユーザー」を選択してください。', ephemeral: true });
          return;
        }
        // モーダルで理由入力
        const modal = new ModalBuilder().setCustomId('sbk_reason_modal').setTitle('しばく理由の入力');
        const reason = new TextInputBuilder()
          .setCustomId('sbk_reason')
          .setLabel('理由（必須）')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(1)
          .setMaxLength(50)
          .setPlaceholder('例：寝坊した など');
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason));
        await i.showModal(modal);

        // モーダル完了待ち → 実行
        const submitted = await i.awaitModalSubmit({
          time: 120_000,
          filter: (m) => m.user.id === who && m.customId === 'sbk_reason_modal',
        }).catch(() => null);

        if (!submitted) return;

        const reasonText = submitted.fields.getTextInputValue('sbk_reason')?.trim() ?? '';
        await runSbk(submitted, d.userId!, d.count, reasonText);
        drafts.delete(who);
        compCollector.stop('done');
      }
    } catch (e) {
      console.error('[menu sbk flow]', e);
      try { await i.reply({ content: 'エラーが発生しました。', ephemeral: true }); } catch {}
    }
  });

  compCollector.on('end', async () => {
    try { await (await btn.fetchReply()).edit({ components: disableAll((await btn.fetchReply()).components) }); } catch {}
  });
}

// 実際の「しばく」実行（/sbk と同等の処理）
async function runSbk(
  submitted: ModalSubmitInteraction,
  targetUserId: string,
  countArg: number,
  reason: string,
) {
  const g = submitted.guild!;
  const gid = g.id;

  // 免除
  if (isImmune(gid, targetUserId)) {
    await submitted.reply({ content: 'このユーザーはしばき免除です。', ephemeral: true });
    return;
  }

  const member = await g.members.fetch(targetUserId).catch(() => null);
  const display = member?.displayName ?? (await submitted.client.users.fetch(targetUserId).catch(() => null))?.tag ?? targetUserId;

  const added = addCountGuild(gid, targetUserId, Math.max(1, Math.min(10, countArg)));
  await submitted.reply({
    content: `**${display}** が ${countArg} 回 しばかれました！（累計 ${added} 回）\n理由: ${reason}`,
    ephemeral: true,
    allowedMentions: { parse: [] },
  });
}

// 全ボタン無効化ユーティリティ
function disableAll(rows: readonly any[]) {
  return rows.map((r) => {
    const row = ActionRowBuilder.from(r) as ActionRowBuilder<ButtonBuilder>;
    row.components.forEach((c: any) => c.setDisabled(true));
    return row;
  });
}
