import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getDomainStore } from "../bot.js";
import { UserProfile } from "../storage/types.js";
import {
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";

const DEFAULT_PROFILE: UserProfile = {
  userId: 0,
  timezone: "UTC",
  quietHoursStart: 22,
  quietHoursEnd: 7,
  summaryTime: "08:00",
  cooldownMinutes: 30,
};

async function getOrCreateProfile(userId: number): Promise<UserProfile> {
  const store = getDomainStore();
  let profile = await store.getUserProfile(userId);
  if (!profile) {
    profile = { ...DEFAULT_PROFILE, userId };
    await store.setUserProfile(userId, profile);
  }
  return profile;
}

const composer = new Composer<Ctx>();

// Settings menu
composer.callbackQuery("settings:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await getOrCreateProfile(ctx.from!.id);

  const quietLabel = profile.quietHoursStart === profile.quietHoursEnd
    ? "Off"
    : `${profile.quietHoursStart}:00–${profile.quietHoursEnd}:00`;

  await ctx.editMessageText(
    "⚙️ Your settings:\n\n" +
    `• Timezone: ${profile.timezone}\n` +
    `• Quiet hours: ${quietLabel}\n` +
    `• Morning summary: ${profile.summaryTime}\n` +
    `• Alert cooldown: ${profile.cooldownMinutes}m`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🌍 Timezone", "settings:tz")],
        [inlineButton("🌙 Quiet hours", "settings:quiet")],
        [inlineButton("📊 Summary time", "settings:summary")],
        [inlineButton("⏱ Cooldown", "settings:cooldown")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

// Set timezone
composer.callbackQuery("settings:tz", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_timezone";
  await ctx.editMessageText(
    "🌍 Type your timezone (e.g. UTC, EST, Europe/London, Asia/Tokyo).",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("✖️ Cancel", "settings:menu")],
      ]),
    },
  );
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_timezone") return next();

  const tz = ctx.message.text.trim();
  ctx.session.step = undefined;

  // Basic validation — check if it's a reasonable timezone string
  if (tz.length > 50 || tz.length < 2) {
    await ctx.reply("That doesn't look like a valid timezone. Try again (e.g. UTC, Europe/London).", {
      reply_markup: inlineKeyboard([
        [inlineButton("✖️ Cancel", "settings:menu")],
      ]),
    });
    return;
  }

  const store = getDomainStore();
  const profile = await getOrCreateProfile(ctx.from!.id);
  profile.timezone = tz;
  await store.setUserProfile(ctx.from!.id, profile);

  await ctx.reply(`✅ Timezone set to ${tz}.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⚙️ Back to settings", "settings:menu")],
    ]),
  });
});

// Quiet hours
composer.callbackQuery("settings:quiet", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await getOrCreateProfile(ctx.from!.id);

  await ctx.editMessageText(
    "🌙 Quiet hours suppress alerts during sleep.\n\nPick when alerts should stop and resume:",
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("22:00–07:00", "settings:quiet:set:22:7"),
          inlineButton("23:00–07:00", "settings:quiet:set:23:7"),
        ],
        [
          inlineButton("00:00–08:00", "settings:quiet:set:0:8"),
          inlineButton("Off", "settings:quiet:set:0:0"),
        ],
        [inlineButton("⬅️ Back", "settings:menu")],
      ]),
    },
  );
});

composer.callbackQuery(/^settings:quiet:set:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const start = parseInt(ctx.match![1]);
  const end = parseInt(ctx.match![2]);
  const store = getDomainStore();
  const profile = await getOrCreateProfile(ctx.from!.id);
  profile.quietHoursStart = start;
  profile.quietHoursEnd = end;
  await store.setUserProfile(ctx.from!.id, profile);

  const label = start === end ? "Off" : `${start}:00–${end}:00`;
  await ctx.editMessageText(`✅ Quiet hours set to ${label}.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⚙️ Back to settings", "settings:menu")],
    ]),
  });
});

// Summary time
composer.callbackQuery("settings:summary", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "📊 Set your preferred morning summary time (in your timezone).",
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("07:00", "settings:summary:set:07:00"),
          inlineButton("08:00", "settings:summary:set:08:00"),
        ],
        [
          inlineButton("09:00", "settings:summary:set:09:00"),
          inlineButton("10:00", "settings:summary:set:10:00"),
        ],
        [inlineButton("Off", "settings:summary:set:off")],
        [inlineButton("⬅️ Back", "settings:menu")],
      ]),
    },
  );
});

composer.callbackQuery(/^settings:summary:set:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const value = ctx.match![1];
  const store = getDomainStore();
  const profile = await getOrCreateProfile(ctx.from!.id);
  profile.summaryTime = value;
  await store.setUserProfile(ctx.from!.id, profile);

  const label = value === "off" ? "Off" : value;
  await ctx.editMessageText(`✅ Morning summary set to ${label}.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⚙️ Back to settings", "settings:menu")],
    ]),
  });
});

// Cooldown
composer.callbackQuery("settings:cooldown", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "⏱ Alert cooldown prevents spam. Choose how long between alerts for the same coin.",
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("15m", "settings:cooldown:set:15"),
          inlineButton("30m", "settings:cooldown:set:30"),
        ],
        [
          inlineButton("1h", "settings:cooldown:set:60"),
          inlineButton("2h", "settings:cooldown:set:120"),
        ],
        [inlineButton("⬅️ Back", "settings:menu")],
      ]),
    },
  );
});

composer.callbackQuery(/^settings:cooldown:set:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const minutes = parseInt(ctx.match![1]);
  const store = getDomainStore();
  const profile = await getOrCreateProfile(ctx.from!.id);
  profile.cooldownMinutes = minutes;
  await store.setUserProfile(ctx.from!.id, profile);

  await ctx.editMessageText(`✅ Cooldown set to ${minutes} minutes.`, {
    reply_markup: inlineKeyboard([
      [inlineButton("⚙️ Back to settings", "settings:menu")],
    ]),
  });
});

export default composer;
