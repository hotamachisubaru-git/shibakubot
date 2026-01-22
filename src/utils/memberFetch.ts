import { Collection, Guild, GuildMember } from "discord.js";

export type MemberFetchResult = {
  members: Collection<string, GuildMember>;
  fromCache: boolean;
};

export async function fetchGuildMembersSafe(
  guild: Guild,
): Promise<MemberFetchResult> {
  try {
    const members = await guild.members.fetch();
    return { members, fromCache: false };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "GuildMembersTimeout") {
      return { members: guild.members.cache, fromCache: true };
    }
    throw err;
  }
}
