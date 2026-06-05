// commandCatalog.ts - リファクタリング済み
// 個別ファイルに分割済み:
//   commandCatalog-types.ts  - 型定義
//   commandCatalog-utils.ts  - defineCommand ヘルパー
//   commandCatalog-base.ts   - baseCommandDefinitions
//   commandCatalog-ai.ts     - aiCommandDefinitions

export type { HelpCommand } from "./commandCatalog-types";

export { baseCommandDefinitions } from "./commandCatalog-base";
export { aiCommandDefinitions } from "./commandCatalog-ai";

import { baseCommandDefinitions } from "./commandCatalog-base";
import { aiCommandDefinitions } from "./commandCatalog-ai";
import { HELP_COMMANDS, getSlashCommandJson } from "./commandCatalog-core";

export { HELP_COMMANDS, getSlashCommandJson };
