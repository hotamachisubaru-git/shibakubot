import "dotenv/config";
import { registerCommands } from "./discord/deployCommands";

void registerCommands()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error: unknown) => {
    console.error("❌ 登録中にエラー:");
    if (
      typeof error === "object" &&
      error !== null &&
      "rawError" in error
    ) {
      console.error((error as { rawError: unknown }).rawError);
    }
    console.error(error);
    process.exitCode = 1;
  });
