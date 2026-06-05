import { handleAuditAction } from "./adminAudit";
import { handleBackupAction } from "./adminBackup";
import { handleDevtoolsAction } from "./adminDevtools";
import { handleSettingsAction } from "./adminSettings";
import { handleSystemStatsAction } from "./adminStats";
import type { MenuActionHandler } from "./context";

const ADMIN_HANDLERS: readonly MenuActionHandler[] = [
  handleAuditAction,
  handleSettingsAction,
  handleDevtoolsAction,
  handleSystemStatsAction,
  handleBackupAction,
];

export const handleMenuAdminAction: MenuActionHandler = async (
  context,
  button,
) => {
  for (const handler of ADMIN_HANDLERS) {
    if (await handler(context, button)) {
      return true;
    }
  }

  return false;
};
