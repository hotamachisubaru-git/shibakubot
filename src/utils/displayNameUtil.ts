// src/utils/displayNameUtil.ts
import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
} from "discord.js";

export type AnyInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction;

/**
 * ギルドに居ればニックネーム、いなければユーザータグを返すユーティリティ
 */
export async function displayNameFrom(
  i: AnyInteraction,
  userId: string,
): Promise<string> {
  const g = i.guild;
  if (g) {
    const m = await g.members.fetch(userId).catch(() => null);
    if (m?.displayName) return m.displayName;
  }

  const u = await i.client.users.fetch(userId).catch(() => null);
  return u?.tag ?? userId;
}
