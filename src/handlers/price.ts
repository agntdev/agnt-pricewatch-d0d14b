import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getDomainStore } from "../bot.js";
import { COIN_IDS, fetchPrices, type PriceResult } from "../storage/prices.js";
import {
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { registerMainMenuItem } from "../toolkit/index.js";

// Register in main menu (already registered by start.ts, but ensure it's here too)
// Note: start.ts registers "price:menu" — this handler responds to it.

const composer = new Composer<Ctx>();

// Price menu — show options
composer.callbackQuery("price:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getDomainStore();
  const items = await store.getWatchlist(ctx.from!.id);

  if (items.length === 0) {
    await ctx.editMessageText(
      "💰 Add coins to your watchlist first, then check their prices.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("📋 Manage watchlist", "watchlist:view")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  await ctx.editMessageText("💰 Pick a coin to check its price, or get all.", {
    reply_markup: inlineKeyboard([
      items.map((i) => inlineButton(i.ticker, `price:check:${i.ticker}`)),
      [inlineButton("💰 All prices", "price:all")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

// /price command — show all watchlist prices
composer.command("price", async (ctx) => {
  const store = getDomainStore();
  const items = await store.getWatchlist(ctx.from!.id);

  if (items.length === 0) {
    await ctx.reply(
      "💰 Your watchlist is empty. Add coins first to check prices.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add coins", "watchlist:add-menu")],
        ]),
      },
    );
    return;
  }

  await fetchAndShowPrices(ctx, items.map((i) => i.ticker));
});

// Check single coin price
composer.callbackQuery(/^price:check:([A-Z0-9]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = ctx.match![1];
  await fetchAndShowPrices(ctx, [ticker]);
});

// Check all watchlist prices
composer.callbackQuery("price:all", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getDomainStore();
  const items = await store.getWatchlist(ctx.from!.id);
  if (items.length === 0) {
    await ctx.editMessageText("Your watchlist is empty.", {
      reply_markup: inlineKeyboard([
        [inlineButton("➕ Add coins", "watchlist:add-menu")],
        [inlineButton("⬅️ Back", "price:menu")],
      ]),
    });
    return;
  }
  await fetchAndShowPrices(ctx, items.map((i) => i.ticker));
});

async function fetchAndShowPrices(ctx: Ctx, tickers: string[]) {
  const store = getDomainStore();

  // Resolve tickers to CoinGecko IDs
  const coinIds = tickers.map((t) => COIN_IDS[t] ?? t.toLowerCase());
  const prices = await fetchPrices(coinIds);

  if (prices.size === 0) {
    await ctx.reply("Couldn't fetch prices right now. Try again in a moment.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back", "price:menu")],
      ]),
    });
    return;
  }

  const lines: string[] = [];
  for (const ticker of tickers) {
    const coinId = COIN_IDS[ticker] ?? ticker.toLowerCase();
    const p = prices.get(coinId);
    if (p) {
      const change = p.usd24hChange != null
        ? ` (${p.usd24hChange >= 0 ? "+" : ""}${p.usd24hChange.toFixed(1)}%)`
        : "";
      lines.push(`${ticker}: $${p.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${change}`);

      // Update last seen price in watchlist
      const item = await store.getWatchlistItem(ctx.from!.id, ticker);
      if (item) {
        item.lastSeenPrice = p.usd;
        await store.setWatchlistItem(ctx.from!.id, item);
      }
    } else {
      lines.push(`${ticker}: unavailable`);
    }
  }

  const msg = `💰 Prices:\n\n${lines.join("\n")}`;
  const replyMarkup = tickers.length === 1
    ? inlineKeyboard([[inlineButton("⬅️ Back", "price:menu")]])
    : inlineKeyboard([
        tickers.map((t) => inlineButton(t, `price:check:${t}`)),
        [inlineButton("⬅️ Back", "price:menu")],
      ]);

  // If we're editing (callback query), edit; otherwise send new
  if (ctx.callbackQuery) {
    await ctx.editMessageText(msg, { reply_markup: replyMarkup });
  } else {
    await ctx.reply(msg, { reply_markup: replyMarkup });
  }
}

export default composer;
