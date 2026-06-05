import { Message } from "discord.js";
import { PREFIX } from "./constants";
import { getMusicNgWords, addMusicNgWord, removeMusicNgWord, clearMusicNgWords } from "../../data";
import { MUSIC_TEXT_COMMAND } from "../../constants/commands";
import { canManageMusic } from "./music-permissions";

// ---------------------------------------------------------------------------
// handleNgWordCommand
// ---------------------------------------------------------------------------

export async function handleNgWordCommand(
  message: Message,
  args: string[],
): Promise<void> {
  const guildId = message.guildId;
  if (!guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  const sub = args[0]?.toLowerCase();
  const canManage = canManageMusic(message);

  if (!sub || sub === "help") {
    await message.reply(
      `使い方: \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} add <word>\` / \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} remove <word>\` / \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} list\` / \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} clear\``,
    );
    return;
  }

  if (sub === "list") {
    const list = getMusicNgWords(guildId);
    if (!list.length) {
      await message.reply("📭 NGワードは登録されていません。");
      return;
    }
    const lines = list.map((word, index) => `${index + 1}. ${word}`).join("\n");
    await message.reply(`🚫 NGワード一覧:\n${lines}`);
    return;
  }

  if (!canManage) {
    await message.reply("⚠️ 権限がありません。（管理者のみ）");
    return;
  }

  if (sub === "add") {
    const word = args.slice(1).join(" ").trim();
    if (!word) {
      await message.reply("⚠️ 追加するワードを指定してください。");
      return;
    }
    const result = addMusicNgWord(guildId, word);
    await message.reply(
      result.added
        ? `✅ NGワードを追加しました: **${word}**`
        : `⚠️ すでに登録済みです: **${word}**`,
    );
    return;
  }

  if (sub === "remove" || sub === "del" || sub === "delete") {
    const word = args.slice(1).join(" ").trim();
    if (!word) {
      await message.reply("⚠️ 削除するワードを指定してください。");
      return;
    }
    const result = removeMusicNgWord(guildId, word);
    await message.reply(
      result.removed
        ? `✅ NGワードを削除しました: **${word}**`
        : `⚠️ NGワードにありません: **${word}**`,
    );
    return;
  }

  if (sub === "clear") {
    clearMusicNgWords(guildId);
    await message.reply("✅ NGワードをすべて削除しました。");
    return;
  }

  await message.reply(
    `⚠️ コマンドが不明です。\`${PREFIX}${MUSIC_TEXT_COMMAND.ng} help\` で使い方を確認できます。`,
  );
}
