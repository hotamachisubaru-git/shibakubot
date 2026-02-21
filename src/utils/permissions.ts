import { PermissionFlagsBits } from "discord.js";

type PermissionProbe = Readonly<{
  has: (permission: bigint) => boolean;
}>;

type UserProbe = Readonly<{
  id: string;
}>;

type GuildProbe = Readonly<{
  ownerId: string;
}>;

type AdminProbe = Readonly<{
  memberPermissions: PermissionProbe | null | undefined;
}>;

type AdminOrDevProbe = Readonly<{
  memberPermissions: PermissionProbe | null | undefined;
  user: UserProbe;
}>;

type AdminGuildOwnerOrDevProbe = Readonly<{
  memberPermissions: PermissionProbe | null | undefined;
  user: UserProbe;
  guild: GuildProbe | null | undefined;
}>;

export function hasAdministratorPermission(probe: AdminProbe): boolean {
  return probe.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}

export function hasAdminOrDevPermission(
  probe: AdminOrDevProbe,
  ownerIds: ReadonlySet<string>,
): boolean {
  return hasAdministratorPermission(probe) || ownerIds.has(probe.user.id);
}

export function hasAdminGuildOwnerOrDevPermission(
  probe: AdminGuildOwnerOrDevProbe,
  ownerIds: ReadonlySet<string>,
): boolean {
  const isGuildOwner = probe.guild?.ownerId === probe.user.id;
  return hasAdministratorPermission(probe) || isGuildOwner || ownerIds.has(probe.user.id);
}
