import { type ChatInputCommandInteraction } from "discord.js";

const NOT_SUNDAY_MESSAGE = "おまえら～ｗｗｗ曜日感覚大丈夫～～～？？？ｗｗｗ";

const MONDAY_TAUNT_MESSAGE = [
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

function isSundayInJst(date: Date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(date);

  return weekday === "Sun";
}

export async function handleMonday(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!isSundayInJst()) {
    await interaction.reply({
      content: NOT_SUNDAY_MESSAGE,
    });
    return;
  }

  await interaction.reply({
    content: MONDAY_TAUNT_MESSAGE,
  });
}
