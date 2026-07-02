import { GuildMember, Message, type MessageReplyOptions } from "discord.js";
import {
  clearManagedUserContent,
  getManagedUserContent,
  MANAGED_USER_CONTENT_MAX_LENGTH,
  setManagedUserContent,
} from "../../data";
import { MUSIC_TEXT_COMMAND } from "../../constants/commands";
import { PREFIX } from "./constants";
import { canManageMusic } from "./music-permissions";

const SNOWFLAKE_RE = /^\d{17,20}$/;
const MENTION_RE = /^<@!?(\d{17,20})>$/;
const SUPPRESSED_MENTIONS: NonNullable<MessageReplyOptions["allowedMentions"]> = {
  parse: [],
  repliedUser: false,
};

async function replyWithoutMentions(
  message: Message,
  contentOrOptions: string | Omit<MessageReplyOptions, "allowedMentions">,
): Promise<void> {
  await message.reply(
    typeof contentOrOptions === "string"
      ? { content: contentOrOptions, allowedMentions: SUPPRESSED_MENTIONS }
      : { ...contentOrOptions, allowedMentions: SUPPRESSED_MENTIONS },
  );
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function memberMatches(member: GuildMember, normalized: string): boolean {
  return [
    member.displayName,
    member.user.username,
    member.user.globalName,
    member.user.tag,
  ].some((name) => name && normalizeName(name) === normalized);
}

async function resolveManagedMember(
  message: Message,
  raw: string,
): Promise<GuildMember | null> {
  const guild = message.guild;
  if (!guild) return null;

  const id = raw.match(MENTION_RE)?.[1] ?? (SNOWFLAKE_RE.test(raw) ? raw : null);
  if (id) {
    return guild.members.fetch(id).catch(() => null);
  }

  const normalized = normalizeName(raw);
  const cached = guild.members.cache.find((member) =>
    memberMatches(member, normalized),
  );
  if (cached) return cached;

  const searched = await guild.members
    .search({ query: raw, limit: 10 })
    .catch(() => null);
  if (!searched?.size) return null;

  return (
    searched.find((member) => memberMatches(member, normalized)) ??
    searched.first() ??
    null
  );
}

function buildManageUsage(): string {
  return (
    `使い方: \`${PREFIX}${MUSIC_TEXT_COMMAND.manage} <ユーザー> <内容>\`\n` +
    `確認: \`${PREFIX}${MUSIC_TEXT_COMMAND.manage} <ユーザー>\`\n` +
    `削除: \`${PREFIX}${MUSIC_TEXT_COMMAND.manage} <ユーザー> clear\``
  );
}

export async function handleManageCommand(
  message: Message,
  args: string[],
): Promise<void> {
  const guildId = message.guildId;
  if (!guildId || !message.guild) {
    await replyWithoutMentions(message, "⚠️ サーバー内でのみ使用できます。");
    return;
  }

  if (!canManageMusic(message)) {
    await replyWithoutMentions(message, "⚠️ 権限がありません。（管理者のみ）");
    return;
  }

  const targetRaw = args[0];
  if (!targetRaw) {
    await replyWithoutMentions(message, buildManageUsage());
    return;
  }

  const member = await resolveManagedMember(message, targetRaw);
  if (!member) {
    await replyWithoutMentions(
      message,
      "⚠️ 対象ユーザーを見つけられませんでした。メンション、ID、表示名のいずれかで指定してください。",
    );
    return;
  }

  const content = args.slice(1).join(" ").trim();
  if (!content) {
    const current = getManagedUserContent(guildId, member.id);
    await replyWithoutMentions(message, {
      content: current
        ? `📌 **${member.displayName}** の管理内容:\n${current}`
        : `📭 **${member.displayName}** の管理内容は未登録です。`,
    });
    return;
  }

  if (["clear", "delete", "remove"].includes(content.toLowerCase())) {
    const removed = clearManagedUserContent(guildId, member.id);
    await replyWithoutMentions(message, {
      content: removed
        ? `✅ **${member.displayName}** の管理内容を削除しました。`
        : `📭 **${member.displayName}** の管理内容は未登録です。`,
    });
    return;
  }

  if (content.length > MANAGED_USER_CONTENT_MAX_LENGTH) {
    await replyWithoutMentions(
      message,
      `⚠️ 内容は ${MANAGED_USER_CONTENT_MAX_LENGTH} 文字以内で指定してください。`,
    );
    return;
  }

  const saved = setManagedUserContent(guildId, member.id, content);
  await replyWithoutMentions(message, {
    content: `✅ **${member.displayName}** の管理内容を保存しました。\n${saved}`,
  });
}
