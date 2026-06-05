import { Message } from "discord.js";
import { MUSIC_TEXT_COMMAND } from "../constants/commands";
import { getMusicEnabled } from "../data";
import {
  handleDisable,
  handleEnable,
  handleLimitCommand,
  handleNgWordCommand,
  handleNowPlaying,
  handlePlay,
  handleQueue,
  handleRemoveCommand,
  handleRepeatCommand,
  handleSkip,
  handleStop,
} from "./misc/commandHandlers";
import { handleUpload } from "./misc/upload-handler";
import { ALLOWED_EXTENSIONS_LABEL, PREFIX } from "./misc/constants";
import {
  clearPendingSearch,
  getPendingSearch,
  hookManagerAutoStopOnce,
} from "./state/state";
import { getLavalink } from "./misc/trackUtils";

type MusicMessageCommandHandler = (
  message: Message,
  args: string[],
) => Promise<void>;

type MusicMessageCommandDefinition = Readonly<{
  name: string;
  aliases?: readonly string[];
  requiresEnabled?: boolean;
  handler: MusicMessageCommandHandler;
}>;

type ParsedMusicMessageCommand = Readonly<{
  command: string;
  args: string[];
}>;

async function handlePlayMessageCommand(
  message: Message,
  args: string[],
): Promise<void> {
  const query = args.join(" ").trim();
  if (!query) {
    await message.reply(
      "🎵 再生したい曲の URL / Spotify URI / キーワード を入力してください。`ytm:` / `yt:` / `sc:` / `bc:` / `as:` で検索先も指定できます。",
    );
    return;
  }

  const pick = query.match(/^(10|[1-9])$/);
  if (!pick) {
    await handlePlay(message, query);
    return;
  }

  const pending = getPendingSearch(message);
  if (!pending) {
    await message.reply(
      `⚠️ その番号を選択できる候補がありません。先に ${PREFIX}${MUSIC_TEXT_COMMAND.play} で曲を検索してください。`,
    );
    return;
  }

  const index = Number(pick[1]) - 1;
  const track = pending.tracks[index];
  if (!track) {
    await message.reply(
      `⚠️ 選択番号は 1〜${pending.tracks.length} で指定してください。`,
    );
    return;
  }

  clearPendingSearch(message);
  await handlePlay(message, query, {
    selectedTrack: track,
    selectionContext: {
      tracks: pending.tracks,
      query: pending.query,
      selectedIndex: index,
    },
  });
}

async function handleHelpMessageCommand(
  message: Message,
  _args: string[],
): Promise<void> {
  await message.reply(buildMusicHelpMessage());
}

const MUSIC_MESSAGE_COMMAND_DEFINITIONS: readonly MusicMessageCommandDefinition[] = [
  {
    name: MUSIC_TEXT_COMMAND.play,
    handler: handlePlayMessageCommand,
  },
  {
    name: MUSIC_TEXT_COMMAND.np,
    handler: async (message) => handleNowPlaying(message),
  },
  {
    name: MUSIC_TEXT_COMMAND.skip,
    aliases: [MUSIC_TEXT_COMMAND.skipAlias],
    handler: async (message) => handleSkip(message),
  },
  {
    name: MUSIC_TEXT_COMMAND.stop,
    handler: async (message) => handleStop(message),
  },
  {
    name: MUSIC_TEXT_COMMAND.queue,
    handler: async (message) => handleQueue(message),
  },
  {
    name: MUSIC_TEXT_COMMAND.repeat,
    requiresEnabled: false,
    handler: async (message, args) => handleRepeatCommand(message, args),
  },
  {
    name: MUSIC_TEXT_COMMAND.upload,
    handler: async (message, args) => handleUpload(message, args.join(" ").trim()),
  },
  {
    name: MUSIC_TEXT_COMMAND.ng,
    aliases: [MUSIC_TEXT_COMMAND.ngAlias],
    handler: async (message, args) => handleNgWordCommand(message, args),
  },
  {
    name: MUSIC_TEXT_COMMAND.help,
    handler: handleHelpMessageCommand,
  },
  {
    name: MUSIC_TEXT_COMMAND.remove,
    aliases: [MUSIC_TEXT_COMMAND.removeAlias],
    handler: async (message, args) => handleRemoveCommand(message, args),
  },
  {
    name: MUSIC_TEXT_COMMAND.limit,
    aliases: [MUSIC_TEXT_COMMAND.limitAlias],
    requiresEnabled: false,
    handler: async (message, args) => handleLimitCommand(message, args),
  },
  {
    name: MUSIC_TEXT_COMMAND.disable,
    aliases: [MUSIC_TEXT_COMMAND.disableAlias],
    requiresEnabled: false,
    handler: async (message) => handleDisable(message),
  },
  {
    name: MUSIC_TEXT_COMMAND.enable,
    aliases: [MUSIC_TEXT_COMMAND.enableAlias],
    requiresEnabled: false,
    handler: async (message) => handleEnable(message),
  },
];

const MUSIC_MESSAGE_COMMANDS = buildMusicMessageCommandMap();

function buildMusicMessageCommandMap(): ReadonlyMap<
  string,
  MusicMessageCommandDefinition
