import { ChannelType, SlashCommandBuilder } from "discord.js";
import { SLASH_COMMAND } from "../constants/commands";

export type HelpCommand = Readonly<{
  name: string;
  description: string;
}>;

type CommandDefinition = Readonly<{
  name: string;
  description: string;
  createBuilder: () => { toJSON: SlashCommandBuilder["toJSON"] };
  visibleInHelp?: boolean;
}>;

const MAINTENANCE_MODE_CHOICES = [
  { name: "on", value: "on" },
  { name: "off", value: "off" },
] as const;

const commandDefinitions: readonly CommandDefinition[] = [
  {
    name: SLASH_COMMAND.ping,
    description: "BOTが生きているか確認する",
    createBuilder: () =>
      new SlashCommandBuilder()
        .setName(SLASH_COMMAND.ping)
        .setDescription("BOTが生きているか確認する"),
  },
  {
    name: SLASH_COMMAND.sbk,
    description: "ユーザーをしばく",
    createBuilder: () =>
      new SlashCommandBuilder()
        .setName(SLASH_COMMAND.sbk)
        .setDescription("ユーザーをしばく")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("しばく対象")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("count")
            .setDescription("しばく回数（省略可・ランダム）")
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("理由（省略可・ランダム）")
            .setRequired(false),
        ),
  },
  {
    name: SLASH_COMMAND.menu,
    description: "しばくbot メニューを表示する",
    createBuilder: () =>
      new SlashCommandBuilder()
        .setName(SLASH_COMMAND.menu)
        .setDescription("しばくbot メニューを表示する"),
  },
  {
    name: SLASH_COMMAND.help,
    description: "コマンド一覧を表示する",
    createBuilder: () =>
      new SlashCommandBuilder()
        .setName(SLASH_COMMAND.help)
        .setDescription("コマンド一覧を表示する"),
  },
  {
    name: SLASH_COMMAND.suimin,
    description: "指定ユーザーをVCに移動",
    createBuilder: () =>
      new SlashCommandBuilder()
        .setName(SLASH_COMMAND.suimin)
        .setDescription("指定ユーザーをVCに移動")
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("移動するユーザー")
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("移動先のボイスチャンネル")
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(true),
        ),
  },
  {
    name: SLASH_COMMAND.maintenance,
    description: "メンテナンスモードを切り替える（管理者のみ）",
    createBuilder: () =>
      new SlashCommandBuilder()
        .setName(SLASH_COMMAND.maintenance)
        .setDescription("メンテナンスモードを切り替える（管理者のみ）")
        .addStringOption((opt) =>
          opt
            .setName("mode")
            .setDescription("on / off を指定")
            .setRequired(true)
            .addChoices(...MAINTENANCE_MODE_CHOICES),
        ),
  },
  {
    name: SLASH_COMMAND.maintenanceAlias,
    description: "メンテナンスモードを切り替える（短縮コマンド）",
    createBuilder: () =>
      new SlashCommandBuilder()
        .setName(SLASH_COMMAND.maintenanceAlias)
        .setDescription("メンテナンスモードを切り替える（短縮コマンド）")
        .addStringOption((opt) =>
          opt
            .setName("mode")
            .setDescription("on / off を指定")
            .setRequired(true)
            .addChoices(...MAINTENANCE_MODE_CHOICES),
        ),
  },
];

export function getSlashCommandJson(): Array<
  ReturnType<SlashCommandBuilder["toJSON"]>
> {
  return commandDefinitions.map((definition) =>
    definition.createBuilder().toJSON(),
  );
}

export const HELP_COMMANDS: readonly HelpCommand[] = commandDefinitions
  .filter((definition) => definition.visibleInHelp !== false)
  .map((definition) => ({
    name: `/${definition.name}`,
    description: definition.description,
  }));
