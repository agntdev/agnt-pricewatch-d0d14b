// CoinGecko free API client — fetches real cryptocurrency prices.
// API: https://api.coingecko.com/api/v3
// Rate limit: ~10-30 calls/min on free tier.

const BASE = "https://api.coingecko.com/api/v3";

/** Well-known CoinGecko IDs for the quick-add coins. */
export const COIN_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  TON: "the-open-network",
  SOL: "solana",
  DOGE: "dogecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  LINK: "chainlink",
};

export interface PriceResult {
  id: string;
  symbol: string;
  name: string;
  usd: number;
  usd24hChange?: number;
}

/**
 * Fetch current prices for one or more coin IDs (CoinGecko IDs, not tickers).
 * Returns a map of coinId → PriceResult.
 */
export async function fetchPrices(
  coinIds: string[],
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<Map<string, PriceResult>> {
  const result = new Map<string, PriceResult>();
  if (coinIds.length === 0) return result;

  // Batch in groups of 25 (CoinGecko limit per request)
  for (let i = 0; i < coinIds.length; i += 25) {
    const batch = coinIds.slice(i, i + 25);
    const ids = batch.join(",");
    const url = `${BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`;

    try {
      const res = await fetchFn(url, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;

      for (const id of batch) {
        const entry = data[id];
        if (entry && typeof entry.usd === "number") {
          result.set(id, {
            id,
            symbol: id,
            name: id,
            usd: entry.usd,
            usd24hChange: entry.usd_24h_change,
          });
        }
      }
    } catch {
      // Network error — skip this batch, return partial results
    }
  }

  return result;
}

/**
 * Search CoinGecko for a ticker symbol and return matching coins.
 * Returns up to 5 results.
 */
export async function searchCoin(
  query: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<Array<{ id: string; symbol: string; name: string }>> {
  const url = `${BASE}/search?query=${encodeURIComponent(query)}`;
  try {
    const res = await fetchFn(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      coins?: Array<{ id: string; symbol: string; name: string }>;
    };
    return (data.coins ?? []).slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * Resolve a user-typed ticker to a CoinGecko coin ID.
 * First checks COIN_IDS for known tickers, then searches the API.
 */
export async function resolveCoinId(
  ticker: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ id: string; symbol: string; name: string } | null> {
  const upper = ticker.toUpperCase();
  if (COIN_IDS[upper]) {
    return { id: COIN_IDS[upper], symbol: upper, name: upper };
  }
  const results = await searchCoin(ticker, fetchFn);
  return results.length > 0 ? results[0] : null;
}
