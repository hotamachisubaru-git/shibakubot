// src/english.ts
import { Message } from "discord.js";
import { getEnglishBanEnabled, isEnglishBanExemptGuild } from "./data";

const PREFIX = "s!";
const ENGLISH_RE = /[A-Za-z]/;
const IGNORE_ENGLISH_RE = /[wWｗＷ!\?！？\s]+/g;

function hasBannedEnglish(content: string) {
  const stripped = content.replace(IGNORE_ENGLISH_RE, "");
  return ENGLISH_RE.test(stripped);
}

export async function handleEnglishMessage(message: Message) {
  if (!message.guild) return;
  if (message.author.bot) return;

  const content = message.content ?? "";
  if (!content) return;

  // メッセージコマンドは英語判定の対象外にする
  if (content.startsWith(PREFIX)) return;

  if (!message.guildId) return;
  if (isEnglishBanExemptGuild(message.guildId)) return;
  if (!getEnglishBanEnabled(message.guildId)) return;
  if (!hasBannedEnglish(content)) return;

  // 英語禁止モード: チャンネルでメンション警告
  try {
    if (message.channel.isTextBased() && !message.channel.isDMBased()) {
      await message.channel.send({
        content: "🚫 英語は禁止されています。日本語で話してください。",
        allowedMentions: { parse: [] },
      });
    }
  } catch {}
}
