// src/index.ts
import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { randomInt, randomReason } from "./utils/sbkRandom";
import { LavalinkManager, type Player } from "lavalink-client";
import {
  Client,
  GatewayIntentBits,
  Events,
  PermissionFlagsBits,
  Message,
  Interaction,
} from "discord.js";

import {
  loadGuildStore,
  setCountGuild,
  isImmune,
  addCountGuild,
  getImmuneList,
  addImmuneId,
  removeImmuneId,
  getSbkRange,
  getMaintenanceEnabled,
} from "./data";

import { sendLog } from "./logging";
import { handleTop } from "./commands/top";
import { handleMembers } from "./commands/members";
import { handleMenu } from "./commands/menu";
import { handleRoom } from "./commands/daimongamecenter";
import { handleHelp } from "./commands/help";
import { handleMaintenance } from "./commands/maintenance";
import { handlePing } from "./commands/ping";
import { handleReset } from "./commands/reset";
import { handleStats } from "./commands/stats";
import { handleSuimin } from "./commands/suiminbunihaire";
import { handleMusicMessage } from "./music";
import { formatBigIntJP } from "./utils/formatCount";

function parseCsvIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter((token): token is string => token.length > 0);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function requiredEnv(name: "TOKEN"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const TOKEN = requiredEnv("TOKEN");
const UPLOAD_DIR = path.resolve(process.env.FILE_DIR ?? "./files");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const FILE_HOST = "play.hotamachi.jp";
const FILE_PORT = parsePositiveInt(process.env.FILE_PORT, 3001);

const app = express();
app.use("/uploads", express.static(UPLOAD_DIR));

app.listen(FILE_PORT, FILE_HOST, () => {
  console.log(
    `📦 Upload file server: http://${FILE_HOST}:${FILE_PORT}/uploads/`,
  );
});

// ---- クライアント設定 ----
// 🔹 追加: Lavalink をぶら下げたクライアント型
type ShibakuClient = Client & {
  lavalink: LavalinkManager<Player>;
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
}) as ShibakuClient;

// ---- Lavalink 接続設定 ----

const lavalink = new LavalinkManager<Player>({
  nodes: [
    {
      id: "local",
      host: "127.0.0.1",
      port: 2333,
      authorization: "youshallnotpass", // application.yml の password
      secure: false,
    },
  ],

  // 🔹 ここは sendPayload ではなく sendToShard
  sendToShard: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    guild.shard.send(payload);
  },

  client: {
    id: "0", // ここはダミーでOK（後で init で上書き）
    username: "shibaku-bot",
  },

  // （オプション）お好みで
  autoSkip: true,
  playerOptions: {
    defaultSearchPlatform: "ytmsearch",
    clientBasedPositionUpdateInterval: 150,
    volumeDecrementer: 0.75,
    onDisconnect: {
      autoReconnect: true,
      destroyPlayer: false,
    },
    onEmptyQueue: {
      destroyAfterMs: 60_000,
    },
  },
  queueOptions: {
    maxPreviousTracks: 25,
  },
});

// client にぶら下げる
client.lavalink = lavalink;
// Discord の Raw イベントを Lavalink に渡す
client.on("raw", (data: Parameters<LavalinkManager<Player>["sendRawData"]>[0]) => {
  void client.lavalink.sendRawData(data);
});

// ---- 定数 ----
const OWNER_IDS = parseCsvIds(process.env.OWNER_IDS);
const IMMUNE_IDS = parseCsvIds(process.env.IMMUNE_IDS);

// Ready
client.once(Events.ClientReady, async (b: Client<true>) => {
  console.log(`✅ ログイン完了: ${b.user.tag}`);

  // Lavalink と Bot 情報を紐付け（ヘッダーは ASCII のみ）
  await client.lavalink.init({
    id: b.user.id,
    username: "shibakubot", // 日本語を入れない
  });
});

