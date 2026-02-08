// src/deploy-commands.ts
import "dotenv/config";
import { ChannelType, REST, Routes, SlashCommandBuilder } from "discord.js";

function parseCsvEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter((token): token is string => token.length > 0);
}

function arrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function hasRawError(value: unknown): value is { rawError: unknown } {
  return typeof value === "object" && value !== null && "rawError" in value;
}

const TOKEN = process.env.TOKEN?.trim() ?? "";
const CLIENT_ID = process.env.CLIENT_ID?.trim() ?? "";
const GUILD_IDS = parseCsvEnv(process.env.GUILD_IDS ?? process.env.GUILD_ID);

// 環境チェック
if (!TOKEN || !CLIENT_ID || GUILD_IDS.length === 0) {
  console.error(
    "❌ 環境変数が不足しています。TOKEN, CLIENT_ID, GUILD_IDS を確認してください。",
  );
  process.exit(1);
}

// ---- ギルド向けのスラッシュコマンドを登録 ----
const commands: Array<ReturnType<SlashCommandBuilder["toJSON"]>> = [
  // /ping 生存確認
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("BOTが生きているか確認する")
    .toJSON(),

  // /sbk 本体
  new SlashCommandBuilder()
    .setName("sbk")
    .setDescription("ユーザーをしばく")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("しばく対象").setRequired(true),
    )
    .addStringOption(
      (opt) =>
        opt
          .setName("count")
          .setDescription("しばく回数（省略可・ランダム）")
          .setRequired(false), // ← 重要
    )
    .addStringOption(
      (opt) =>
        opt
          .setName("reason")
          .setDescription("理由（省略可・ランダム）")
          .setRequired(false), // ← 重要
    )

    .toJSON(),

  // /menu メニュー
  new SlashCommandBuilder()
    .setName("menu")
    .setDescription("しばくbot メニューを表示する")
    .toJSON(),

  // /help コマンド一覧
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("コマンド一覧を表示する")
    .toJSON(),

  // /suimin VC移動
  new SlashCommandBuilder()
    .setName("suimin")
    .setDescription("指定ユーザーをVCに移動")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("移動するユーザー").setRequired(true),
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("移動先のボイスチャンネル")
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(true),
    )
    .toJSON(),

  // /maintenance メンテナンスモード切り替え
  new SlashCommandBuilder()
    .setName("maintenance")
    .setDescription("メンテナンスモードを切り替える（管理者のみ）")
    .addStringOption((opt) =>
      opt
        .setName("mode")
        .setDescription("on / off を指定")
        .setRequired(true)
        .addChoices(
          { name: "on", value: "on" },
          { name: "off", value: "off" },
        ),
    )
    .toJSON(),

  // /mt メンテナンスモード切り替え（短縮）
  new SlashCommandBuilder()
    .setName("mt")
    .setDescription("メンテナンスモードを切り替える（短縮コマンド）")
    .addStringOption((opt) =>
      opt
        .setName("mode")
        .setDescription("on / off を指定")
        .setRequired(true)
        .addChoices(
          { name: "on", value: "on" },
          { name: "off", value: "off" },
        ),
    )
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  console.log("⏫ コマンド登録中...");
  console.log(`   CLIENT_ID=${CLIENT_ID}`);
  console.log(`   GUILD_IDS=${GUILD_IDS.join(", ")}`);

  try {
    // --- 任意: グローバルコマンドを全削除（残っていると古い表示が混在しがち） ---
    if ((process.env.CLEAR_GLOBAL || "true").toLowerCase() === "true") {
      console.log("🧹 グローバルコマンドを全削除します...");
      const res = await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: [],
      });
      console.log(`   ✔ グローバル削除完了（${arrayCount(res)} 件）`);
    } else {
      console.log("（グローバル削除はスキップ: CLEAR_GLOBAL=false）");
    }

    // --- ギルド単位で順次（直列）登録：レート制限を避け、失敗点を特定しやすくする ---
    for (const gid of GUILD_IDS) {
      console.log(`📝 ギルド(${gid}) に置換登録中...`);
      const registered = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, gid),
        { body: commands },
      );
      console.log(
        `   ✔ 登録完了: guild=${gid} / count=${arrayCount(registered)}`,
      );
    }

    console.log("✅ すべての登録処理が完了しました。");
    process.exit(0);
  } catch (err: unknown) {
    // Discord 側のエラー内容を見やすく
    console.error("❌ 登録中にエラー:");
    if (hasRawError(err)) console.error(err.rawError);
    console.error(err);
    process.exit(1);
  }
})();
