import { handleAiChatToggle } from "./aiChatToggleHandler";
import { openControlModal } from "./controlHandler";
import { handleImmuneMenu } from "./immuneHandler";
import { openLimitModal } from "./limitHandler";
import { handleMaintenanceToggle } from "./maintenanceHandler";
import { handleResetMenu } from "./resetHandler";
import { handleVoteAction } from "./voteHandler";
import type { MenuActionHandler } from "./context";

const NOT_SUNDAY_MESSAGE =
  "おまえら～ｗｗｗ曜日感覚大丈夫～～～？？？ｗｗｗ";
const MONDAY_TAUNT_MESSAGE = [
  "# 明日は月曜日♪",
  "# 月曜日♪",
  "# ルンルンルンルン月曜日♪",
  "# やったね！",
  "# 月曜日だ！",
  "# みんな元気に月曜日やっていこうね！",
  "# ムカムカしてもしょうがないよ！",
  "# だって明日は月曜日だもん！",
  "# ヤッター！",
  "# やったね！",
].join("\n");

function isSundayInJst(date: Date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(date);
  return weekday === "Sun";
}

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

const handleMondayAction: MenuActionHandler = async (_context, button) => {
  if (button.customId !== "menu_monday") return false;
  await button.deferUpdate();
  await button.followUp({
    content: isSundayInJst() ? MONDAY_TAUNT_MESSAGE : NOT_SUNDAY_MESSAGE,
  });
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

const handleAiChatToggleAction: MenuActionHandler = async (
  context,
  button,
) => {
  if (button.customId !== "menu_ai_chat") return false;
  return handleAiChatToggle(button, context.gid);
};

const handleVoteMenuAction: MenuActionHandler = async (_context, button) => {
  if (button.customId !== "menu_vs") return false;
  return handleVoteAction(button);
};

const MANAGEMENT_HANDLERS: readonly MenuActionHandler[] = [
  handleLimitAction,
  handleImmuneAction,
  handleControlAction,
  handleMondayAction,
  handleResetAction,
  handleMaintenanceAction,
  handleAiChatToggleAction,
  handleVoteMenuAction,
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
