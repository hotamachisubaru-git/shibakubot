"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const deployCommands_1 = require("./discord/deployCommands");
void (0, deployCommands_1.registerCommands)()
    .then(() => {
    process.exitCode = 0;
})
    .catch((error) => {
    console.error("❌ 登録中にエラー:");
    if (typeof error === "object" &&
        error !== null &&
        "rawError" in error) {
        console.error(error.rawError);
    }
    console.error(error);
    process.exitCode = 1;
});
