import { Message, PermissionFlagsBits } from "discord.js";
import { hasAdminGuildOwnerOrDevPermission } from "../../utils/permissions";
import { OWNER_IDS } from "./constants";

export function canManageMusic(message: Message): boolean {
  return hasAdminGuildOwnerOrDevPermission(
    {
      memberPermissions: message.member?.permissions ?? null,
      user: message.author,
      guild: message.guild,
    },
    OWNER_IDS,
  );
}
