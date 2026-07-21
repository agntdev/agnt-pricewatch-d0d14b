import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getDomainStore } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";

const composer = new Composer<Ctx>();

// Alert menu — show coins from watchlist
composer.callbackQuery("alerts:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getDomainStore();
  const items = await store.getWatchlist(ctx.from!.id);

  if (items.length === 0) {
    await ctx.editMessageText(
      "🔔 Add coins to your watchlist first, then set alerts.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add coins", "watchlist:add-menu")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  await ctx.editMessageText("🔔 Pick a coin to set an alert on.", {
    reply_markup: inlineKeyboard([
      items.map((i) => inlineButton(i.ticker, `alert:set:${i.ticker}`)),
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// Set alert for a coin — show alert type options
composer.callbackQuery(/^alert:set:([A-Z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match![1];
  const store = getDomainStore();
  const item = await store.getWatchlistItem(ctx.from!.id, ticker);

  if (!item) {
    await ctx.editMessageText(`${ticker} isn't on your watchlist.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("➕ Add it", `wl:add:${ticker}`)],
        [inlineButton("⬅️ Back", "alerts:menu")],
      ]),
    });
    return;
  }

  const currentAlerts = [];
  if (item.priceThresholdHigh) currentAlerts.push(`High: $${item.priceThresholdHigh.toLocaleString()}`);
  if (item.priceThresholdLow) currentAlerts.push(`Low: $${item.priceThresholdLow.toLocaleString()}`);
  if (item.percentChangeThreshold) currentAlerts.push(`${item.percentChangeThreshold}% move`);
  const alertInfo = currentAlerts.length > 0 ? `\nCurrent: ${currentAlerts.join(", ")}` : "";

  await ctx.editMessageText(`🔔 Alert for ${ticker}${alertInfo}\n\nChoose alert type:`, {
    reply_markup: inlineKeyboard([
      [inlineButton("📈 Price threshold", `alert:type:${ticker}:price_high`)],
      [inlineButton("📉 Price threshold (low)", `alert:type:${ticker}:price_low`)],
      [inlineButton("📊 Percent change", `alert:type:${ticker}:percent`)],
      [inlineButton("⬅️ Back", "alerts:menu")],
    ]),
  });
});

// Alert type selected — ask for value
composer.callbackQuery(/^alert:type:([A-Z0-9]+):(price_high|price_low|percent)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match![1];
  const alertType = ctx.match![2];

  const prompts: Record<string, string> = {
    price_high: `📈 Enter the high price threshold for ${ticker} (e.g. 100000).`,
    price_low: `📉 Enter the low price threshold for ${ticker} (e.g. 50000).`,
    percent: `📊 Enter the percent change threshold for ${ticker} (e.g. 5 for 5%).`,
  };

  ctx.session.step = "awaiting_alert_value";
  ctx.session.flowData = { ticker, alertType };

  await ctx.editMessageText(prompts[alertType], {
    reply_markup: inlineKeyboard([
      [inlineButton("✖️ Cancel", `alert:set:${ticker}`)],
    ]),
  });
});

// Handle alert value text input
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_alert_value") return next();

  const flowData = ctx.session.flowData as { ticker: string; alertType: string } | undefined;
  if (!flowData) {
    ctx.session.step = undefined;
    return next();
  }

  const { ticker, alertType } = flowData;
  const input = ctx.message.text.trim();
  const value = parseFloat(input);
  ctx.session.step = undefined;
  ctx.session.flowData = undefined;

  if (isNaN(value) || value <= 0) {
    await ctx.reply("Please enter a valid positive number.", {
      reply_markup: inlineKeyboard([
        [inlineButton("✖️ Cancel", `alert:set:${ticker}`)],
      ]),
    });
    return;
  }

  const store = getDomainStore();
  const item = await store.getWatchlistItem(ctx.from!.id, ticker);
  if (!item) {
    await ctx.reply(`${ticker} isn't on your watchlist.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back", "alerts:menu")],
      ]),
    });
    return;
  }

  if (alertType === "price_high") {
    item.priceThresholdHigh = value;
  } else if (alertType === "price_low") {
    item.priceThresholdLow = value;
  } else {
    item.percentChangeThreshold = value;
  }

  await store.setWatchlistItem(ctx.from!.id, item);

  const confirmMsg: Record<string, string> = {
    price_high: `✅ Alert set: notify when ${ticker} goes above $${value.toLocaleString()}.`,
    price_low: `✅ Alert set: notify when ${ticker} drops below $${value.toLocaleString()}.`,
    percent: `✅ Alert set: notify when ${ticker} moves ${value}% or more.`,
  };

  await ctx.reply(confirmMsg[alertType], {
    reply_markup: inlineKeyboard([
      [inlineButton("🔔 Set another alert", `alert:set:${ticker}`)],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// Alert history
composer.callbackQuery("alerts:history", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getDomainStore();
  const events = await store.getAlertEvents(ctx.from!.id, 5);

  if (events.length === 0) {
    await ctx.editMessageText(
      "🔔 No alerts fired yet. Set up alerts on your watchlist coins to get notified.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("🔔 Set alerts", "alerts:menu")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  const lines = events.map((e) => {
    const time = new Date(e.timestamp).toLocaleString();
    return `${e.coin}: $${e.oldPrice.toLocaleString()} → $${e.newPrice.toLocaleString()} (${e.percentChange >= 0 ? "+" : ""}${e.percentChange.toFixed(1)}%) — ${e.ruleType}`;
  });

  await ctx.editMessageText(
    `🔔 Recent alerts:\n\n${lines.join("\n")}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

export default composer;
