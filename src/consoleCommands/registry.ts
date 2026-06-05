import { type Client } from "discord.js";
import {
  moveUser,
  disconnectUser,
  timeoutUser,
  serverUserMute,
  moveAll,
  disconnectAll,
  muteAll,
  unmuteUser,
  addRoleToUser,
  deleteMessage,
} from "./handlers.js";
import { parseDuration } from "./utils.js";

const DURATION_ERROR_MESSAGE =
  "duration は 例: 10s, 5m, 2h, 300 (秒) の形式で指定してください。";

const CONSOLE_COMMAND_LINES = [
  "コンソールコマンド:",
  "ID は Discord の開発者モードでコピーしたサーバーID / ユーザーID / チャンネルID / ロールIDを使ってください。",
  "",
  "  move <guildId> <userId> <voiceChannelId>",
  "    指定ユーザーを指定VCへ移動します。",
  "    例: move 111111111111111111 222222222222222222 333333333333333333",
  "",
  "  disconnect <guildId> <userId>",
  "    指定ユーザーをVCから切断します。",
  "    例: disconnect 111111111111111111 222222222222222222",
  "",
  "  timeout <guildId> <userId> <時間>",
  "    指定ユーザーをタイムアウトします。0s を指定すると解除します。",
  "    例: timeout 111111111111111111 222222222222222222 10m",
  "",
  "  serverMute <guildId> <userId> <時間>",
  "    指定ユーザーをサーバーミュートし、時間後に自動解除します。",
  "    例: serverMute 111111111111111111 222222222222222222 1h",
  "",
  "  moveAll <guildId> <voiceChannelId>",
  "    ギルド内でVCにいる全員を指定VCへ移動します。",
  "    例: moveAll 111111111111111111 333333333333333333",
  "",
  "  disconnectAll <guildId>",
  "    ギルド内でVCにいる全員を切断します。",
  "    例: disconnectAll 111111111111111111",
  "",
  "  muteAll <guildId> <時間>",
  "    ギルド内でVCにいる全員をサーバーミュートし、時間後に自動解除します。",
  "    例: muteAll 111111111111111111 15m",
  "",
  "  unmute <guildId> <userId>",
  "    指定ユーザーのサーバーミュートをすぐ解除します。",
  "    例: unmute 111111111111111111 222222222222222222",
  "",
  "  addrole <guildId> <userId> <roleId>",
  "    指定ユーザーにロールを付与します。",
  "    例: addrole 111111111111111111 222222222222222222 444444444444444444",
  "",
  "  delmsg <channelId> <messageId>",
  "    指定チャンネル内のメッセージを1件削除します。",
  "    例: delmsg 555555555555555555 666666666666666666",
  "",
  "時間の書式: 10s = 10秒 / 5m = 5分 / 2h = 2時間 / 300 = 300秒",
  "help と入力するとコマンド一覧を表示します。",
  "------------------------------",
] as const;

function printConsoleCommandHelp(): void {
  for (const line of CONSOLE_COMMAND_LINES) {
    console.log(line);
  }
}

export async function executeConsoleCommand(
  client: Client,
  input: string,
  onHelp?: () => void,
): Promise<void> {
  const args = input.trim().split(/\s+/);
  const command = args[0]?.toLowerCase();

  if (!command) return;

  switch (command) {
    case "help":
      if (onHelp) {
        onHelp();
      }
      return;

    case "move":
      if (args.length === 4) {
        await moveUser(client, args[1], args[2], args[3]);
      }
      break;

    case "disconnect":
      if (args.length === 3) {
        await disconnectUser(client, args[1], args[2]);
      }
      break;

    case "timeout":
      if (args.length === 4) {
        const rawDuration = args[3];
        const durationMs = parseDuration(rawDuration);
        if (durationMs === null) {
          console.log(DURATION_ERROR_MESSAGE);
          return;
        }
        await timeoutUser(client, args[1], args[2], durationMs, rawDuration);
      }
      break;

    case "servermute":
      if (args.length === 4) {
        const rawDuration = args[3];
        const durationMs = parseDuration(rawDuration);
        if (durationMs === null) {
          console.log(DURATION_ERROR_MESSAGE);
          return;
        }
        await serverUserMute(client, args[1], args[2], durationMs, rawDuration);
      }
      break;

    case "moveall":
      if (args.length === 3) {
        await moveAll(client, args[1], args[2]);
      }
      break;

    case "disconnectall":
      if (args.length === 2) {
        await disconnectAll(client, args[1]);
      }
      break;

    case "muteall":
      if (args.length === 3) {
        const rawDuration = args[2];
        const durationMs = parseDuration(rawDuration);
        if (durationMs === null) {
          console.log(DURATION_ERROR_MESSAGE);
          return;
        }
        await muteAll(client, args[1], durationMs, rawDuration);
      }
      break;

    case "unmute":
      if (args.length === 3) {
        await unmuteUser(client, args[1], args[2]);
      }
      break;

    case "addrole":
      if (args.length === 4) {
        await addRoleToUser(client, args[1], args[2], args[3]);
      }
      break;

    case "delmsg":
      if (args.length === 3) {
        await deleteMessage(client, args[1], args[2]);
      }
      break;

    default:
      console.log("不明なコマンドです。help で一覧を確認できます。");
  }
}
