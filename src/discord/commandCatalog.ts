import { SlashCommandBuilder } from "discord.js";
import { listMainCharacterChoices } from "../ai/character-presets";
import { SLASH_COMMAND } from "../constants/commands";

export type HelpCommand = Readonly<{
  name: string;
  description: string;
}>;

type CommandDefinition = Readonly<{
  name: string;
  description: string;
  createBuilder: () => { toJSON: SlashCommandBuilder["toJSON"] };
  helpCommands: readonly HelpCommand[];
}>;

const CHARACTER_CHOICES = listMainCharacterChoices();

function defineCommand(
  name: string,
  description: string,
  configure?: (builder: SlashCommandBuilder) => void,
  options?: { helpCommands?: readonly HelpCommand[] },
): CommandDefinition {
  return {
    name,
    description,
    helpCommands:
      options?.helpCommands ?? [
        {
          name: `/${name}`,
          description,
        },
      ],
    createBuilder: () => {
      const builder = new SlashCommandBuilder()
        .setName(name)
        .setDescription(description);
      configure?.(builder);
      return builder;
    },
  };
}

const baseCommandDefinitions: readonly CommandDefinition[] = [
  defineCommand(SLASH_COMMAND.ping, "BOTが生きているか確認する"),
  defineCommand(SLASH_COMMAND.help, "コマンド一覧を表示する"),
];

const aiCommandDefinitions: readonly CommandDefinition[] = [
  defineCommand(
    SLASH_COMMAND.ai,
    "AI機能をまとめたコマンド",
    (builder) => {
      builder
        .addSubcommand((subcommand) =>
          subcommand
            .setName(SLASH_COMMAND.chat)
            .setDescription("GPTと会話します")
            .addStringOption((option) =>
              option
                .setName("message")
                .setDescription("送信するメッセージ")
                .setRequired(true)
                .setMaxLength(500),
            )
            .addBooleanOption((option) =>
              option
                .setName("new_session")
                .setDescription("過去の履歴を破棄して新しい会話として送信する"),
            )
            .addBooleanOption((option) =>
              option
                .setName("private")
                .setDescription("返信を自分だけに表示する (エフェメラル)"),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName(SLASH_COMMAND.reply)
            .setDescription("指定メッセージに対してGPTで返信を作成します")
            .addStringOption((option) =>
              option
                .setName("message_id")
                .setDescription("返信先メッセージのID（同じチャンネル内）")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("instruction")
                .setDescription("返信時の追加指示（任意）")
                .setMaxLength(500),
            )
            .addBooleanOption((option) =>
              option
                .setName("new_session")
                .setDescription("過去の履歴を破棄して新しい会話として送信する"),
            )
            .addBooleanOption((option) =>
              option
                .setName("private")
                .setDescription("コマンド結果を自分だけに表示する (エフェメラル)"),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName(SLASH_COMMAND.regen)
            .setDescription("直前の /ai reply を同じ条件で再生成します")
            .addBooleanOption((option) =>
              option
                .setName("private")
                .setDescription("結果を自分だけに表示する（省略時は前回の /ai reply 設定）"),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName(SLASH_COMMAND.image)
            .setDescription("SDXLで画像を生成します")
            .addStringOption((option) =>
              option
                .setName("prompt")
                .setDescription("画像生成プロンプト")
                .setRequired(true)
                .setMaxLength(1000),
            )
            .addStringOption((option) =>
              option
                .setName("size")
                .setDescription("画像サイズ（例: 512x512）")
                .setMaxLength(20),
            )
            .addBooleanOption((option) =>
              option
                .setName("private")
                .setDescription("結果を自分だけに表示する (エフェメラル)"),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName(SLASH_COMMAND.history)
            .setDescription("直近の会話履歴を表示します")
            .addIntegerOption((option) =>
              option
                .setName("turns")
                .setDescription("表示する会話ターン数 (1-20)")
                .setMinValue(1)
                .setMaxValue(20),
            )
            .addBooleanOption((option) =>
              option
                .setName("private")
                .setDescription("履歴を自分だけに表示する (エフェメラル)"),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName(SLASH_COMMAND.setPrompt)
            .setDescription("会話に使うシステムプロンプトを更新します")
            .addStringOption((option) =>
              option
                .setName("content")
                .setDescription("新しいプロンプト内容")
                .setRequired(true)
                .setMaxLength(2000),
            )
            .addBooleanOption((option) =>
              option
                .setName("private")
                .setDescription("結果を自分だけに表示する (エフェメラル)"),
            )
            .addBooleanOption((option) =>
              option
                .setName("reset_history")
                .setDescription("変更後に会話履歴をクリアする（省略時はON）"),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName(SLASH_COMMAND.setCharacter)
            .setDescription("主要キャラクターの口調プリセットを適用します")
            .addStringOption((option) =>
              option
                .setName("character")
                .setDescription("適用するキャラクター")
                .setRequired(true)
                .addChoices(...CHARACTER_CHOICES),
            )
            .addBooleanOption((option) =>
              option
                .setName("private")
                .setDescription("結果を自分だけに表示する (エフェメラル)"),
            )
            .addBooleanOption((option) =>
              option
                .setName("reset_history")
                .setDescription("変更後に会話履歴をクリアする（省略時はON）"),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName(SLASH_COMMAND.chatReset)
            .setDescription("AI会話の履歴とプロンプトをリセットします"),
        );
    },
    {
      helpCommands: [
        { name: `/ai ${SLASH_COMMAND.chat}`, description: "GPTと会話します" },
        {
          name: `/ai ${SLASH_COMMAND.reply}`,
          description: "指定メッセージに対してGPTで返信を作成します",
        },
        {
          name: `/ai ${SLASH_COMMAND.regen}`,
          description: "直前の /ai reply を同じ条件で再生成します",
        },
        { name: `/ai ${SLASH_COMMAND.image}`, description: "SDXLで画像を生成します" },
        {
          name: `/ai ${SLASH_COMMAND.history}`,
          description: "直近の会話履歴を表示します",
        },
        {
          name: `/ai ${SLASH_COMMAND.setPrompt}`,
          description: "会話に使うシステムプロンプトを更新します",
        },
        {
          name: `/ai ${SLASH_COMMAND.setCharacter}`,
          description: "主要キャラクターの口調プリセットを適用します",
        },
        {
          name: `/ai ${SLASH_COMMAND.chatReset}`,
          description: "AI会話の履歴とプロンプトをリセットします",
        },
      ],
    },
  ),
];

const miscCommandDefinitions: readonly CommandDefinition[] = [];

const commandDefinitions: readonly CommandDefinition[] = [
  ...baseCommandDefinitions,
  ...aiCommandDefinitions,
  ...miscCommandDefinitions,
];

export function getSlashCommandJson(): Array<
  ReturnType<SlashCommandBuilder["toJSON"]>
> {
  return commandDefinitions.map((definition) =>
    definition.createBuilder().toJSON(),
  );
}

export const HELP_COMMANDS: readonly HelpCommand[] = commandDefinitions
  .flatMap((definition) => definition.helpCommands);
