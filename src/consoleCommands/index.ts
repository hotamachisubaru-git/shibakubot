import { createInterface } from "node:readline";
import { type Client } from "discord.js";
import { executeConsoleCommand } from "./registry.js";

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

let isConsoleCommandRegistered = false;

function printConsoleCommandHelp(): void {
  for (const line of CONSOLE_COMMAND_LINES) {
    console.log(line);
  }
}

export function registerConsoleCommands(client: Client): void {
  if (isConsoleCommandRegistered) return;

  isConsoleCommandRegistered = true;
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  printConsoleCommandHelp();

  readline.on("line", (input) => {
    void executeConsoleCommand(client, input, printConsoleCommandHelp).catch((error) => {
      console.error("エラーが発生しました:", error);
    });
  });
}
