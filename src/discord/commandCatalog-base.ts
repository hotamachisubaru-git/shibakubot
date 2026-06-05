import { SlashCommandBuilder } from "discord.js";
import { SLASH_COMMAND } from "../constants/commands";
import type { CommandDefinition } from "./commandCatalog-types";
import { defineCommand } from "./commandCatalog-utils";

export const baseCommandDefinitions: readonly CommandDefinition[] = [
  defineCommand(SLASH_COMMAND.ping, "BOTが生きているか確認する"),
  defineCommand(SLASH_COMMAND.sbk, "ユーザーをしばく", (builder) => {
    builder
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
      );
  }),
  defineCommand(
    SLASH_COMMAND.ignore,
    "bot が自動で無視するユーザーを管理する",
    (builder) => {
      builder
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("指定ユーザーを bot の ignore 対象に追加する")
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("ignore するユーザー")
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("指定ユーザーを bot の ignore 対象から外す")
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("ignore 解除するユーザー")
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("list")
            .setDescription("現在の ignore 対象一覧を表示する"),
        );
    },
    {
      helpCommands: [
        { name: `/ignore add`, description: "bot が無視するユーザーを追加します" },
        { name: `/ignore remove`, description: "bot が無視するユーザーを解除します" },
        { name: `/ignore list`, description: "bot の ignore 一覧を表示します" },
      ],
    },
  ),
  defineCommand(SLASH_COMMAND.menu, "しばくbot メニューを表示する"),
  defineCommand(SLASH_COMMAND.help, "コマンド一覧を表示する"),
];
