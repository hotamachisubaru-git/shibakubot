import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  Interaction,
  Message,
  type ChatInputCommandInteraction,
} from "discord.js";
import { handleAiSlashCommand, isAiSlashCommand } from "./ai/handlers";
import { handleCheck } from "./commands/check";
import { handleControl } from "./commands/control";
import { handleHelp } from "./commands/help";
import { handleImmune } from "./commands/immune";
import { handleMaintenance } from "./commands/maintenance";
import { handleMembers } from "./commands/members";
import { handleMenu } from "./commands/menu";
import { handleMonday } from "./commands/monday";
import { handlePing } from "./commands/ping";
import { handleReset } from "./commands/reset";
import { handleSbk } from "./commands/sbk";
import { handleStats } from "./commands/stats";
import { handleSuimin } from "./commands/suiminbunihaire";
import { handleTop } from "./commands/top";
import { handleVs } from "./commands/vs";
import { getRuntimeConfig } from "./config/runtime";
import { isMaintenanceCommand, SLASH_COMMAND } from "./constants/commands";
import { getMaintenanceEnabled } from "./data";
import { startFileServer } from "./fileserver/fileServer";
import { initLavalink } from "./lavalink";
import { handleMusicMessage } from "./music";

type SlashHandler = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>;

const runtimeConfig = getRuntimeConfig();
const TOKEN = runtimeConfig.discord.token;

if (!TOKEN) {
  throw new Error("Missing required environment variable: TOKEN");
}

startFileServer();

const ROOT_SLASH_HANDLERS: Readonly<Record<string, SlashHandler>> = {
  [SLASH_COMMAND.ping]: handlePing,
  [SLASH_COMMAND.sbk]: handleSbk,
  [SLASH_COMMAND.check]: handleCheck,
  [SLASH_COMMAND.control]: handleControl,
  [SLASH_COMMAND.immune]: handleImmune,
  [SLASH_COMMAND.menu]: handleMenu,
  [SLASH_COMMAND.suimin]: handleSuimin,
  [SLASH_COMMAND.members]: handleMembers,
  [SLASH_COMMAND.help]: handleHelp,
  [SLASH_COMMAND.monday]: handleMonday,
  [SLASH_COMMAND.maintenance]: handleMaintenance,
  [SLASH_COMMAND.maintenanceAlias]: handleMaintenance,
  [SLASH_COMMAND.stats]: handleStats,
  [SLASH_COMMAND.reset]: handleReset,
  [SLASH_COMMAND.top]: handleTop,
  [SLASH_COMMAND.vs]: handleVs,
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

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`✅ ログイン完了: ${readyClient.user.tag}`);

  await client.lavalink.init({
    id: readyClient.user.id,
    username: runtimeConfig.lavalink.username,
  });

  client.lavalink.nodeManager.on("connect", (node) => {
    console.log(`[lavalink] node connected: ${node.id}`);
  });
  client.lavalink.nodeManager.on("disconnect", (node, reason) => {
    console.warn(`[lavalink] node disconnected: ${node.id}`, reason);
  });
  client.lavalink.nodeManager.on("error", (node, error, payload) => {
    console.error(`[lavalink] node error: ${node.id}`, error, payload);
  });
  client.lavalink.on("trackError", (player, track, payload) => {
    console.error(
      `[music] track error guild=${player.guildId} title=${track?.info?.title ?? "unknown"}`,
      payload?.exception?.message ?? payload,
    );
  });
  client.lavalink.on("trackStuck", (player, track, payload) => {
    console.error(
      `[music] track stuck guild=${player.guildId} title=${track?.info?.title ?? "unknown"}`,
      payload,
    );
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

  if (isAiSlashCommand(commandName)) {
    await handleAiSlashCommand(interaction);
    return;
  }

  const handler = ROOT_SLASH_HANDLERS[commandName];
  if (!handler) return;

  await handler(interaction);
});

void client.login(TOKEN);

client.on("messageCreate", async (message: Message) => {
  if (message.guildId && getMaintenanceEnabled(message.guildId)) return;
  await handleMusicMessage(message);
});
