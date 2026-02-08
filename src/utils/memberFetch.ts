import type { Collection, Guild, GuildMember } from "discord.js";

export type MemberFetchResult = {
  readonly members: Collection<string, GuildMember>;
  readonly fromCache: boolean;
};

function isGuildMembersTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "GuildMembersTimeout";
}

export async function fetchGuildMembersSafe(
  guild: Guild,
): Promise<MemberFetchResult> {
  try {
    const members = await guild.members.fetch();
    return { members, fromCache: false };
  } catch (error: unknown) {
    if (isGuildMembersTimeoutError(error)) {
      return { members: guild.members.cache, fromCache: true };
    }
    throw error;
  }
}
