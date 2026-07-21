export interface UserProfile {
  userId: number;
  timezone: string;
  quietHoursStart: number;
  quietHoursEnd: number;
  summaryTime: string;
  cooldownMinutes: number;
}

export interface WatchlistItem {
  userId: number;
  ticker: string;
  displayName: string;
  priceThresholdHigh?: number;
  priceThresholdLow?: number;
  percentChangeThreshold?: number;
  lastAlerted?: number;
  lastSeenPrice?: number;
}

export interface AlertEvent {
  userId: number;
  coin: string;
  oldPrice: number;
  newPrice: number;
  percentChange: number;
  timestamp: number;
  ruleType: "price_threshold" | "percent_change";
}
