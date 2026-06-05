import { getRuntimeConfig } from "../../config/runtime";

export const TARGET_GUILD_ID = getRuntimeConfig().discord.guildIds[0] ?? null;

export const NOT_SUNDAY_MESSAGE =
  "おまえら～ｗｗｗ曜日感覚大丈夫～～～？？？ｗｗｗ";

export const MONDAY_TAUNT_MESSAGE = [
  "# 明日は月曜日♪",
  "# 月曜日♪",
  "# ルンルンルンルン月曜日♪",
  "# やったね！",
  "# 月曜日だ！",
  "# みんな元気に月曜日やっていこうね！",
  "# ムカムカしてもしょうがないよ！",
  "# だって明日は月曜日だもん！",
  "# ヤッター！",
  "# やったね！",
].join("\n");
