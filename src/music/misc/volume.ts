import { Message } from "discord.js";
import { PREFIX } from "./constants";
import { getLavalink } from "./trackUtils";
import { MUSIC_TEXT_COMMAND } from "../../constants/commands";
import { requireSameMusicVoiceChannel } from "./music-permissions";

const VOL_MIN = 1;
const VOL_MAX = 100;
export function parseVolumeArg(arg: string | undefined): number | null {
  if (!arg) return null;
  const n = Number(arg);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(VOL_MAX, Math.max(VOL_MIN, Math.round(n)));
  return clamped;
}

export async function handleVolumeCommand(
  message: Message,
  args: string[],
): Promise<void> {
  const guildId = message.guildId;
  if (!guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  const raw = args[0];
  const volume = parseVolumeArg(raw);
  if (volume === null) {
    await message.reply(
      `⚠️ 使い方: \`${PREFIX}${MUSIC_TEXT_COMMAND.volume} <1-100>\``,
    );
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

  if (!(await requireSameMusicVoiceChannel(message, player.voiceChannelId))) return;

  await player.setVolume(volume);

  await message.reply(`🔊 音量を \`${volume}\` に設定しました。`);
}
