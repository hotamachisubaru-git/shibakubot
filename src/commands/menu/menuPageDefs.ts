// src/commands/menu/menuPageDefs.ts
import { ButtonStyle } from "discord.js";
import { getRuntimeConfig } from "../../config/runtime";
import { SETTING_KEYS } from "../../constants/settings";
import { COMMON_MESSAGES } from "../../constants/messages";

const runtimeConfig = getRuntimeConfig();

export const OWNER_IDS = runtimeConfig.discord.ownerIds;
export const PAGE_SIZE = 10;
export const AUDIT_LIMIT = 10;
export const BACKUP_LIST_LIMIT = 5;
export const LOG_CHANNEL_KEY = SETTING_KEYS.logChannelId;
export const EMBED_DESC_LIMIT = 4096;
export const UNKNOWN_GUILD_MESSAGE = `⚠️ ${COMMON_MESSAGES.guildUnavailable}`;

export type MenuActionDefinition = Readonly<{
  customId: string;
  label: string;
  style: ButtonStyle;
  summary: string;
}>;

export type MenuPageDefinition = Readonly<{
  page: number;
  navCustomId: string;
  navLabel: string;
  title: string;
  summary: string;
  permissionNote: string;
  actions: readonly MenuActionDefinition[];
}>;

export const MENU_PAGE_DEFINITIONS: readonly MenuPageDefinition[] = [
  {
    page: 1,
    navCustomId: "menu_page_basic",
    navLabel: "基本",
    title: "基本メニュー",
    summary: "ランキング確認やサーバー状況の確認に使います。",
    permissionNote: "誰でも利用できます。",
    actions: [
      { customId: "menu_top", label: "ランキング", style: ButtonStyle.Primary, summary: "しばかれ回数の上位を確認します。" },
      { customId: "menu_members", label: "メンバー一覧", style: ButtonStyle.Secondary, summary: "対象メンバーと回数をまとめて確認します。" },
      { customId: "menu_stats", label: "サーバー統計", style: ButtonStyle.Secondary, summary: "総回数や対象人数を確認します。" },
      { customId: "menu_help", label: "使い方", style: ButtonStyle.Secondary, summary: "カテゴリ別の使い分けを確認します。" },
      { customId: "menu_medals", label: "メダルコーナー", style: ButtonStyle.Success, summary: "SkyDream Type-A でメダル抽選に挑戦します。" },
    ],
  },
  {
    page: 2,
    navCustomId: "menu_page_vc",
    navLabel: "VC操作",
    title: "VC操作",
    summary: "ボイスチャンネル参加者を一括で操作します。",
    permissionNote: "管理者 / VC権限保持者 / 開発者が利用できます。",
    actions: [
      { customId: "menu_movevc", label: "VC移動", style: ButtonStyle.Primary, summary: "選択したメンバーを別のVCへ移動します。" },
      { customId: "menu_vcdisconnect", label: "VC切断", style: ButtonStyle.Danger, summary: "選択したメンバーをVCから切断します。" },
      { customId: "menu_vcmute", label: "VCミュート", style: ButtonStyle.Secondary, summary: "選択したメンバーをサーバーミュートします。" },
      { customId: "menu_vcunmute", label: "ミュート解除", style: ButtonStyle.Secondary, summary: "サーバーミュートを解除します。" },
    ],
  },
  {
    page: 3,
    navCustomId: "menu_page_admin",
    navLabel: "管理設定",
    title: "管理設定",
    summary: "しばき回数のルールと対象者を管理します。",
    permissionNote: "管理者 / 開発者が利用できます。",
    actions: [
      { customId: "menu_limit", label: "回数レンジ", style: ButtonStyle.Secondary, summary: "ランダム回数の最小値と最大値を設定します。" },
      { customId: "menu_immune", label: "免除管理", style: ButtonStyle.Secondary, summary: "免除ユーザーの追加・削除・一覧確認を行います。" },
      { customId: "menu_control", label: "回数を設定", style: ButtonStyle.Secondary, summary: "特定ユーザーの回数を直接変更します。" },
    ],
  },
  {
    page: 4,
    navCustomId: "menu_page_admin2",
    navLabel: "ログ/保守",
    title: "ログと保守",
    summary: "監査、設定、バックアップなどの運用作業を行います。",
    permissionNote: "監査ログ / ログ設定 / システム統計 / バックアップは管理者または開発者、開発者ツールは開発者のみ利用できます。",
    actions: [
      { customId: "menu_audit", label: "監査ログ", style: ButtonStyle.Secondary, summary: "最近のしばき操作履歴を確認します。" },
      { customId: "menu_settings", label: "ログ設定", style: ButtonStyle.Secondary, summary: "ログ送信チャンネルを設定します。" },
      { customId: "menu_devtools", label: "開発者専用", style: ButtonStyle.Secondary, summary: "DBチェックや最適化を実行します。" },
      { customId: "menu_sysstats", label: "システム統計", style: ButtonStyle.Secondary, summary: "Bot稼働状況とサーバー負荷を確認します。" },
      { customId: "menu_backup", label: "バックアップ", style: ButtonStyle.Secondary, summary: "ギルドDBの保存と一覧確認を行います。" },
    ],
  },
  {
    page: 5,
    navCustomId: "menu_page_tools",
    navLabel: "便利",
    title: "便利機能",
    summary: "確認、投票、運用補助などをまとめています。",
    permissionNote: "回数確認 / 月曜煽り / 投票は誰でも利用できます。メンテナンス切替とAIチャット切替は管理者 / サーバーオーナー / 開発者、リセットは管理者 / 開発者のみ利用できます。",
    actions: [
      { customId: "menu_check", label: "回数確認", style: ButtonStyle.Secondary, summary: "指定ユーザーのしばかれ回数を確認します。" },
      { customId: "menu_monday", label: "月曜煽り", style: ButtonStyle.Secondary, summary: "日曜なら月曜日煽りを送信します。" },
      { customId: "menu_reset", label: "リセット", style: ButtonStyle.Secondary, summary: "対象または全員のしばき回数を0に戻します。" },
      { customId: "menu_maintenance", label: "メンテ切替", style: ButtonStyle.Secondary, summary: "メンテナンスモードを切り替えます。" },
      { customId: "menu_ai_chat", label: "AIチャット切替", style: ButtonStyle.Secondary, summary: "AIチャット機能の有効/無効を切り替えます。" },
      { customId: "menu_vs", label: "投票", style: ButtonStyle.Primary, summary: "2択投票を作成します。" },
    ],
  },
] as const;

export function getMenuPageDefinition(page: number): MenuPageDefinition {
  return MENU_PAGE_DEFINITIONS.find((d) => d.page === page) ?? MENU_PAGE_DEFINITIONS[0];
}

export function getMenuPageByNavCustomId(customId: string): MenuPageDefinition | null {
  return MENU_PAGE_DEFINITIONS.find((d) => d.navCustomId === customId) ?? null;
}