> {
  const commandMap = new Map<string, MusicMessageCommandDefinition>();
  for (const definition of MUSIC_MESSAGE_COMMAND_DEFINITIONS) {
    commandMap.set(definition.name, definition);
    for (const alias of definition.aliases ?? []) {
      commandMap.set(alias, definition);
    }
  }
  return commandMap;
}

function parseMusicMessageCommand(
  message: Message,
): ParsedMusicMessageCommand | null {
  const content = message.content.slice(PREFIX.length).trim();
  if (!content) {
    return null;
  }

  const [cmd, ...args] = content.split(/\s+/);
  const command = cmd?.toLowerCase();
  if (!command) {
    return null;
  }

  return {
    command,
    args,
  };
}

async function ensureMusicFeatureEnabled(
  message: Message,
  guildId: string,
  definition: MusicMessageCommandDefinition,
): Promise<boolean> {
  if (definition.requiresEnabled === false) {
    return true;
  }

  if (getMusicEnabled(guildId)) {
    return true;
  }

  await message.reply(
    `⚠️ 音楽機能が無効化されています。管理者権限で \`${PREFIX}${MUSIC_TEXT_COMMAND.enable}\` で有効化してください。`,
  );
  return false;
}

function buildMusicHelpMessage(): string {
  return (
    "🎵 音楽コマンド一覧:\n" +
    `\`${PREFIX}${MUSIC_TEXT_COMMAND.play} <URL / Spotify URI / キーワード>\` - 曲を再生・キューに追加\n` +
    "キーワード検索は YouTube Music / YouTube / SoundCloud / Bandcamp の候補を順に探します\n" +
    "検索先を固定したい場合は `ytm:` / `yt:` / `sc:` / `bc:` を先頭につけて検索できます\n" +
    "Audiostock の試聴プレビュー音源を検索したい場合は `as:` を先頭につけてください\n" +
    `\`${PREFIX}${MUSIC_TEXT_COMMAND.np}\` - 現在再生中の曲を表示\n` +
    `\`${PREFIX}${MUSIC_TEXT_COMMAND.skip}\` (${PREFIX}${MUSIC_TEXT_COMMAND.skipAlias}) - 曲をスキップ\n` +
    `\`${PREFIX}${MUSIC_TEXT_COMMAND.stop}\` - 再生を停止し、VCから退出\n` +
    `\`${PREFIX}${MUSIC_TEXT_COMMAND.queue}\` - 再生中・キュー中の曲一覧を表示\n` +
    `\`${PREFIX}${MUSIC_TEXT_COMMAND.repeat} [on|off]\` - 1曲リピートを切り替え\n` +
    `\`${PREFIX}${MUSIC_TEXT_COMMAND.upload} [表示名]\` - 音楽ファイルをアップロードして再生（対応形式: ${ALLOWED_EXTENSIONS_LABEL}）\n` +
    `Spotify の公開 track / album / playlist URL と \`spotify:track:...\` 形式に対応\n` +
    "Lavalink 側で有効な直URLにも対応します（例: YouTube / ニコニコ / SoundCloud / Bandcamp / Vimeo / Twitch / HTTP音声）\n" +
    "未対応URLは yt-dlp フォールバックで取り込み再生を試みます（例: TikTok / Bilibili / X / Instagram / Dailymotion など）\n" +
    `\`${PREFIX}${MUSIC_TEXT_COMMAND.ng} <サブコマンド>\` - 音楽NGワード管理コマンド（管理者のみ）\n` +
    `（例: \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} add <ワード>\` / \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} remove <ワード>\` / \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} list\` / \`${PREFIX}${MUSIC_TEXT_COMMAND.ng} clear\`）\n` +
    `\`${PREFIX}${MUSIC_TEXT_COMMAND.limit} [set <分>|reset]\` (${PREFIX}${MUSIC_TEXT_COMMAND.limitAlias}) - サーバー別の最大再生時間を表示/変更（変更は管理者のみ）\n` +
    `\`${PREFIX}${MUSIC_TEXT_COMMAND.disable}\` (${PREFIX}${MUSIC_TEXT_COMMAND.disableAlias}) - 音楽機能を無効化（管理者のみ）\n` +
    `\`${PREFIX}${MUSIC_TEXT_COMMAND.enable}\` (${PREFIX}${MUSIC_TEXT_COMMAND.enableAlias}) - 音楽機能を有効化（管理者のみ）`
  );
}

/**
 * メッセージコマンドのルーター
 *  s!play / s!np / s!skip / s!s / s!stop / s!queue / s!repeat / s!upload / s!ng / s!limit
 */
export async function handleMusicMessage(message: Message): Promise<void> {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const lavalink = getLavalink(message);
  if (lavalink) {
    hookManagerAutoStopOnce(lavalink);
  }

  const guildId = message.guildId;
  if (!guildId) return;

  const parsedCommand = parseMusicMessageCommand(message);
  if (!parsedCommand) {
    return;
  }

  const definition = MUSIC_MESSAGE_COMMANDS.get(parsedCommand.command);
  if (!definition) {
    return;
  }

  if (!(await ensureMusicFeatureEnabled(message, guildId, definition))) {
    return;
  }

  try {
    await definition.handler(message, parsedCommand.args);
  } catch (error) {
    console.error("[music] command error", error);
    try {
      await message.reply("⚠️ コマンド処理中にエラーが発生しました。");
    } catch {
      // noop
    }
  }
}
