import { SlashCommandBuilder } from "discord.js";
import { SLASH_COMMAND } from "../constants/commands";
import type { CommandDefinition } from "./commandCatalog-types";
import { defineCommand } from "./commandCatalog-utils";
import { getRuntimeConfig } from "../config/runtime";

const MAX_REASON_LENGTH = getRuntimeConfig().app.maxLogReasonLength;

export const baseCommandDefinitions: readonly CommandDefinition[] = [
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
          .setMaxLength(MAX_REASON_LENGTH)
          .setRequired(false),
      );
  }),
  defineCommand(
    SLASH_COMMAND.check,
    "ユーザーのしばかれ回数を確認する",
    (builder) => {
      builder.addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("確認するユーザー")
          .setRequired(true),
      );
    },
  ),
  defineCommand(
    SLASH_COMMAND.immune,
    "しばき免除ユーザーを管理する",
    (builder) => {
      builder
        .addSubcommand((subcommand) =>
          subcommand
            .setName("add")
            .setDescription("指定ユーザーをしばき免除に追加する")
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("免除するユーザー")
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("remove")
            .setDescription("指定ユーザーをしばき免除から外す")
            .addUserOption((option) =>
              option
                .setName("user")
                .setDescription("免除解除するユーザー")
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("list")
            .setDescription("現在のしばき免除一覧を表示する"),
        );
    },
    {
      helpCommands: [
        { name: `/immune add`, description: "しばき免除ユーザーを追加します" },
        { name: `/immune remove`, description: "しばき免除ユーザーを解除します" },
        { name: `/immune list`, description: "しばき免除一覧を表示します" },
      ],
    },
  ),
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
  defineCommand(
    SLASH_COMMAND.reset,
    "しばき回数をリセットする",
    (builder) => {
      builder
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("リセットするユーザー")
            .setRequired(false),
        )
        .addBooleanOption((opt) =>
          opt
            .setName("all")
            .setDescription("全員のしばき回数をリセットする")
            .setRequired(false),
        );
    },
  ),
  defineCommand(SLASH_COMMAND.menu, "しばくbot メニューを表示する"),
];
