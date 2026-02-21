import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  Interaction,
  Message,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { handleAiSlashCommand, isAiSlashCommand } from "./ai/handlers";
import { handleHelp } from "./commands/help";
import { handleMaintenance } from "./commands/maintenance";
import { handleMembers } from "./commands/members";
import { handleMenu } from "./commands/menu";
import { handlePing } from "./commands/ping";
import { handleReset } from "./commands/reset";
import { handleStats } from "./commands/stats";
import { handleSuimin } from "./commands/suiminbunihaire";
import { handleTop } from "./commands/top";
import { getRuntimeConfig } from "./config/runtime";
import { isMaintenanceCommand, SLASH_COMMAND } from "./constants/commands";
import { COMMON_MESSAGES } from "./constants/messages";
import {
  addCountGuild,
  addImmuneId,
  getImmuneList,
  getMaintenanceEnabled,
  getSbkRange,
  isImmune,
  loadGuildStore,
  removeImmuneId,
  setCountGuild,
} from "./data";
import { startFileServer } from "./fileserver/fileServer";
import { initLavalink } from "./lavalink";
import { sendLog } from "./logging";
import { handleMusicMessage } from "./music";
import { formatBigIntJP } from "./utils/formatCount";
import { randomInt, randomReason } from "./utils/sbkRandom";

type SlashHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>;

const runtimeConfig = getRuntimeConfig();
const TOKEN = runtimeConfig.discord.token;

if (!TOKEN) {
  throw new Error("Missing required environment variable: TOKEN");
}

startFileServer();

const OWNER_IDS = runtimeConfig.discord.ownerIds;
const IMMUNE_IDS = runtimeConfig.discord.immuneIds;
const MAX_REASON_LENGTH = runtimeConfig.app.maxLogReasonLength;
const ROOT_SLASH_HANDLERS: Readonly<Record<string, SlashHandler>> = {
  [SLASH_COMMAND.ping]: handlePing,
  [SLASH_COMMAND.menu]: handleMenu,
  [SLASH_COMMAND.suimin]: handleSuimin,
  [SLASH_COMMAND.members]: handleMembers,
  [SLASH_COMMAND.help]: handleHelp,
  [SLASH_COMMAND.maintenance]: handleMaintenance,
  [SLASH_COMMAND.maintenanceAlias]: handleMaintenance,
  [SLASH_COMMAND.stats]: handleStats,
  [SLASH_COMMAND.reset]: handleReset,
  [SLASH_COMMAND.top]: handleTop,
};

const client = initLavalink(
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
  }),
);

function hasAdminOrOwnerPermission(
  interaction: ChatInputCommandInteraction,
): boolean {
  const isAdmin =
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ??
    false;
  const isOwner = OWNER_IDS.has(interaction.user.id);
  return isAdmin || isOwner;
}

function normalizeCountInput(raw: string): bigint {
  try {
    const parsed = BigInt(raw);
    return parsed < 0n ? 0n : parsed;
  } catch {
    return 0n;
  }
}

async function handleSbk(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "サーバー内で使ってね。",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildUnavailable,
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("user", true);
  if (targetUser.bot || targetUser.id === interaction.client.user?.id) {
    await interaction.reply({
      content: "BOTは対象外です。",
      ephemeral: true,
    });
    return;
  }

  if (isImmune(guildId, targetUser.id) || IMMUNE_IDS.has(targetUser.id)) {
    await interaction.reply({
      content: "このユーザーはしばき免除のため実行できません。",
      ephemeral: true,
    });
    return;
  }

  const { min: sbkMin, max: sbkMax } = getSbkRange(guildId);
  const countRaw = interaction.options.getString("count");
  let reason = interaction.options.getString("reason") ?? randomReason();

  if (countRaw && !/^\d+$/.test(countRaw)) {
    await interaction.reply({
      content: "count は数字で入力してね。",
      ephemeral: true,
    });
    return;
  }

  let count = countRaw ? BigInt(countRaw) : BigInt(randomInt(sbkMin, sbkMax));
  if (count < 1n) count = 1n;

  const min = BigInt(sbkMin);
  const max = BigInt(sbkMax);
  if (count < min) count = min;
  if (count > max) count = max;

  const nextCount = addCountGuild(
    guildId,
    targetUser.id,
    count,
    interaction.user.id,
    reason,
  );

  const member = await interaction.guild?.members
    .fetch(targetUser.id)
    .catch(() => null);
  const displayName = member?.displayName ?? targetUser.tag;

  if (reason.length > MAX_REASON_LENGTH) {
    reason = `${reason.slice(0, MAX_REASON_LENGTH)}…`;
  }

  await interaction.reply(
    `**${displayName}** を **${formatBigIntJP(count)}回** しばきました！\n` +
      `（累計 ${formatBigIntJP(nextCount)}回 / 今回 +${formatBigIntJP(count)}回）\n` +
      `理由: ${reason}`,
  );

  await sendLog(
    interaction,
    interaction.user.id,
    targetUser.id,
    reason,
    count,
    nextCount,
  );
}

