import { Message } from "discord.js";
import { PREFIX } from "../misc/constants";
import { getLavalink, getTrackTitle } from "../misc/trackUtils";
import { clearAutoStop, clearRepeatTimer } from "../state/state";
import { MUSIC_TEXT_COMMAND } from "../../constants/commands";

// ---------------------------------------------------------------------------
// handleSkip
// ---------------------------------------------------------------------------

export async function handleSkip(message: Message): Promise<void> {
  const lavalink = getLavalink(message);
  const guildId = message.guildId;
  if (!lavalink || !guildId) return;

  const player = lavalink.players.get(guildId);
  const hasPlayableTrack =
    player &&
    (Boolean(player.queue.current) || (player.queue?.tracks?.length ?? 0) > 0);

  if (!hasPlayableTrack) {
    await message.reply("⏹ スキップできる曲がありません。");
    return;
  }

  clearAutoStop(guildId);
  clearRepeatTimer(guildId);
  await player.skip(0, false);
  await message.reply("⏭ 曲をスキップしました。");
}

// ---------------------------------------------------------------------------
// handleStop
// ---------------------------------------------------------------------------

export async function handleStop(message: Message): Promise<void> {
  const lavalink = getLavalink(message);
  const guildId = message.guildId;
  if (!lavalink || !guildId) return;

  const player = lavalink.players.get(guildId);
  if (!player) {
    await message.reply("⏹ 既に停止しています。");
    return;
  }

  clearAutoStop(guildId);
  clearRepeatTimer(guildId);
  await player.destroy();
  await message.reply("⏹ 再生を停止し、VCから退出しました。");
}

// ---------------------------------------------------------------------------
// handleQueue
// ---------------------------------------------------------------------------

export async function handleQueue(message: Message): Promise<void> {
  const lavalink = getLavalink(message);
  const guildId = message.guildId;
  if (!lavalink || !guildId) return;

  const player = lavalink.players.get(guildId);
  if (!player) {
    await message.reply("📭 再生中・キュー中の曲はありません。");
    return;
  }

  const current = player.queue.current;
  const tracks = player.queue?.tracks ?? [];

  if (!current && !tracks.length) {
    await message.reply("📭 再生中・キュー中の曲はありません。");
    return;
  }

  const lines: string[] = [];
  if (current) lines.push(`▶ 再生中: **${current.info.title}**`);
  if (tracks.length) {
    lines.push("", "📃 キュー:");
    lines.push(
      ...tracks.map(
        (track, index) => `${index + 1}. **${getTrackTitle(track)}**`,
      ),
    );
  }

  await message.reply(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// handleRemoveCommand
// ---------------------------------------------------------------------------

export async function handleRemoveCommand(
  message: Message,
  rest: string[],
): Promise<void> {
  const lavalink = getLavalink(message);
  const guildId = message.guildId;
  if (!lavalink || !guildId) return;

  const player = lavalink.players.get(guildId);
  if (!player || !player.queue?.tracks?.length) {
    await message.reply("⏹ キューに曲がありません。");
    return;
  }

  const indexStr = rest[0];
  if (!indexStr || !/^\d+$/.test(indexStr)) {
    await message.reply(
      `⚠️ 削除する曲の番号を指定してください。（例: \`${PREFIX}${MUSIC_TEXT_COMMAND.remove} 2\`）`,
    );
    return;
  }

  const index = Number(indexStr) - 1;
  if (index < 0 || index >= player.queue.tracks.length) {
    await message.reply(
      `⚠️ 番号は 1〜${player.queue.tracks.length} で指定してください。`,
    );
    return;
  }

  const removed = player.queue.tracks.splice(index, 1)[0];
  if (!removed) {
    await message.reply("⚠️ 指定した曲を削除できませんでした。");
    return;
  }
  await message.reply(`🗑 キューから削除しました: **${getTrackTitle(removed)}**`);
}
