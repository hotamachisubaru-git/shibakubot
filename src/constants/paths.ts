import path from "node:path";

export const PROJECT_ROOT = process.cwd();
export const DATA_ROOT = path.join(PROJECT_ROOT, "data");
export const GUILD_DB_ROOT = path.join(DATA_ROOT, "guilds");
export const BACKUP_ROOT = path.join(PROJECT_ROOT, "backup");