async function handleCheck(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "サーバー内で使用してください。",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildUnavailable,
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser("user", true);
  const store = loadGuildStore(guildId);
  const count = store.counts[target.id] ?? 0n;
  const member = await interaction.guild?.members.fetch(target.id).catch(() => null);
  const displayName = member?.displayName ?? target.tag;

  await interaction.reply({
    content: `**${displayName}** は今までに ${count} 回 しばかれました。`,
    allowedMentions: { parse: [] },
  });
}

async function handleControl(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (!hasAdminOrOwnerPermission(interaction)) {
    await interaction.reply({
      content: COMMON_MESSAGES.noPermissionAdminOrDev,
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildUnavailable,
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser("user", true);
  if (target.bot || target.id === interaction.client.user?.id) {
    await interaction.reply({
      content: "BOTは対象外です。",
      ephemeral: true,
    });
    return;
  }

  if (OWNER_IDS.has(target.id)) {
    await interaction.reply({
      content: "開発者は対象外です。",
      ephemeral: true,
    });
    return;
  }
  const newCountRaw = interaction.options.getString("count", true);
  const nextCount = normalizeCountInput(newCountRaw);
  const after = setCountGuild(guildId, target.id, nextCount);

  const member = await interaction.guild?.members.fetch(target.id).catch(() => null);
  const displayName = member?.displayName ?? target.tag;

  await interaction.reply({
    content: `**${displayName}** のしばかれ回数を **${after} 回** に設定しました。`,
    allowedMentions: { parse: [] },
    ephemeral: true,
  });
}

async function handleImmune(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildOnly,
      ephemeral: true,
    });
    return;
  }

  if (!hasAdminOrOwnerPermission(interaction)) {
    await interaction.reply({
      content: COMMON_MESSAGES.noPermissionAdminOrDev,
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: COMMON_MESSAGES.guildUnavailable,
      ephemeral: true,
    });
    return;
  }

  const subCommand = interaction.options.getSubcommand();

  if (subCommand === "add") {
    const user = interaction.options.getUser("user", true);
    if (user.bot) {
      await interaction.reply({
        content: "BOTはそもそもしばけません。",
        ephemeral: true,
      });
      return;
    }

    const added = addImmuneId(guildId, user.id);
    await interaction.reply({
      content: added
        ? `\`${user.tag}\` を免除リストに追加しました。`
        : `\`${user.tag}\` はすでに免除リストに存在します。`,
      allowedMentions: { parse: [] },
      ephemeral: true,
    });
    return;
  }

  if (subCommand === "remove") {
    const user = interaction.options.getUser("user", true);
    const removed = removeImmuneId(guildId, user.id);
    await interaction.reply({
      content: removed
        ? `\`${user.tag}\` を免除リストから削除しました。`
        : `\`${user.tag}\` は免除リストにありません。`,
      allowedMentions: { parse: [] },
      ephemeral: true,
    });
    return;
  }

  if (subCommand === "list") {
    const localIds = getImmuneList(guildId);
    const globalIds = Array.from(IMMUNE_IDS);

    const localText = localIds.length
      ? localIds.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join("\n")
      : "（なし）";
    const globalText = globalIds.length
      ? globalIds.map((id, i) => `${i + 1}. <@${id}> (\`${id}\`)`).join("\n")
      : "（なし）";

    await interaction.reply({
      embeds: [
        {
          title: "🛡️ しばき免除リスト",
          fields: [
            { name: "ギルド免除", value: localText },
            { name: "グローバル免除（.env IMMUNE_IDS）", value: globalText },
          ],
        },
      ],
      allowedMentions: { parse: [] },
      ephemeral: true,
    });
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ ログイン完了: ${readyClient.user.tag}`);

  await client.lavalink.init({
    id: readyClient.user.id,
    username: runtimeConfig.lavalink.username,
  });
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;
  if (
    interaction.guildId &&
    getMaintenanceEnabled(interaction.guildId) &&
    !isMaintenanceCommand(commandName)
  ) {
    await interaction.reply({
      content: "⚠️ 現在メンテナンス中です。しばらくお待ちください。",
      ephemeral: true,
    });
    return;
  }

  if (commandName === SLASH_COMMAND.sbk) {
    await handleSbk(interaction);
    return;
  }

  if (commandName === SLASH_COMMAND.check) {
    await handleCheck(interaction);
    return;
  }

  if (commandName === SLASH_COMMAND.control) {
    await handleControl(interaction);
    return;
  }

  if (commandName === SLASH_COMMAND.immune) {
    await handleImmune(interaction);
    return;
  }

  if (isAiSlashCommand(commandName)) {
    await handleAiSlashCommand(interaction);
    return;
  }

  const handler = ROOT_SLASH_HANDLERS[commandName];
  if (handler) {
    await handler(interaction);
  }
});

void client.login(TOKEN);

client.on("messageCreate", async (message: Message) => {
  if (message.guildId && getMaintenanceEnabled(message.guildId)) return;
  await handleMusicMessage(message);
});
