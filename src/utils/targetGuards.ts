type TargetUserProbe = Readonly<{
  id: string;
  bot: boolean;
}>;

export function isBotOrSelfTarget(
  target: TargetUserProbe,
  clientUserId: string | null | undefined,
): boolean {
  return target.bot || target.id === clientUserId;
}

export function isOwnerTarget(
  targetUserId: string,
  ownerIds: ReadonlySet<string>,
): boolean {
  return ownerIds.has(targetUserId);
}
