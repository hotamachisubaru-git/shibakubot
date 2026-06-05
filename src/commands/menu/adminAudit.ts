import { EmbedBuilder } from "discord.js";
import type { MenuActionContext, MenuActionHandler } from "./context";
import { AUDIT_LIMIT, EMBED_DESC_LIMIT, requireAdminOrDev } from "./common";
import { getRecentLogs, getLogCount } from "../../data";
import { displayNameFrom } from "../../utils/displayNameUtil";
import { looksLikeSnowflake, safeSignedBigInt, joinLinesWithLimitOrNull } from "./common";

const handleAuditAction: MenuActionHandler = async (context, button) => {
  if (button.customId !== "menu_audit") {
    return false;
  }

  if (
    !(await requireAdminOrDev(
      button,
      "監査ログは管理者/開発者のみ利用できます。",
    ))
  ) {
    return true;
  }

  await button.deferUpdate();

  const logs = getRecentLogs(context.gid, AUDIT_LIMIT);
  if (!logs.length) {
    await button.followUp({
      content: "監査ログはまだありません。",
      flags: "Ephemeral",
    });
    return true;
  }

  const lines = await Promise.all(
    logs.map(async (log) => {
      const actorLabel = log.actor
        ? looksLikeSnowflake(log.actor)
          ? await displayNameFrom(button, log.actor)
          : log.actor
        : "不明";
      const targetLabel = await displayNameFrom(button, log.target);
      const delta = safeSignedBigInt(log.delta);
      const when = new Date(log.at).toLocaleString("ja-JP");
      const reasonRaw = (log.reason ?? "").replace(/\s+/g, " ").trim();
      const reason = reasonRaw
        ? reasonRaw.length > 40
          ? `${reasonRaw.slice(0, 40)}...`
          : reasonRaw
        : "（理由なし）";

      return `- ${when} ${actorLabel} -> ${targetLabel} (${delta}) ${reason}`;
    }),
  );

  const desc =
    joinLinesWithLimitOrNull(lines, EMBED_DESC_LIMIT) ??
    "（表示できるログがありません）";

  const total = getLogCount(context.gid);
  const embed = new EmbedBuilder()
    .setTitle("監査ログ（しばき）")
    .setDescription(desc)
    .setFooter({ text: `最新 ${logs.length} 件 / 全 ${total} 件` });

  await button.followUp({ embeds: [embed], flags: "Ephemeral" });
  return true;
};

export { handleAuditAction };
