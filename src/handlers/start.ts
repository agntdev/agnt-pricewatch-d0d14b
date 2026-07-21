import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard, registerMainMenuItem } from "../toolkit/index.js";

// Register main menu items — each feature adds its own button via registerMainMenuItem.
registerMainMenuItem({ label: "📋 Watchlist", data: "watchlist:view", order: 10 });
registerMainMenuItem({ label: "💰 Price", data: "price:menu", order: 20 });
registerMainMenuItem({ label: "🔔 Alerts", data: "alerts:menu", order: 30 });
registerMainMenuItem({ label: "⚙️ Settings", data: "settings:menu", order: 40 });

const WELCOME = "👋 Welcome! Tap a button below to get started.";

const composer = new Composer<Ctx>();

composer.command("start", async (ctx) => {
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