// ---- コマンドハンドラ ----
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const name = interaction.commandName;

  if (interaction.inGuild()) {
    const gid = interaction.guildId;
    if (!gid) return;
    if (getMaintenanceEnabled(gid) && name !== "maintenance" && name !== "mt") {
      await interaction.reply({
        content: "⚠️ 現在メンテナンス中です。しばらくお待ちください。",
        ephemeral: true,
      });
      return;
    }
  }

  if (name === "ping") {
    await handlePing(interaction);
    return;
  }

  // /sbk
  if (name === "sbk") {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "サーバー内で使ってね。",
        ephemeral: true,
      });
      return;
    }

    const gid = interaction.guildId;
    if (!gid) {
      await interaction.reply({
        content: "サーバー情報を取得できませんでした。",
        ephemeral: true,
      });
      return;
    }
    const user = interaction.options.getUser("user", true);

    if (user.bot || user.id === interaction.client.user?.id) {
      await interaction.reply({
        content: "BOTは対象外です。",
        ephemeral: true,
      });
      return;
    }

    const localImmune = isImmune(gid, user.id);
    const globalImmune = IMMUNE_IDS.includes(user.id);
    if (localImmune || globalImmune) {
      await interaction.reply({
        content: "このユーザーはしばき免除のため実行できません。",
        ephemeral: true,
      });
      return;
    }

    const { min: SBK_MIN, max: SBK_MAX } = getSbkRange(gid);

    // ★ optional 取得（count は string で受ける）
    const countStr = interaction.options.getString("count");
    let reason = interaction.options.getString("reason");

    // ★ count の決定（BigInt）
    let countBig: bigint;

    if (!countStr) {
      // 未指定 → ランダム（この時だけ範囲内）
      const n = randomInt(SBK_MIN, SBK_MAX);
      countBig = BigInt(n);
    } else {
      // 指定 → BigIntとしてそのまま通す（上限で丸めない）
      if (!/^\d+$/.test(countStr)) {
        await interaction.reply({
          content: "count は数字で入力してね。",
          ephemeral: true,
        });
        return;
      }

      countBig = BigInt(countStr);

      // 0回やマイナス（今回は許してない）を防ぐ最低保証
      if (countBig < 1n) countBig = 1n;
    }

    // 範囲補正（BigIntでやる）
    const minB = BigInt(SBK_MIN);
    const maxB = BigInt(SBK_MAX);
    if (countBig < minB) countBig = minB;
    if (countBig > maxB) countBig = maxB;

    // ★ reason 未指定 → ランダム
    if (!reason) reason = randomReason();

   const nextCount = addCountGuild(
     gid,
     user.id,
     countBig,
     interaction.user.id, // actorId
     reason               // reason（ランダム確定後のやつ）
    );


    const member = await interaction
      .guild!.members.fetch(user.id)
      .catch(() => null);
    const display = member?.displayName ?? user.tag;
    const MAX_REASON = 2000;
    const safeReason =
      reason.length > MAX_REASON ? reason.slice(0, MAX_REASON) + "…" : reason;

    await interaction.reply(
  `**${display}** を **${formatBigIntJP(countBig)}回** しばきました！\n` +
  `（累計 ${formatBigIntJP(nextCount)}回 / 今回 +${formatBigIntJP(countBig)}回）\n` +
  `理由: ${safeReason}`
  );


    await sendLog(
      interaction,
      interaction.user.id,
      user.id,
      reason,
      countBig,
      nextCount,
    );
  }

  // /check
  if (name === "check") {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "サーバー内で使用してください。",
        ephemeral: true,
      });
      return;
    }
    const gid = interaction.guildId;
    if (!gid) {
      await interaction.reply({
        content: "サーバー情報を取得できませんでした。",
        ephemeral: true,
      });
      return;
    }
    const target = interaction.options.getUser("user", true);
    const store = loadGuildStore(gid);
    const count = store.counts[target.id] ?? 0n;
    const member = await interaction
      .guild!.members.fetch(target.id)
      .catch(() => null);
    const displayName = member?.displayName ?? target.tag;
    await interaction.reply({
      content: `**${displayName}** は今までに ${count} 回 しばかれました。`,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // 外部ハンドラ
  if (name === "menu") {
    await handleMenu(interaction);
    return;
  }
  if (name === "suimin") {
    await handleSuimin(interaction);
    return;
  }
  if (name === "members") {
    await handleMembers(interaction);
    return;
  }
  if (name === "room") {
    await handleRoom(interaction);
    return;
  }
  if (name === "help") {
    await handleHelp(interaction);
    return;
  }
  if (name === "maintenance" || name === "mt") {
    await handleMaintenance(interaction);
    return;
  }
  if (name === "stats") {
    await handleStats(interaction);
    return;
  }
  if (name === "reset") {
    await handleReset(interaction);
    return;
  }
  if (name === "top") {
    await handleTop(interaction);
    return;
  }

  // /control（管理者 / 開発者のみ）
  if (name === "control") {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "このコマンドはサーバー内でのみ使用できます。",
        ephemeral: true,
      });
      return;
    }
    const isAdmin =
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
      false;
    const isOwner = OWNER_IDS.includes(interaction.user.id);
    if (!isAdmin && !isOwner) {
      await interaction.reply({
        content: "権限がありません。（管理者または開発者のみ）",
        ephemeral: true,
      });
      return;
    }

    const gid = interaction.guildId;
    if (!gid) {
      await interaction.reply({
        content: "サーバー情報を取得できませんでした。",
        ephemeral: true,
      });
      return;
    }
    const target = interaction.options.getUser("user", true);
    const newCountRaw = interaction.options.getString("count", true);
    let newCount: bigint;
    try {
      newCount = BigInt(newCountRaw);
      if (newCount < 0n) newCount = 0n;
    } catch {
      newCount = 0n;
    }
    const after = setCountGuild(gid, target.id, newCount);

    const store = loadGuildStore(gid);
    store.counts[target.id] = after;

    const member = await interaction
      .guild!.members.fetch(target.id)
      .catch(() => null);
    const displayName = member?.displayName ?? target.tag;

    await interaction.reply({
      content: `**${displayName}** のしばかれ回数を **${after} 回** に設定しました。`,
      allowedMentions: { parse: [] },
      ephemeral: true,
    });
    return;
  }

  // /immune（管理者 / 開発者のみ） …（既存のまま）
  if (name === "immune") {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: "このコマンドはサーバー内でのみ使用できます。",
        ephemeral: true,
      });
      return;
    }
    const isAdmin =
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
      false;
    const isOwner = OWNER_IDS.includes(interaction.user.id);
    if (!isAdmin && !isOwner) {
      await interaction.reply({
        content: "権限がありません。（管理者または開発者のみ）",
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId;
    if (!gid) {
      await interaction.reply({
        content: "サーバー情報を取得できませんでした。",
        ephemeral: true,
      });
      return;
    }

    if (sub === "add") {
      const u = interaction.options.getUser("user", true);
      if (u.bot) {
        await interaction.reply({
          content: "BOTはそもそもしばけません。",
          ephemeral: true,
        });
        return;
      }
      const added = addImmuneId(gid, u.id);
      await interaction.reply({
        content: added
          ? `\`${u.tag}\` を免除リストに追加しました。`
          : `\`${u.tag}\` はすでに免除リストに存在します。`,
        allowedMentions: { parse: [] },
        ephemeral: true,
      });
      return;
    }

    if (sub === "remove") {
      const u = interaction.options.getUser("user", true);
      const removed = removeImmuneId(gid, u.id);
      await interaction.reply({
        content: removed
          ? `\`${u.tag}\` を免除リストから削除しました。`
          : `\`${u.tag}\` は免除リストにありません。`,
        allowedMentions: { parse: [] },
        ephemeral: true,
      });
      return;
    }

    if (sub === "list") {
      const ids = getImmuneList(gid);
      const global = IMMUNE_IDS;

      const textLocal = ids.length
        ? ids.map((x, i) => `${i + 1}. <@${x}> (\`${x}\`)`).join("\n")
        : "（なし）";
      const textGlobal = global.length
        ? global.map((x, i) => `${i + 1}. <@${x}> (\`${x}\`)`).join("\n")
        : "（なし）";

      await interaction.reply({
        embeds: [
          {
            title: "🛡️ しばき免除リスト",
            fields: [
              { name: "ギルド免除", value: textLocal },
              { name: "グローバル免除（.env IMMUNE_IDS）", value: textGlobal },
            ],
          },
        ],
        allowedMentions: { parse: [] },
        ephemeral: true,
      });
      return;
    }
  }
});

void client.login(TOKEN);

// index.ts 最後あたり
client.on("messageCreate", async (message: Message) => {
  if (message.guildId && getMaintenanceEnabled(message.guildId)) return;
  await handleMusicMessage(message);
});
