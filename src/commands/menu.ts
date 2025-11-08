// src/commands/menu.ts
import {
  ActionRow,
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
  type MessageActionRowComponent,
  type TopLevelComponent,
} from "discord.js";

import { loadGuildStore } from "../data";

// 他コマンド参照
import { handleTop } from "./top";
import { handleMembers } from "./members";
import { handleRoom } from "./daimongamecenter";
import { handleHelp } from "./help";

// ===== 共通ユーティリティ =====
const PAGE_SIZE = 10;

function isMessageActionRow(
  component: TopLevelComponent
): component is ActionRow<MessageActionRowComponent> {
  return component.type === ComponentType.ActionRow;
}

function cloneDisabledButtonRows(
  components?: readonly TopLevelComponent[]
) {
  if (!components?.length) return [];

  return components
    .filter(isMessageActionRow)
    .map((row) => {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>();
      for (const component of row.components) {
        if (component.type !== ComponentType.Button) continue;
        disabledRow.addComponents(
          ButtonBuilder.from(component.toJSON()).setDisabled(true)
        );
      }
      return disabledRow;
    });
}

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

// ===== メニューのレイアウト =====
function buildMenu() {
  const embed = new EmbedBuilder()
    .setTitle("しばくbot メニュー")
    .setDescription(
      "下のボタンから素早く操作できます（この表示は**あなたにだけ**見えます）。"
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("menu_top")
      .setLabel("ランキング")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("menu_members")
      .setLabel("メンバー一覧")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("menu_sbk")
      .setLabel("しばく")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("menu_room")
      .setLabel("ルーム告知")
      .setStyle(ButtonStyle.Success)
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("menu_help")
      .setLabel("ヘルプ")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("menu_close")
      .setLabel("閉じる")
      .setStyle(ButtonStyle.Danger)
  );

  return { embed, rows: [row1, row2, row3] };
}

// ===== 簡易版 /top 表示 =====
async function buildTopEmbedForGuild(
  i: ChatInputCommandInteraction | ButtonInteraction
) {
  const gid = i.guildId!;
  const store = loadGuildStore(gid);
  const entries = Object.entries(store.counts);
  if (entries.length === 0) {
    return new EmbedBuilder()
      .setTitle("しばきランキング")
      .setDescription("まだ誰も しばかれていません。");
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
    .setTitle("しばきランキング")
    .setDescription(lines.join("\n"))
    .setFooter({
      text: `上位 ${PAGE_SIZE} を表示 • ${new Date().toLocaleString("ja-JP")}`,
    });
}

// ===== 簡易版 /members 表示 =====
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
    .setTitle("全メンバーのしばかれ回数（BOT除外）")
    .setDescription(lines.join("\n") || "メンバーがいません（または全員 0）")
    .setFooter({
      text: `合計 ${rows.length} 名 • ${new Date().toLocaleString("ja-JP")}`,
    });
}

// ===== 簡易版 /help =====
function buildHelpEmbed() {
  return new EmbedBuilder()
    .setTitle("ヘルプ")
    .setDescription(
      [
        "主なコマンド：",
        "• `/sbk @ユーザー 理由 [回数]` … しばく（回数は1〜20、理由は50文字まで）",
        "• `/check @ユーザー` … しばかれ回数を見る",
        "• `/top` … ランキングを表示",
        "• `/members` … 全メンバー一覧（CSV付き・自分だけ見える）",
        "• `/control` … しばかれ回数を直接設定（管理者/開発者）",
        "• `/immune add|remove|list` … 免除の追加/削除/表示（管理者/開発者）",
        "• `/menu` … このメニューを表示",
      ].join("\n")
    );
}

// ==== 追加: 行を無効化するヘルパー（送信に使った rows をそのまま加工） ====
function disabledCopyOfRows(rows: ActionRowBuilder<ButtonBuilder>[]) {
  return rows.map((r) => {
    const cloned = new ActionRowBuilder<ButtonBuilder>();
    // r.components は ButtonBuilder[] として安全に参照できる
    const comps = r.components.map((c) => ButtonBuilder.from(c).setDisabled(true));
    cloned.addComponents(comps);
    return cloned;
  });
}

