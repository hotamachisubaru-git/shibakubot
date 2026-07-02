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
    summary: "しばき回数の確認と集計に使います。",
    permissionNote: "誰でも利用できます。",
    actions: [
      { customId: "menu_top", label: "ランキング", style: ButtonStyle.Primary, summary: "しばかれ回数の上位を確認します。" },
      { customId: "menu_members", label: "メンバー一覧", style: ButtonStyle.Secondary, summary: "対象メンバーと回数をまとめて確認します。" },
      { customId: "menu_stats", label: "サーバー統計", style: ButtonStyle.Secondary, summary: "総回数や対象人数を確認します。" },
      { customId: "menu_check", label: "回数確認", style: ButtonStyle.Secondary, summary: "指定ユーザーのしばかれ回数を確認します。" },
      { customId: "menu_help", label: "使い方", style: ButtonStyle.Secondary, summary: "カテゴリ別の使い分けを確認します。" },
    ],
  },
  {
    page: 2,
    navCustomId: "menu_page_admin",
    navLabel: "管理設定",
    title: "管理設定",
    summary: "しばき回数のルールと対象者を管理します。",
    permissionNote: "管理者 / 開発者が利用できます。",
    actions: [
      { customId: "menu_limit", label: "回数レンジ", style: ButtonStyle.Secondary, summary: "ランダム回数の最小値と最大値を設定します。" },
      { customId: "menu_immune", label: "免除管理", style: ButtonStyle.Secondary, summary: "免除ユーザーの追加・削除・一覧確認を行います。" },
      { customId: "menu_control", label: "回数を設定", style: ButtonStyle.Secondary, summary: "特定ユーザーの回数を直接変更します。" },
      { customId: "menu_reset", label: "リセット", style: ButtonStyle.Secondary, summary: "対象または全員のしばき回数を0に戻します。" },
    ],
  },
  {
    page: 3,
    navCustomId: "menu_page_admin2",
    navLabel: "ログ/保守",
    title: "ログと保守",
    summary: "監査、設定、バックアップなどの運用作業を行います。",
    permissionNote: "監査ログ / ログ設定 / システム統計 / バックアップ / メンテナンス切替は管理者または開発者、開発者ツールは開発者のみ利用できます。",
    actions: [
      { customId: "menu_audit", label: "監査ログ", style: ButtonStyle.Secondary, summary: "最近のしばき操作履歴を確認します。" },
      { customId: "menu_settings", label: "ログ設定", style: ButtonStyle.Secondary, summary: "ログ送信チャンネルを設定します。" },
      { customId: "menu_devtools", label: "開発者専用", style: ButtonStyle.Secondary, summary: "DBチェックや最適化を実行します。" },
      { customId: "menu_sysstats", label: "システム統計", style: ButtonStyle.Secondary, summary: "Bot稼働状況とサーバー負荷を確認します。" },
      { customId: "menu_backup", label: "バックアップ", style: ButtonStyle.Secondary, summary: "ギルドDBの保存と一覧確認を行います。" },
      { customId: "menu_maintenance", label: "メンテ切替", style: ButtonStyle.Secondary, summary: "メンテナンスモードを切り替えます。" },
    ],
  },
  {
    page: 4,
    navCustomId: "menu_page_event",
    navLabel: "イベント",
    title: "イベント",
    summary: "イベントを確認します。",
    permissionNote: "誰でも確認できます。",
    actions: [
      { customId: "menu_event", label: "イベント確認", style: ButtonStyle.Secondary, summary: "イベントを確認します。" },
      { customId: "menu_event_manage", label: "イベント管理", style: ButtonStyle.Secondary, summary: "イベントの追加・削除を行います。" },
      { customId: "menu_event_participate", label: "イベント参加", style: ButtonStyle.Secondary, summary: "イベントへの参加・不参加を切り替えます。" },
      { customId: "menu_event_notify", label: "イベント通知", style: ButtonStyle.Secondary, summary: "イベント開始前の通知を設定します。" },
      { customId: "menu_event_help", label: "イベントヘルプ", style: ButtonStyle.Secondary, summary: "イベント機能の使い方を確認します。" },
      { customId: "menu_event_export", label: "イベントエクスポート", style: ButtonStyle.Secondary, summary: "イベント情報をCSVでエクスポートします。" },
    ],
  },
] as const;

export function getMenuPageDefinition(page: number): MenuPageDefinition {
  return MENU_PAGE_DEFINITIONS.find((d) => d.page === page) ?? MENU_PAGE_DEFINITIONS[0];
}

export function getMenuPageByNavCustomId(customId: string): MenuPageDefinition | null {
  return MENU_PAGE_DEFINITIONS.find((d) => d.navCustomId === customId) ?? null;
}
