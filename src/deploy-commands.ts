// src/deploy-commands.ts
import "dotenv/config";
import { REST, Routes } from "discord.js";
import { getRuntimeConfig } from "./config/runtime";
import { getSlashCommandJson } from "./discord/commandCatalog";

type DeployConfig = Readonly<{
  token: string;
  clientId: string;
  guildIds: readonly string[];
}>;

type RestLikeError = Readonly<{
  code?: number;
  status?: number;
  message?: string;
  rawError?: {
    code?: number;
    message?: string;
  };
}>;

type GuildDeployFailure = Readonly<{
  guildId: string;
  error: RestLikeError;
}>;

function resolveDeployConfig(): DeployConfig {
  const runtimeConfig = getRuntimeConfig();
  return {
    token: runtimeConfig.discord.token,
    clientId: runtimeConfig.discord.clientId,
    guildIds: runtimeConfig.discord.guildIds,
  };
}

function arrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function hasRawError(value: unknown): value is { rawError: unknown } {
  return typeof value === "object" && value !== null && "rawError" in value;
}

function isRestLikeError(value: unknown): value is RestLikeError {
  return typeof value === "object" && value !== null;
}

function formatDeployError(error: RestLikeError): string {
  const code = error.code ?? error.rawError?.code;
  const message = error.rawError?.message ?? error.message ?? "Unknown Error";

  if (code === 50001) {
    return `${message} (bot が対象 guild にいない、またはアクセス権がありません)`;
  }

  return code ? `${message} (code=${code})` : message;
}

function printDeploySummary(
  succeededGuildIds: readonly string[],
  failedGuilds: readonly GuildDeployFailure[],
): void {
  console.log("");
  console.log("📋 登録結果");
  console.log(`   成功: ${succeededGuildIds.length} guild`);
  if (succeededGuildIds.length > 0) {
    console.log(`   guild=${succeededGuildIds.join(", ")}`);
  }

  console.log(`   失敗: ${failedGuilds.length} guild`);
  for (const failed of failedGuilds) {
    console.log(
      `   guild=${failed.guildId} -> ${formatDeployError(failed.error)}`,
    );
  }
}

const deployConfig = resolveDeployConfig();
const runtimeConfig = getRuntimeConfig();

// 環境チェック
if (
  !deployConfig.token ||
  !deployConfig.clientId ||
  deployConfig.guildIds.length === 0
) {
  console.error(
    "❌ 環境変数が不足しています。TOKEN, CLIENT_ID, GUILD_IDS を確認してください。",
  );
  process.exit(1);
}

const commands = getSlashCommandJson();

const rest = new REST({ version: "10" }).setToken(deployConfig.token);

(async () => {
  console.log("⏫ コマンド登録中...");
  console.log(`   CLIENT_ID=${deployConfig.clientId}`);
  console.log(`   GUILD_IDS=${deployConfig.guildIds.join(", ")}`);
  const succeededGuildIds: string[] = [];
  const failedGuilds: GuildDeployFailure[] = [];

  try {
    // --- 任意: グローバルコマンドを全削除（残っていると古い表示が混在しがち） ---
    if (runtimeConfig.app.clearGlobalCommandsOnRegister) {
      console.log("🧹 グローバルコマンドを全削除します...");
      const res = await rest.put(
        Routes.applicationCommands(deployConfig.clientId),
        {
          body: [],
        },
      );
      console.log(`   ✔ グローバル削除完了（${arrayCount(res)} 件）`);
    } else {
      console.log("（グローバル削除はスキップ: CLEAR_GLOBAL=false）");
    }

    // --- ギルド単位で順次（直列）登録：レート制限を避け、失敗点を特定しやすくする ---
    for (const guildId of deployConfig.guildIds) {
      console.log(`📝 ギルド(${guildId}) に置換登録中...`);
      try {
        const registered = await rest.put(
          Routes.applicationGuildCommands(deployConfig.clientId, guildId),
          { body: commands },
        );
        succeededGuildIds.push(guildId);
        console.log(
          `   ✔ 登録完了: guild=${guildId} / count=${arrayCount(registered)}`,
        );
      } catch (err: unknown) {
        const error = isRestLikeError(err) ? err : { message: String(err) };
        failedGuilds.push({ guildId, error });
        console.error(
          `   ✖ 登録失敗: guild=${guildId} / ${formatDeployError(error)}`,
        );
      }
    }

    printDeploySummary(succeededGuildIds, failedGuilds);

    if (failedGuilds.length > 0) {
      console.error(
        "⚠️ 一部の guild で登録に失敗しました。不要な GUILD_ID の削除、または bot の招待状態を確認してください。",
      );
      process.exit(1);
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
