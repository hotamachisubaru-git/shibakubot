import os from "os";
import { EmbedBuilder } from "discord.js";
import type { ButtonInteraction } from "discord.js";
import type { MenuActionHandler } from "./context";
import { requireAdminOrDev } from "./common";
import { formatBytes, formatDuration } from "./common";

const handleSystemStatsAction: MenuActionHandler = async (_context, button) => {
  if (button.customId !== "menu_sysstats") {
    return false;
  }

  if (
    !(await requireAdminOrDev(
      button,
      "システム統計は管理者/開発者のみ利用できます。",
    ))
  ) {
    return true;
  }

  await button.deferUpdate();

  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const wsPing = button.client.ws?.ping ?? -1;
  const embed = new EmbedBuilder().setTitle("システム統計").addFields(
    {
      name: "稼働時間",
      value: formatDuration(process.uptime() * 1000),
      inline: true,
    },
    { name: "Node", value: process.version, inline: true },
    {
      name: "WS Ping",
      value: wsPing >= 0 ? `${Math.round(wsPing)}ms` : "不明",
      inline: true,
    },
    {
      name: "メモリ",
      value: `RSS ${formatBytes(mem.rss)} / Heap ${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}`,
    },
    {
      name: "System",
      value: `${os.platform()} ${os.arch()} / CPU ${os.cpus().length} cores`,
    },
    {
      name: "RAM",
      value: `${formatBytes(totalMem - freeMem)} / ${formatBytes(totalMem)}`,
    },
    {
      name: "Bot",
      value: `Guilds ${button.client.guilds.cache.size} / Users ${button.client.users.cache.size} / Channels ${button.client.channels.cache.size}`,
    },
  );

  await button.followUp({ embeds: [embed], flags: "Ephemeral" });
  return true;
};

export { handleSystemStatsAction };
