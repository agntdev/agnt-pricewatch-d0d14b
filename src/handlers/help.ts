import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const HELP =
  "ℹ️ Crypto Watcher lets you track coins and get price alerts.\n\n" +
  "• 📋 Watchlist — add coins to track\n" +
  "• 💰 Price — check current prices\n" +
  "• 🔔 Alerts — set price or percent alerts\n" +
  "• ⚙️ Settings — quiet hours and summary\n\n" +
  "Tap /start to open the menu.";

const backToMenu = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);

const composer = new Composer<Ctx>();

composer.command("help", async (ctx) => {
  await ctx.reply(HELP);
});

composer.callbackQuery("menu:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HELP, { reply_markup: backToMenu });
});

export default composer;
