import { Message } from "discord.js";
import { PREFIX } from "./constants";
import { getLavalink } from "./trackUtils";
import { MUSIC_TEXT_COMMAND } from "../../constants/commands";

export async function handlePauseCommand(
  message: Message,
  _args: string[],
): Promise<void> {
  const guildId = message.guildId;
  if (!guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  const lavalink = getLavalink(message);
  const player = lavalink?.players.get(guildId);

  if (!player) {
    await message.reply("⚠️ 現在再生中の曲がありません。");
    return;
  }

  if (!player.connected) {
    await message.reply("⚠️ ボイスチャンネルに接続していません。");
    return;
  }

  const wasPaused = player.paused;
  await player.node.updatePlayer({ guildId: player.guildId, playerOptions: { paused: !wasPaused } });

  await message.reply(
    wasPaused
      ? "▶️ 再生を再開しました。"
      : "⏸️ 一時停止しました。",
  );
}
