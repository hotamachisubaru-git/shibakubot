import {
  DiscordjsErrorCodes,
  RESTJSONErrorCodes,
  type Client,
  type Guild,
  type GuildMember,
  type User,
} from "discord.js";

export function isDiscordErrorCode(error: unknown, code: number | string): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === code;
}

/** Only a confirmed missing user is represented as null; REST/network failures propagate. */
export async function fetchUserOrNull(client: Client, userId: string): Promise<User | null> {
  try {
    return await client.users.fetch(userId);
  } catch (error) {
    if (isDiscordErrorCode(error, RESTJSONErrorCodes.UnknownUser)) return null;
    throw error;
  }
}

export async function fetchGuildMemberOrNull(guild: Guild, userId: string): Promise<GuildMember | null> {
  try {
    return await guild.members.fetch(userId);
  } catch (error) {
    if (isDiscordErrorCode(error, RESTJSONErrorCodes.UnknownMember)) return null;
    throw error;
  }
}

export function isDiscordCollectorTimeout(error: unknown): boolean {
  // discord.js exposes the stop reason only in this error's message. Other
  // reasons (such as guildDelete) must not be mistaken for a user timeout.
  return isDiscordErrorCode(error, DiscordjsErrorCodes.InteractionCollectorError) &&
    error instanceof Error &&
    error.message === "Collector received no interactions before ending with reason: time";
}

export function isDeletedDiscordMessage(error: unknown): boolean {
  return isDiscordErrorCode(error, RESTJSONErrorCodes.UnknownMessage) ||
    isDiscordErrorCode(error, RESTJSONErrorCodes.UnknownWebhook);
}