// ===== メイン処理 =====
export async function handleMenu(interaction: ChatInputCommandInteraction) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: "サーバー内で使ってね。", ephemeral: true });
    return;
  }

  const built = buildMenu();
  // 送信（この rows を後で使い回す）
  await interaction.reply({
    embeds: [built.embed],
    components: built.rows,
    ephemeral: true,
  });

  const msg = await interaction.fetchReply();

  const collector = interaction.channel!.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i) => i.user.id === interaction.user.id && i.message.id === (msg as any).id,
  });

  collector.on("collect", async (btn) => {
    try {
      switch (btn.customId) {
        case "menu_room": {
          // showModal の前に deferUpdate をしない
          const modal = new ModalBuilder()
            .setCustomId("menu_room_modal")
            .setTitle("ルーム告知");

          const game = new TextInputBuilder()
            .setCustomId("game")
            .setLabel("ゲーム名（例: PPR）")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(16);

          const area = new TextInputBuilder()
            .setCustomId("area")
            .setLabel("エリア番号（例: 156）")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(4);

          const pass = new TextInputBuilder()
            .setCustomId("pass")
            .setLabel("パスワード（例: 10005）")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(18);

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(game),
            new ActionRowBuilder<TextInputBuilder>().addComponents(area),
            new ActionRowBuilder<TextInputBuilder>().addComponents(pass),
          );

          await btn.showModal(modal);

          const submitted = await btn
            .awaitModalSubmit({
              time: 60_000,
              filter: (m) => m.user.id === btn.user.id,
            })
            .catch(() => null);

          if (!submitted) return;

          const g = submitted.fields.getTextInputValue("game").trim() || "PPR";
          const a = Number(submitted.fields.getTextInputValue("area").trim() || "156");
          const p = submitted.fields.getTextInputValue("pass").trim() || "10005";
          const shortPass = p.slice(0, 16);
          const areaNum = isNaN(a) ? 156 : a;

          await submitted.reply({
            content: `本日は **${g}** の **${areaNum}** で、**${shortPass}** で入れます。`,
            allowedMentions: { parse: [] },
            // ephemeral: true, // 自分だけに見せたいなら有効化
          });
          break;
        }

        case "menu_top": {
          await btn.deferUpdate();
          const topEmbed = await buildTopEmbedForGuild(btn);
          await btn.followUp({ embeds: [topEmbed], ephemeral: true });
          break;
        }

        case "menu_members": {
          await btn.deferUpdate();
          const membersEmbed = await buildMembersEmbedForGuild(btn);
          await btn.followUp({ embeds: [membersEmbed], ephemeral: true });
          break;
        }

        case "menu_help": {
          await btn.deferUpdate();
          await btn.followUp({ embeds: [buildHelpEmbed()], ephemeral: true });
          break;
        }

        case "menu_sbk": {
          await btn.deferUpdate();
          await btn.followUp({
            content:
              "「しばく」は `/sbk @ユーザー 理由 [回数]` を使ってね（回数は1〜20・理由は50文字まで）。",
            ephemeral: true,
          });
          break;
        }

        case "menu_close": {
          await btn.deferUpdate();
          try {
            const disabledRows = disabledCopyOfRows(built.rows);
            await btn.message.edit({
              content: "✅ メニューを閉じました。",
              components: disabledRows,
            });
          } catch {}
          collector.stop("close");
          break;
        }

        default: {
          await btn.deferUpdate().catch(() => {});
          break;
        }
      }
    } catch (e) {
      console.error("[menu] error", e);
    }
  });

  collector.on("end", async () => {
    try {
      const disabledRows = disabledCopyOfRows(built.rows);
      await (msg as any).edit({ components: disabledRows }).catch(() => {});
    } catch {}
  });
}
