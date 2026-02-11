import { Message } from "discord.js";
import { MUSIC_TEXT_COMMAND } from "./constants/commands";
import { getMusicEnabled } from "./data";
import {
  handleDisable,
  handleEnable,
  handleNgWordCommand,
  handleNowPlaying,
  handlePlay,
  handleQueue,
  handleRemoveCommand,
  handleSkip,
  handleStop,
  handleUpload,
} from "./music/commandHandlers";
import {
  ALLOWED_EXTENSIONS_LABEL,
  PREFIX,
} from "./music/constants";
import {
  clearPendingSearch,
  getPendingSearch,
  hookManagerAutoStopOnce,
} from "./music/state";
import { getLavalink } from "./music/trackUtils";

/**
 * メッセージコマンドのルーター
 *  s!play / s!np / s!skip / s!s / s!stop / s!queue / s!upload / s!ng
 */
export async function handleMusicMessage(message: Message): Promise<void> {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const lavalink = getLavalink(message);
  if (!lavalink) return;
  hookManagerAutoStopOnce(lavalink);

  const guildId = message.guildId;
  if (!guildId) return;

  const [cmd, ...rest] = message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/);
  const command = cmd?.toLowerCase();

  if (
    command !== MUSIC_TEXT_COMMAND.disable &&
    command !== MUSIC_TEXT_COMMAND.enable &&
    command !== MUSIC_TEXT_COMMAND.disableAlias &&
    command !== MUSIC_TEXT_COMMAND.enableAlias
  ) {
    if (!getMusicEnabled(guildId)) {
      await message.reply(
        `⚠️ 音楽機能が無効化されています。管理者権限で \`${PREFIX}${MUSIC_TEXT_COMMAND.enable}\` で有効化してください。`,
      );
      return;
    }
  }

  try {
    if (command === MUSIC_TEXT_COMMAND.play) {
      const query = rest.join(" ").trim();
      if (!query) {
        await message.reply(
          "🎵 再生したい曲の URL か キーワード を入力してください。",
        );
        return;
      }

      const pick = query.match(/^(10|[1-9])$/);
      if (pick) {
        const pending = getPendingSearch(message);
        if (pending) {
          const index = Number(pick[1]) - 1;
          const track = pending.tracks[index];
          if (!track) {
            await message.reply(
              `?? 選択番号は 1〜${pending.tracks.length} で指定してください。`,
            );
            return;
          }
          clearPendingSearch(message);
          await handlePlay(message, query, { selectedTrack: track });
          return;
        }

        await message.reply(
          `⚠️ その番号を選択できる候補がありません。先に ${PREFIX}${MUSIC_TEXT_COMMAND.play} で曲を検索してください。`,
        );
        return;
      }

      await handlePlay(message, query);
    } else if (command === MUSIC_TEXT_COMMAND.np) {
      await handleNowPlaying(message);
    } else if (
      command === MUSIC_TEXT_COMMAND.skip ||
      command === MUSIC_TEXT_COMMAND.skipAlias
    ) {
      await handleSkip(message);
    } else if (command === MUSIC_TEXT_COMMAND.stop) {
      await handleStop(message);
    } else if (command === MUSIC_TEXT_COMMAND.queue) {
      await handleQueue(message);
    } else if (command === MUSIC_TEXT_COMMAND.upload) {
      await handleUpload(message, rest.join(" ").trim());
    } else if (
      command === MUSIC_TEXT_COMMAND.ng ||
      command === MUSIC_TEXT_COMMAND.ngAlias
    ) {
      await handleNgWordCommand(message, rest);
    } else if (command === MUSIC_TEXT_COMMAND.help) {
      await message.reply(
        "🎵 音楽コマンド一覧:\n" +
          `\`${PREFIX}${MUSIC_TEXT_COMMAND.play} <URL or キーワード>\` - 曲を再生・キューに追加\n` +
          `\`${PREFIX}${MUSIC_TEXT_COMMAND.np}\` - 現在再生中の曲を表示\n` +
          `\`${PREFIX}${MUSIC_TEXT_COMMAND.skip}\` (${PREFIX}${MUSIC_TEXT_COMMAND.skipAlias}) - 曲をスキップ\n` +
          `\`${PREFIX}${MUSIC_TEXT_COMMAND.stop}\` - 再生を停止し、VCから退出\n` +
          `\`${PREFIX}${MUSIC_TEXT_COMMAND.queue}\` - 再生中・キュー中の曲一覧を表示\n` +
          `\`${PREFIX}${MUSIC_TEXT_COMMAND.upload} [表示名]\` - 音楽ファイルをアップロードして再生（対応形式: ${ALLOWED_EXTENSIONS_LABEL}）\n` +
          `\`${PREFIX}${MUSIC_TEXT_COMMAND.ng} <サブコマンド>\` - 音楽NGワード管理コマンド（管理者のみ）\n` +
          `（例: \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} add <ワード>\` / \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} remove <ワード>\` / \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} list\` / \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} clear\`）\n` +
          `\`${PREFIX}${MUSIC_TEXT_COMMAND.disable}\` (${PREFIX}${MUSIC_TEXT_COMMAND.disableAlias}) - 音楽機能を無効化（管理者のみ）\n` +
          `\`${PREFIX}${MUSIC_TEXT_COMMAND.enable}\` (${PREFIX}${MUSIC_TEXT_COMMAND.enableAlias}) - 音楽機能を有効化（管理者のみ）`,
      );
    } else if (
      command === MUSIC_TEXT_COMMAND.remove ||
      command === MUSIC_TEXT_COMMAND.removeAlias
    ) {
      await handleRemoveCommand(message, rest);
    } else if (
      command === MUSIC_TEXT_COMMAND.disable ||
      command === MUSIC_TEXT_COMMAND.disableAlias
    ) {
      await handleDisable(message);
    } else if (
      command === MUSIC_TEXT_COMMAND.enable ||
      command === MUSIC_TEXT_COMMAND.enableAlias
    ) {
      await handleEnable(message);
    }
  } catch (error) {
    console.error("[music] command error", error);
    try {
      await message.reply("❌ 音楽コマンドの処理中にエラーが発生しました。");
    } catch {
      // noop
    }
  }
}
