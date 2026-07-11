import { Message } from "discord.js";
import { setMusicEnabled } from "../../data";
import { canManageMusic } from "./music-permissions";
import { getLavalink } from "./trackUtils";
import { clearAutoStop, clearRepeatTimer } from "../state/state";

export async function handleDisable(message: Message): Promise<void> {
  if (!message.guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  if (!canManageMusic(message)) {
    await message.reply("⚠️ 権限がありません。（管理者のみ）");
    return;
  }

  const guildId = message.guildId;
  const player = getLavalink(message)?.players.get(guildId);
  clearAutoStop(guildId);
  clearRepeatTimer(guildId);
  if (player) await player.destroy();

  setMusicEnabled(guildId, false);
  await message.reply("🔇 音楽機能を無効化し、再生を停止してVCから退出しました。");
}

export async function handleEnable(message: Message): Promise<void> {
  if (!message.guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  if (!canManageMusic(message)) {
    await message.reply("⚠️ 権限がありません。（管理者のみ）");
    return;
  }

  setMusicEnabled(message.guildId, true);
  await message.reply("🔊 音楽機能を有効化しました。");
}
