import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getDomainStore } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";

// Owner user ID — set via BOT_OWNER_ID env var. If unset, admin features are disabled.
function getOwnerId(): number | undefined {
  const id = process.env.BOT_OWNER_ID;
  if (!id) return undefined;
  const n = parseInt(id);
  return isNaN(n) ? undefined : n;
}

const composer = new Composer<Ctx>();

// Admin dashboard — owner only
composer.callbackQuery("admin:dashboard", async (ctx) => {
  await ctx.answerCallbackQuery();
  const ownerId = getOwnerId();
  if (ownerId === undefined || ctx.from!.id !== ownerId) {
    await ctx.editMessageText("⛔ This feature is for the bot owner only.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const store = getDomainStore();
  const userIds = await store.getAllUserIds();
  const recentAlerts = await store.getRecentAlertEvents(10);

  // Aggregate alert stats
  const alertCounts: Record<string, number> = {};
  for (const event of recentAlerts) {
    alertCounts[event.coin] = (alertCounts[event.coin] ?? 0) + 1;
  }
  const topCoins = Object.entries(alertCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const alertSummary = topCoins.length > 0
    ? topCoins.map(([coin, count]) => `  ${coin}: ${count} alerts`).join("\n")
    : "  No alerts fired yet.";

  await ctx.editMessageText(
    "📊 Admin Dashboard\n\n" +
    `Active users: ${userIds.length}\n` +
    `Recent alerts: ${recentAlerts.length}\n\n` +
    `Top alerted coins:\n${alertSummary}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🔄 Refresh", "admin:dashboard")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

export default composer;
