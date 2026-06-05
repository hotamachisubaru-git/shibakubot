import { Message } from "discord.js";
import { PREFIX } from "./constants";
import { getLavalink } from "./trackUtils";
import {
  clearRepeatTimer,
  refreshAutoStopForPlayer,
} from "../state/state";
import { getMusicRepeat, setMusicRepeat } from "../../data";
import { MUSIC_TEXT_COMMAND } from "../../constants/commands";
import { applyMusicRepeatForPlayer } from "../state/state";

// ---------------------------------------------------------------------------
// parseRepeatEnabledArg
// ---------------------------------------------------------------------------

export function parseRepeatEnabledArg(
  currentEnabled: boolean,
  arg: string | undefined,
): boolean | null {
  const normalized = arg?.toLowerCase();
  if (!normalized || normalized === "toggle") {
    return !currentEnabled;
  }
  if (["on", "enable", "enabled", "true", "1"].includes(normalized)) {
    return true;
  }
  if (["off", "disable", "disabled", "false", "0"].includes(normalized)) {
    return false;
  }
  if (["status", "show", "list"].includes(normalized)) {
    return currentEnabled;
  }
  return null;
}

// ---------------------------------------------------------------------------
// handleRepeatCommand
// ---------------------------------------------------------------------------

export async function handleRepeatCommand(
  message: Message,
  args: string[],
): Promise<void> {
  const guildId = message.guildId;
  if (!guildId) {
    await message.reply("⚠️ サーバー内でのみ使用できます。");
    return;
  }

  const currentEnabled = getMusicRepeat(guildId);
  const nextEnabled = parseRepeatEnabledArg(currentEnabled, args[0]);
  if (nextEnabled === null) {
    await message.reply(
      `⚠️ 使い方: \`${PREFIX}${MUSIC_TEXT_COMMAND.repeat} [on|off]\``,
    );
    return;
  }

  setMusicRepeat(guildId, nextEnabled);
  if (!nextEnabled) {
    clearRepeatTimer(guildId);
  }

  const player = getLavalink(message)?.players.get(guildId);
  if (player) {
    await applyMusicRepeatForPlayer(player);
  }

  await message.reply(
    nextEnabled
      ? "🔁 1曲リピートを有効化しました。"
      : "➡️ 1曲リピートを無効化しました。",
  );
}
