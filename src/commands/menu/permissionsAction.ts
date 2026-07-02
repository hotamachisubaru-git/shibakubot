import {
  EmbedBuilder,
  PermissionFlagsBits,
  type GuildMember,
  type PermissionsBitField,
} from "discord.js";
import type { MenuActionHandler } from "./context";

type PermissionCheck = {
  label: string;
  flag: bigint;
};

const TEXT_PERMISSION_CHECKS: readonly PermissionCheck[] = [
  { label: "View Channels", flag: PermissionFlagsBits.ViewChannel },
  { label: "Send Messages", flag: PermissionFlagsBits.SendMessages },
  { label: "Embed Links", flag: PermissionFlagsBits.EmbedLinks },
  { label: "Attach Files", flag: PermissionFlagsBits.AttachFiles },
  { label: "Read Message History", flag: PermissionFlagsBits.ReadMessageHistory },
];

const VOICE_PERMISSION_CHECKS: readonly PermissionCheck[] = [
  { label: "Connect", flag: PermissionFlagsBits.Connect },
  { label: "Speak", flag: PermissionFlagsBits.Speak },
];

function formatPermissionLines(
  permissions: PermissionsBitField | null,
  checks: readonly PermissionCheck[],
  unavailableMessage: string,
): string {
  if (!permissions) {
    return checks.map((check) => `- ${check.label}: 未確認（${unavailableMessage}）`).join("\n");
  }

  return checks
    .map((check) => `- ${check.label}: ${permissions.has(check.flag) ? "OK" : "不足"}`)
    .join("\n");
}

async function fetchBotMember(
  buttonGuild: NonNullable<Parameters<MenuActionHandler>[1]["guild"]>,
  clientUserId: string,
): Promise<GuildMember | null> {
  return buttonGuild.members.me ?? buttonGuild.members.fetch(clientUserId).catch(() => null);
}

export const handlePermissionsAction: MenuActionHandler = async (
  _context,
  button,
) => {
  if (button.customId !== "menu_permissions") return false;

  const guild = button.guild;
  const clientUser = button.client.user;
  if (!guild || !clientUser) {
    await button.reply({
      content: "⚠️ サーバーまたはBot情報を取得できませんでした。",
      flags: "Ephemeral",
    });
    return true;
  }

  const botMember = await fetchBotMember(guild, clientUser.id);
  if (!botMember) {
    await button.reply({
      content: "⚠️ Botのメンバー情報を取得できませんでした。",
      flags: "Ephemeral",
    });
    return true;
  }

  const textPermissions =
    button.channel && "permissionsFor" in button.channel
      ? button.channel.permissionsFor(botMember)
      : null;

  const requester = await guild.members.fetch(button.user.id).catch(() => null);
  const voiceChannel = requester?.voice.channel ?? null;
  const voicePermissions = voiceChannel?.permissionsFor(botMember) ?? null;

  const embed = new EmbedBuilder()
    .setTitle("Bot権限確認")
    .setDescription("READMEの必要権限に沿って、このサーバーでのBot権限を確認します。")
    .addFields(
      {
        name: `テキスト: ${button.channel?.toString() ?? "不明"}`,
        value: formatPermissionLines(
          textPermissions,
          TEXT_PERMISSION_CHECKS,
          "チャンネル情報を取得できません",
        ),
      },
      {
        name: `音声: ${voiceChannel?.name ?? "未参加"}`,
        value: formatPermissionLines(
          voicePermissions,
          VOICE_PERMISSION_CHECKS,
          "確認者がVCに参加していません",
        ),
      },
    )
    .setFooter({ text: "音声権限は、確認者が参加中のVCを対象に判定します。" });

  await button.reply({
    embeds: [embed],
    flags: "Ephemeral",
  });

  return true;
};
