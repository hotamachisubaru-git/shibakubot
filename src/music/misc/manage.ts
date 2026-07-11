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

type ManagedMemberResolution =
  | Readonly<{ status: "found"; member: GuildMember }>
  | Readonly<{ status: "ambiguous" }>
  | Readonly<{ status: "not-found" }>;

async function resolveManagedMember(
  message: Message,
  raw: string,
): Promise<ManagedMemberResolution> {
  const guild = message.guild;
  if (!guild) return { status: "not-found" };

  const id = raw.match(MENTION_RE)?.[1] ?? (SNOWFLAKE_RE.test(raw) ? raw : null);
  if (id) {
    const member = await guild.members.fetch(id).catch(() => null);
    return member ? { status: "found", member } : { status: "not-found" };
  }

  const normalized = normalizeName(raw);
  const cached = guild.members.cache.filter((member) =>
    memberMatches(member, normalized),
  );
  if (cached.size === 1) {
    return { status: "found", member: cached.first()! };
  }
  if (cached.size > 1) return { status: "ambiguous" };

  const searched = await guild.members
    .search({ query: raw, limit: 10 })
    .catch(() => null);
  if (!searched?.size) return { status: "not-found" };

  const exactMatches = searched.filter((member) =>
    memberMatches(member, normalized),
  );
  if (exactMatches.size === 1) {
    return { status: "found", member: exactMatches.first()! };
  }
  return exactMatches.size > 1
    ? { status: "ambiguous" }
    : { status: "not-found" };
}

function buildManageUsage(): string {
  return (
    `使い方: \`${PREFIX}${MUSIC_TEXT_COMMAND.manage} <ユーザー> <内容>\`\n` +
    `確認: \`${PREFIX}${MUSIC_TEXT_COMMAND.manage} <ユーザー>\`\n` +
    `削除: \`${PREFIX}${MUSIC_TEXT_COMMAND.manage} <ユーザー> clear\`\n` +
    "空白を含む表示名や同名ユーザーは、メンションまたはユーザーIDで指定してください。"
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

  const resolution = await resolveManagedMember(message, targetRaw);
  if (resolution.status === "ambiguous") {
    await replyWithoutMentions(
      message,
      "⚠️ 同じ名前のユーザーが複数います。対象ユーザーをメンションするか、ユーザーIDで再入力してください。",
    );
    return;
  }
  if (resolution.status === "not-found") {
    await replyWithoutMentions(
      message,
      "⚠️ 完全一致するユーザーを見つけられませんでした。メンションまたはIDで指定してください。空白を含む表示名はメンションが必要です。",
    );
    return;
  }
  const member = resolution.member;

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
