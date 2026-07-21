# Crypto Watcher Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A private Telegram bot that lets users track crypto prices, set price threshold and percentage move alerts, and manage watchlists. Owner receives aggregated usage stats and top-fired alerts. Features include quiet hours, morning summaries, and cooldown periods to prevent alert spam.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual crypto investors
- price alert subscribers
- Telegram bot users

## Success criteria

- User can add/remove coins to watchlist via buttons or text
- System sends single alert per rule with cooldown
- Owner dashboard shows active users and top alerts

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Begin onboarding and create user profile
- **Add to Watchlist** (button, actor: user, callback: watchlist:add) — Open watchlist management menu with quick coin buttons
- **/price** (command, actor: user, command: /price) — Request current price for specified ticker or full watchlist

## Flows

### Watchlist Management
_Trigger:_ watchlist:add

1. Show quick coin buttons (BTC, ETH, TON, Other)
2. Prompt for custom ticker if 'Other' selected
3. Confirm addition/removal with inline buttons

_Data touched:_ User profile, Watchlist item

### Alert Setup
_Trigger:_ alert:setup

1. Select coin from watchlist
2. Choose alert type (price threshold or percent move)
3. Enter value/percentage and confirm

_Data touched:_ Watchlist item

### Morning Summary
_Trigger:_ summary:configure

1. Request preferred time in user's timezone
2. Confirm schedule activation
3. Generate summary with price changes

_Data touched:_ User profile

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User profile** _(retention: persistent)_ — User-specific settings and preferences
  - fields: Telegram ID, timezone, quiet_hours_start, quiet_hours_end, summary_time, cooldown_length
- **Watchlist item** _(retention: persistent)_ — Monitored cryptocurrency with alert rules
  - fields: ticker_symbol, display_name, price_threshold_high, price_threshold_low, percent_change_threshold, last_alerted, last_seen_price
- **Alert event** _(retention: persistent)_ — Triggered price alert for analytics
  - fields: coin, old_price, new_price, percent_change, timestamp, rule_type

## Integrations

- **Telegram** (required) — User alerts and admin dashboard
- **Price Feed API** (required) — Market price data with retry handling
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- View aggregate stats in admin chat
- See top-fired alerts by ticker/rule

## Notifications

- Price threshold crossed alert
- Percent change threshold alert
- Morning summary digest
- Owner admin stats (daily)

## Permissions & privacy

- All user data stored privately with no sharing
- Watchlist items only visible to owner user
- Admin stats show aggregated data only

## Edge cases

- Unknown ticker symbol input
- Overlapping cooldown periods
- Price feed API failures affecting >5% users

## Required tests

- Add custom coin to watchlist and trigger alert
- Verify quiet hours suppression behavior
- Test morning summary with multiple price changes

## Assumptions

- Default 30m cooldown is sufficient for most users
- 1-hour window for percent change alerts is appropriate
- Top 3 quick coins cover 80% of user needs
