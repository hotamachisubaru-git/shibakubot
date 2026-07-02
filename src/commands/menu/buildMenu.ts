// src/commands/menu/buildMenu.ts
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { safeCount } from "./format";
import { getMenuPageDefinition, MENU_PAGE_DEFINITIONS, MenuPageDefinition } from "./menuPageDefs";

function buildActionSummary(pageDefinition: MenuPageDefinition): string {
  return pageDefinition.actions
    .map((action, index) => `${index + 1}. **${action.label}**: ${action.summary}`)
    .join("\n");
}

function buildActionRows(pageDefinition: MenuPageDefinition) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let start = 0; start < pageDefinition.actions.length; start += 5) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...pageDefinition.actions.slice(start, start + 5).map((action) =>
          new ButtonBuilder()
            .setCustomId(action.customId)
            .setLabel(action.label)
            .setStyle(action.style),
        ),
      ),
    );
  }
  return rows;
}

export function buildMenuHelpEmbed(min: number, max: number): EmbedBuilder {
  const maxPage = MENU_PAGE_DEFINITIONS.length;
  const embed = new EmbedBuilder()
    .setTitle("メニューガイド")
    .setDescription(
      [
        "`/menu` はしばき管理と保守作業を用途ごとに分けています。",
        "迷ったらまず `基本` を開き、下の矢印ボタンで各ページへ移動してください。",
        `現在のしばく回数レンジ: **${safeCount(BigInt(min))}〜${safeCount(BigInt(max))}回**`,
      ].join("\n"),
    )
    .setFooter({ text: "搭載コマンドは /sbk 関連と /menu に限定されています。" });

  embed.addFields(
    ...MENU_PAGE_DEFINITIONS.map((pageDefinition) => ({
      name: `${pageDefinition.navLabel} (${pageDefinition.page}/${maxPage})`,
      value: [
        pageDefinition.summary,
        buildActionSummary(pageDefinition),
        `権限: ${pageDefinition.permissionNote}`,
      ].join("\n"),
    })),
  );

  return embed;
}

export function buildMenu(min: number, max: number, page: number = 1) {
  const currentPage = getMenuPageDefinition(page);
  const maxPage = MENU_PAGE_DEFINITIONS.length;

  const embed = new EmbedBuilder()
    .setTitle(`しばくbot メニュー | ${currentPage.title}`)
    .setDescription(
      [
        "用途ごとにページを分けています（この表示は**あなたにだけ**見えます）。",
        currentPage.summary,
        `現在のしばく回数: **${safeCount(BigInt(min))}〜${safeCount(BigInt(max))}回**`,
        `表示カテゴリ: **${currentPage.navLabel} (${currentPage.page}/${maxPage})**`,
      ].join("\n"),
    )
    .addFields(
      { name: "このページでできること", value: buildActionSummary(currentPage) },
      { name: "利用権限", value: currentPage.permissionNote },
    );

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  rows.push(...buildActionRows(currentPage));

  const navButtons = [
    new ButtonBuilder()
      .setCustomId("menu_page_prev")
      .setLabel("←")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage.page <= 1),
    new ButtonBuilder()
      .setCustomId(currentPage.navCustomId)
      .setLabel(`${currentPage.navLabel} ${currentPage.page}/${maxPage}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("menu_page_next")
      .setLabel("→")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage.page >= maxPage),
    new ButtonBuilder()
      .setCustomId("menu_close")
      .setLabel("閉じる")
      .setStyle(ButtonStyle.Danger),
  ];

  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...navButtons));

  return { embed, rows };
}
