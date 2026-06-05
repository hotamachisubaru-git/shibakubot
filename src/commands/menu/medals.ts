import { buildMedalCornerPanel } from "./medalPanel";
import { startMedalPanelSession } from "./medalSession";
import type { MenuActionHandler } from "./context";

export const handleMenuMedalsAction: MenuActionHandler = async (
  context,
  button,
) => {
  if (button.customId !== "menu_medals") {
    return false;
  }

  const panelState = buildMedalCornerPanel(context.gid, button.user.id);
  await button.reply({
    embeds: [panelState.embed],
    components: panelState.rows,
    flags: "Ephemeral",
  });

  const panel = await button.fetchReply();
  await startMedalPanelSession(
    context,
    button,
    panel,
    panelState.balance,
  );
  return true;
};
