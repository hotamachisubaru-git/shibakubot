// src/commands/medal.ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';

import {
  getMedalBalance,
  addMedals,
  setMedals,
  getTopMedals,
} from '../data';
import { parseBigIntInput } from '../utils/bigint';

/* ユーザーID → ニックネーム(あれば) / tag の簡易ユーティリティ */
async function displayNameFromInteraction(
  i: ButtonInteraction | ModalSubmitInteraction,
  userId: string
): Promise<string> {
  const g = i.guild;
  if (g) {
    const m = await g.members.fetch(userId).catch(() => null);
    if (m?.displayName) return m.displayName;
    if (m?.user?.tag) return m.user.tag;
  }
  return `<@${userId}>`;
}

/* ===========================
 *  メダルランキング（ボタン用）
 * =========================== */
export async function handleMedalRankingButton(btn: ButtonInteraction) {
  await btn.deferUpdate();

  const rows = await getTopMedals(20);
  if (!rows.length) {
    await btn.followUp({
      content: 'まだメダルデータがありません。',
      ephemeral: true,
    });
    return;
  }

  const lines: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = await displayNameFromInteraction(btn, r.userId);
    lines.push(`#${i + 1} **${name}** — ${r.balance} 枚`);
  }

  await btn.followUp({
    embeds: [
      new EmbedBuilder()
        .setTitle('💰 メダルランキング TOP20')
        .setDescription(lines.join('\n')),
    ],
    ephemeral: true,
  });
}

/* ===========================
 *  メダル送金（ボタン用）
 * =========================== */
export async function handleMedalSendButton(btn: ButtonInteraction) {
  await btn.deferUpdate();

  // 1: 送金相手を選択させる
  const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('medal_send_user')
      .setPlaceholder('送金相手を選択')
      .setMaxValues(1),
  );

  const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('medal_send_exec')
      .setLabel('送金する')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('medal_send_cancel')
      .setLabel('キャンセル')
      .setStyle(ButtonStyle.Secondary),
  );

  await btn.followUp({
    content: '💱 送金相手を選んでください。',
    components: [rowUser, rowButtons],
    ephemeral: true,
  });

  const panel = await btn.fetchReply();
  let targetId: string | null = null;

  const sub = btn.channel!.createMessageComponentCollector({
    time: 60_000,
    filter: (i) =>
      i.user.id === btn.user.id && i.message.id === (panel as any).id,
  });

  sub.on('collect', async (i) => {
    // 送金相手選択
    if (i.isUserSelectMenu() && i.customId === 'medal_send_user') {
      targetId = i.values[0] ?? null;
      await i.deferUpdate();
      return;
    }

    // キャンセル
    if (i.isButton() && i.customId === 'medal_send_cancel') {
      await i.update({ content: 'キャンセルしました。', components: [] });
      sub.stop('cancel');
      return;
    }

    // 実行
    if (i.isButton() && i.customId === 'medal_send_exec') {
      if (!targetId) {
        await i.reply({
          content: '送金相手を選択してください。',
          ephemeral: true,
        });
        return;
      }

    
      // 金額入力モーダル
      const modal = new ModalBuilder()
        .setCustomId('medal_send_modal')
        .setTitle('送金するメダル数を入力');

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('value')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setLabel('送金する枚数（1以上の整数）'),
        ),
      );

      await i.showModal(modal);

      const submitted = await i
        .awaitModalSubmit({
          time:60_000,
          filter: (m) => m.user.id === i.user.id,
        })
        .catch(() => null);
      if (!submitted) return;
        
       
      const raw = submitted.fields.getTextInputValue('value');
      const amount = parseBigIntInput(raw);
      if (amount === null || amount <= 0n) {
        await submitted.reply({
          content: '1以上の整数を入力してください。',
          ephemeral: true,
        });
        return;
      }

      // 残高チェック
      const fromId = btn.user.id;
      const fromBalance = await getMedalBalance(fromId);

      if (fromBalance < amount) {
        await submitted.reply({
          content: `❌ 残高不足です。（あなたの残高: ${fromBalance} 枚）`,
          ephemeral: true,
        });
        return;
      }

      // 送金処理
      await setMedals(fromId, fromBalance - amount);
      const toAfter = await addMedals(targetId!, amount);

      const toName = await displayNameFromInteraction(submitted, targetId!);
      const meName = await displayNameFromInteraction(submitted, fromId);

      try {
        await (panel as any).edit({ components: [] });
      } catch {}

      await submitted.reply({
        content:
          `💱 送金完了！\n` +
          `送り主: **${meName}**\n` +
          `送り先: **${toName}**\n` +
          `送金額: **${amount} 枚**\n` +
          `あなたの残高: **${fromBalance - amount} 枚**\n` +
          `${toName} の残高: **${toAfter} 枚**`,
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
}
