import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import { getUserCount } from "../../data";
import { displayNameFrom } from "../../utils/displayNameUtil";
import {
  bindPanelCleanup,
  createPanelCollector,
  formatCountWithReading,
} from "./common";
import { openControlModal } from "./controlHandler";
import { handleImmuneMenu } from "./immuneHandler";
import { openLimitModal } from "./limitHandler";
import { handleMaintenanceToggle } from "./maintenanceHandler";
import { handleResetMenu } from "./resetHandler";
import type { MenuActionHandler } from "./context";

const handleLimitAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_limit") return false;
  return openLimitModal(
    button,
    context.gid,
    BigInt(context.state.sbkMin),
    BigInt(context.state.sbkMax),
    async (min, max) => {
      context.state.sbkMin = min;
      context.state.sbkMax = max;
      await context.refreshMenu().catch(() => undefined);
    },
  );
};

const handleImmuneAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_immune") return false;
  return handleImmuneMenu(button, context.gid, context.refreshMenu);
};

const handleControlAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_control") return false;
  return openControlModal(button, context.gid, context.refreshMenu);
};

const handleCheckAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_check") return false;

  const rowUser = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId("check_user")
      .setPlaceholder("回数を確認するユーザー")
      .setMaxValues(1),
  );
  const rowExec = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("check_exec")
      .setLabel("確認")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("check_cancel")
      .setLabel("キャンセル")
      .setStyle(ButtonStyle.Secondary),
  );

  await button.reply({
    content: "回数を確認するユーザーを選んでください。",
    components: [rowUser, rowExec],
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  let targetUserId: string | null = null;
  const sub = createPanelCollector(button, panel);

  sub.on("collect", async (component) => {
    if (component.isUserSelectMenu() && component.customId === "check_user") {
      targetUserId = component.values[0] ?? null;
      await component.deferUpdate();
      return;
    }

    if (component.isButton() && component.customId === "check_cancel") {
      await component.update({ content: "キャンセルしました。", components: [] });
      sub.stop("cancel");
      return;
    }

    if (component.isButton() && component.customId === "check_exec") {
      if (!targetUserId) {
        await component.reply({
          content: "対象ユーザーを選んでください。",
          flags: "Ephemeral",
        });
        return;
      }

      const count = getUserCount(context.gid, targetUserId);
      const displayName = await displayNameFrom(component, targetUserId);
      await component.update({
        content: `**${displayName}** は今までに ${formatCountWithReading(count)} しばかれました。`,
        components: [],
        allowedMentions: { parse: [] },
      });
      sub.stop("done");
    }
  });

  bindPanelCleanup(sub, panel);
  return true;
};

const handleResetAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_reset") return false;
  return handleResetMenu(button, context.gid);
};

const handleMaintenanceAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_maintenance") return false;
  return handleMaintenanceToggle(button, context.gid);
};

const MANAGEMENT_HANDLERS: readonly MenuActionHandler[] = [
  handleLimitAction,
  handleImmuneAction,
  handleControlAction,
  handleCheckAction,
  handleResetAction,
  handleMaintenanceAction,
];

export const handleMenuManagementAction: MenuActionHandler = async (
  context,
  button,
) => {
  for (const handler of MANAGEMENT_HANDLERS) {
    if (await handler(context, button)) {
      return true;
    }
  }
  return false;
};
