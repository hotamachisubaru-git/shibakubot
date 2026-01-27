// src/english.ts
import { Message } from "discord.js";
import { getEnglishBanEnabled } from "./data";

const PREFIX = "s!";
const ENGLISH_RE = /[A-Za-z]/;

export async function handleEnglishMessage(message: Message) {
  if (!message.guild) return;
  if (message.author.bot) return;

  const content = message.content ?? "";
  if (!content) return;

  // メッセージコマンドは英語判定の対象外にする
  if (content.startsWith(PREFIX)) return;

  if (!message.guildId) return;
  if (!getEnglishBanEnabled(message.guildId)) return;
  if (!ENGLISH_RE.test(content)) return;

  // 英語禁止モード: チャンネルでメンション警告
  try {
    if (message.channel.isTextBased() && !message.channel.isDMBased()) {
      await message.channel.send({
        content: `<@${message.author.id}> 🚫 英語は禁止されています。日本語で話してください。`,
        allowedMentions: { parse:[] },
      });
    }
  } catch {}
}
