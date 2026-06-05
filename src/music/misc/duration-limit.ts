import { Message } from "discord.js";
import { PREFIX } from "./constants";
import { getLavalink } from "./trackUtils";
import {
  clearMusicMaxTrackMinutes,
  getDefaultMusicMaxTrackMinutes,
  getMusicMaxTrackMinutes,
  getMusicMaxTrackMinutesOverride,
  setMusicMaxTrackMinutes,
} from "../../data";
import { MUSIC_TEXT_COMMAND } from "../../constants/commands";
import { canManageMusic } from "./music-permissions";
import { refreshAutoStopForPlayer } from "../state/state";

// ---------------------------------------------------------------------------
// buildMusicLimitStatusMessage
// ---------------------------------------------------------------------------

export function buildMusicLimitStatusMessage(guildId: string): string {
  const current = getMusicMaxTrackMinutes(guildId);
  const override = getMusicMaxTrackMinutesOverride(guildId);
  const defaultMinutes = getDefaultMusicMaxTrackMinutes();
  const source = override === null ? "既定値" : "サーバー設定";

  return (
    `⏱ このサーバーの最大再生時間は **${current} 分** です（${source}）。\n` +
    `既定値: **${defaultMinutes} 分**\n` +
    `変更: \`${PREFIX}${MUSIC_TEXT_COMMAND.limit} set <分>\` / リセット: \`${PREFIX}${MUSIC_TEXT_COMMAND.limit} reset\``
  );
}

// ---------------------------------------------------------------------------
// handleLimitCommand
// ---------------------------------------------------------------------------

const MUSIC_MAX_TRACK_MINUTES_MIN = 1;
const MUSIC_MAX_TRACK_MINUTES_MAX = 360;

export async function handleLimitCommand(
  message: Message,
  args: string[],
): Promise<void> {
  const guildId = message.guildId;
  if (!guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  const sub = args[0]?.toLowerCase();
  if (!sub || sub === "status" || sub === "show" || sub === "list") {
    await message.reply(buildMusicLimitStatusMessage(guildId));
    return;
  }

  if (!canManageMusic(message)) {
    await message.reply("⚠️ 権限がありません。（管理者のみ）");
    return;
  }

  if (sub === "reset" || sub === "clear" || sub === "default") {
    clearMusicMaxTrackMinutes(guildId);
    const player = getLavalink(message)?.players.get(guildId);
    if (player) {
      refreshAutoStopForPlayer(player);
    }
    await message.reply(
      `✅ 最大再生時間を既定値 **${getDefaultMusicMaxTrackMinutes()} 分** に戻しました。`,
    );
    return;
  }

  const minutesRaw = sub === "set" ? args[1] : args[0];
  if (!minutesRaw || !/^\d+$/.test(minutesRaw)) {
    await message.reply(
      `⚠️ 分数を整数で指定してください。（例: \`${PREFIX}${MUSIC_TEXT_COMMAND.limit} set 10\`）`,
    );
    return;
  }

  const minutes = Number(minutesRaw);
  if (
    !Number.isSafeInteger(minutes) ||
    minutes < MUSIC_MAX_TRACK_MINUTES_MIN ||
    minutes > MUSIC_MAX_TRACK_MINUTES_MAX
  ) {
    await message.reply(
      `⚠️ 最大再生時間は ${MUSIC_MAX_TRACK_MINUTES_MIN}〜${MUSIC_MAX_TRACK_MINUTES_MAX} 分で指定してください。`,
    );
    return;
  }

  const saved = setMusicMaxTrackMinutes(guildId, minutes);
  const player = getLavalink(message)?.players.get(guildId);
  if (player) {
    refreshAutoStopForPlayer(player);
  }
  await message.reply(
    `✅ このサーバーの最大再生時間を **${saved} 分** に設定しました。`,
  );
}
