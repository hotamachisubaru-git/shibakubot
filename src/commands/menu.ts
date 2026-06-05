import {
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { getGuildStatsSnapshot, getSbkRange } from "../data";
import {
  buildMenu,
  buildMenuHelpEmbed,
  disabledCopyOfRows,
  formatCountWithReading,
  getMenuPageByNavCustomId,
  guildMembersEmbed,
  guildTopEmbed,
  MENU_PAGE_DEFINITIONS,
  UNKNOWN_GUILD_MESSAGE,
} from "./menu/common";
import type { MenuActionContext, MenuRuntimeState } from "./menu/context";
import { handleMenuAdminAction } from "./menu/adminActions";
import { handleMenuManagementAction } from "./menu/managementActions";
import { handleMenuMedalsAction } from "./menu/medals";
import { handleMenuVoiceAction } from "./menu/voiceActions";

const EXTERNAL_MENU_HANDLERS = [
  handleMenuAdminAction,
  handleMenuManagementAction,
  handleMenuVoiceAction,
  handleMenuMedalsAction,
] as const;

export async function handleMenu(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "⚠️ このコマンドはサーバー内でのみ使用できます。",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const gid = interaction.guildId;
  if (!gid) {
    await interaction.reply({
      content: UNKNOWN_GUILD_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const range = getSbkRange(gid);
  const state: MenuRuntimeState = {
    sbkMin: range.min,
    sbkMax: range.max,
    currentPage: 1,
  };
  let built = buildMenu(state.sbkMin, state.sbkMax, state.currentPage);

  await interaction.reply({
    embeds: [built.embed],
    components: built.rows,
    flags: MessageFlags.Ephemeral,
  });

  const menuMessage = await interaction.fetchReply();
  const channel = interaction.channel;
  if (!channel) {
    await interaction.editReply({
      content: "⚠️ チャンネル情報を取得できませんでした。",
      components: [],
    });
    return;
  }

  const refreshMenu = async (): Promise<void> => {
    built = buildMenu(state.sbkMin, state.sbkMax, state.currentPage);
    await interaction.editReply({
      embeds: [built.embed],
      components: built.rows,
    });
  };

  const context: MenuActionContext = {
    interaction,
    gid,
    state,
    refreshMenu,
    setPage: async (page) => {
      state.currentPage = Math.max(
        1,
        Math.min(MENU_PAGE_DEFINITIONS.length, page),
      );
      await refreshMenu();
    },
  };

  const collector = channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 300_000,
    filter: (component) =>
      component.user.id === interaction.user.id &&
      component.message.id === menuMessage.id,
  });

  collector.on("collect", async (button) => {
    try {
      if (
        button.customId === "menu_page_prev" ||
        button.customId === "menu_page_next" ||
        button.customId.startsWith("menu_page_")
      ) {
        await button.deferUpdate();

        if (button.customId === "menu_page_prev") {
          state.currentPage = Math.max(1, state.currentPage - 1);
        } else if (button.customId === "menu_page_next") {
          state.currentPage = Math.min(
            MENU_PAGE_DEFINITIONS.length,
            state.currentPage + 1,
          );
        } else {
          const nextPage = getMenuPageByNavCustomId(button.customId);
          if (!nextPage) {
            return;
          }
          state.currentPage = nextPage.page;
        }

        await refreshMenu();
        return;
      }

      if (button.customId === "menu_top") {
        await button.deferUpdate();
        await button.followUp({
          embeds: [await guildTopEmbed(button)],
          flags: "Ephemeral",
        });
        return;
      }

      if (button.customId === "menu_members") {
        await button.deferUpdate();
        await button.followUp({
          embeds: [await guildMembersEmbed(button)],
          flags: "Ephemeral",
        });
        return;
      }

      if (button.customId === "menu_stats") {
        await button.deferUpdate();
        const snapshot = getGuildStatsSnapshot(gid);
        await button.followUp({
          embeds: [
            new EmbedBuilder().setTitle("サーバー統計").addFields(
              {
                name: "総しばき回数",
                value: formatCountWithReading(snapshot.total),
                inline: true,
              },
              {
                name: "対象人数",
                value: String(snapshot.members),
                inline: true,
              },
              {
                name: "免除ユーザー",
                value: String(snapshot.immune),
                inline: true,
              },
            ),
          ],
          flags: "Ephemeral",
        });
        return;
      }

      if (button.customId === "menu_help") {
        await button.deferUpdate();
        await button.followUp({
          embeds: [buildMenuHelpEmbed(state.sbkMin, state.sbkMax)],
          flags: "Ephemeral",
        });
        return;
      }

      if (button.customId === "menu_close") {
        await button.deferUpdate();
        try {
          await button.message.edit({
            content: "✅ メニューを閉じました。",
            components: disabledCopyOfRows(built.rows),
          });
        } catch {
          // noop
        }
        collector.stop("close");
        return;
      }

      for (const handler of EXTERNAL_MENU_HANDLERS) {
        if (await handler(context, button)) {
          return;
        }
      }

      await button.deferUpdate().catch(() => {});
    } catch (error) {
      console.error("[menu] error", error);
    }
  });

  collector.on("end", async () => {
    try {
      await menuMessage.edit({ components: disabledCopyOfRows(built.rows) });
    } catch {
      // noop
    }
  });
}
