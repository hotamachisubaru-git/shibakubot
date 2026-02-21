import { ChannelType, SlashCommandBuilder } from "discord.js";
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
  visibleInHelp?: boolean;
}>;

const MAINTENANCE_MODE_CHOICES = [
  { name: "on", value: "on" },
  { name: "off", value: "off" },
] as const;
const CHARACTER_CHOICES = listMainCharacterChoices();

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
    name: SLASH_COMMAND.monday,
    description: "月曜日煽りを送信する",
    createBuilder: () =>
      new SlashCommandBuilder()
        .setName(SLASH_COMMAND.monday)
        .setDescription("月曜日煽りを送信する"),
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
  {
    name: SLASH_COMMAND.chat,
    description: "GPTと会話します",
    createBuilder: () =>
      new SlashCommandBuilder()
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
  },
  {
    name: SLASH_COMMAND.reply,
    description: "指定メッセージに対してGPTで返信を作成します",
    createBuilder: () =>
      new SlashCommandBuilder()
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
  },
  {
    name: SLASH_COMMAND.regen,
    description: "直前の /reply を同じ条件で再生成します",
    createBuilder: () =>
      new SlashCommandBuilder()
        .setName(SLASH_COMMAND.regen)
        .setDescription("直前の /reply を同じ条件で再生成します")
        .addBooleanOption((option) =>
          option
            .setName("private")
            .setDescription("結果を自分だけに表示する（省略時は前回の /reply 設定）"),
        ),
  },
  {
    name: SLASH_COMMAND.image,
    description: "SDXLで画像を生成します",
    createBuilder: () =>
      new SlashCommandBuilder()
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
  },
  {
    name: SLASH_COMMAND.history,
    description: "直近の会話履歴を表示します",
    createBuilder: () =>
      new SlashCommandBuilder()
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
  },
  {
    name: SLASH_COMMAND.setPrompt,
    description: "会話に使うシステムプロンプトを更新します",
    createBuilder: () =>
      new SlashCommandBuilder()
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
  },
  {
    name: SLASH_COMMAND.setCharacter,
    description: "主要キャラクターの口調プリセットを適用します",
    createBuilder: () =>
      new SlashCommandBuilder()
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
  },
  {
    name: SLASH_COMMAND.chatReset,
    description: "AI会話の履歴とプロンプトをリセットします",
    createBuilder: () =>
      new SlashCommandBuilder()
        .setName(SLASH_COMMAND.chatReset)
        .setDescription("AI会話の履歴とプロンプトをリセットします"),
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
