import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getDomainStore } from "../bot.js";
import { COIN_IDS, resolveCoinId } from "../storage/prices.js";
import {
  inlineButton,
  inlineKeyboard,
  confirmKeyboard,
} from "../toolkit/index.js";

const QUICK_COINS = ["BTC", "ETH", "TON", "SOL"];

const composer = new Composer<Ctx>();

// View watchlist
composer.callbackQuery("watchlist:view", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getDomainStore();
  const items = await store.getWatchlist(ctx.from!.id);

  if (items.length === 0) {
    await ctx.editMessageText(
      "📋 Your watchlist is empty.\n\nTap a coin below to add it, or type a ticker.",
      {
        reply_markup: inlineKeyboard([
          QUICK_COINS.map((c) => inlineButton(c, `wl:add:${c}`)),
          [inlineButton("🔎 Other coin", "wl:custom")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  const lines = items.map((i) => {
    const price = i.lastSeenPrice != null ? ` — $${i.lastSeenPrice.toLocaleString()}` : "";
    return `• ${i.displayName} (${i.ticker})${price}`;
  });

  await ctx.editMessageText(
    `📋 Your watchlist:\n\n${lines.join("\n")}\n\nTap a coin to manage it, or add a new one.`,
    {
      reply_markup: inlineKeyboard([
        items.map((i) => inlineButton(`${i.ticker}`, `wl:manage:${i.ticker}`)),
        [inlineButton("➕ Add coin", "wl:add-menu")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

// Add coin menu — show quick coins
composer.callbackQuery("wl:add-menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("➕ Pick a coin to add, or type a ticker symbol.", {
    reply_markup: inlineKeyboard([
      QUICK_COINS.map((c) => inlineButton(c, `wl:add:${c}`)),
      [inlineButton("🔎 Other coin", "wl:custom")],
      [inlineButton("⬅️ Back", "watchlist:view")],
    ]),
  });
});

// Add a quick coin directly
composer.callbackQuery(/^wl:add:([A-Z]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match![1];
  const store = getDomainStore();
  const userId = ctx.from!.id;

  const existing = await store.getWatchlistItem(userId, ticker);
  if (existing) {
    await ctx.editMessageText(`${ticker} is already on your watchlist.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to watchlist", "watchlist:view")],
      ]),
    });
    return;
  }

  const coinId = COIN_IDS[ticker] ?? ticker.toLowerCase();
  await store.setWatchlistItem(userId, {
    userId,
    ticker,
    displayName: ticker,
  });

  await ctx.editMessageText(`✅ Added ${ticker} to your watchlist.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("🔔 Set alert", `alert:set:${ticker}`)],
      [inlineButton("📋 Back to watchlist", "watchlist:view")],
    ]),
  });
});

// Custom coin — ask for ticker input
composer.callbackQuery("wl:custom", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_custom_ticker";
  await ctx.editMessageText(
    "🔎 Type the ticker symbol or coin name (e.g. DOGE, AVAX, Polkadot).",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("✖️ Cancel", "watchlist:view")],
      ]),
    },
  );
});

// Handle custom ticker text input
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_custom_ticker") return next();

  const input = ctx.message.text.trim().toUpperCase();
  ctx.session.step = undefined;

  const store = getDomainStore();
  const userId = ctx.from!.id;

  // Check if already on watchlist
  const existing = await store.getWatchlistItem(userId, input);
  if (existing) {
    await ctx.reply(`${input} is already on your watchlist.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 Back to watchlist", "watchlist:view")],
      ]),
    });
    return;
  }

  // Resolve via CoinGecko search
  const coin = await resolveCoinId(input);
  if (!coin) {
    await ctx.reply(`Couldn't find a coin for "${input}". Check the spelling and try again.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("🔎 Try again", "wl:custom")],
        [inlineButton("⬅️ Back to watchlist", "watchlist:view")],
      ]),
    });
    return;
  }

  const ticker = coin.symbol.toUpperCase();
  await store.setWatchlistItem(userId, {
    userId,
    ticker,
    displayName: coin.name,
  });

  await ctx.reply(`✅ Added ${coin.name} (${ticker}) to your watchlist.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("🔔 Set alert", `alert:set:${ticker}`)],
      [inlineButton("📋 Back to watchlist", "watchlist:view")],
    ]),
  });
});

// Manage a specific coin — show options
composer.callbackQuery(/^wl:manage:([A-Z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match![1];
  const store = getDomainStore();
  const item = await store.getWatchlistItem(ctx.from!.id, ticker);

  if (!item) {
    await ctx.editMessageText(`${ticker} isn't on your watchlist.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to watchlist", "watchlist:view")],
      ]),
    });
    return;
  }

  const alertInfo = [];
  if (item.priceThresholdHigh) alertInfo.push(`High: $${item.priceThresholdHigh.toLocaleString()}`);
  if (item.priceThresholdLow) alertInfo.push(`Low: $${item.priceThresholdLow.toLocaleString()}`);
  if (item.percentChangeThreshold) alertInfo.push(`${item.percentChangeThreshold}% move`);
  const alertLine = alertInfo.length > 0 ? `\nAlerts: ${alertInfo.join(", ")}` : "\nNo alerts set.";

  await ctx.editMessageText(
    `${item.displayName} (${item.ticker})${alertLine}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🔔 Set alert", `alert:set:${ticker}`)],
        [inlineButton("🗑 Remove", `wl:remove:${ticker}`)],
        [inlineButton("⬅️ Back to watchlist", "watchlist:view")],
      ]),
    },
  );
});

// Remove coin — confirm
composer.callbackQuery(/^wl:remove:([A-Z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match![1];
  await ctx.editMessageText(`Remove ${ticker} from your watchlist?`, {
    reply_markup: confirmKeyboard(`wl:confirm-remove:${ticker}`, {
      yes: "🗑 Remove",
      no: "Cancel",
    }),
  });
});

// Confirm remove
composer.callbackQuery(/^wl:confirm-remove:([A-Z0-9]+):(yes|no)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match![1];
  const action = ctx.match![2];

  if (action === "yes") {
    const store = getDomainStore();
    await store.removeWatchlistItem(ctx.from!.id, ticker);
    await ctx.editMessageText(`✅ Removed ${ticker} from your watchlist.`, {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 Back to watchlist", "watchlist:view")],
      ]),
    });
  } else {
    await ctx.editMessageText("Cancelled.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to watchlist", "watchlist:view")],
      ]),
    });
  }
});

export default composer;
