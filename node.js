import { Telegraf, Markup } from "telegraf";
import "dotenv/config";

const bot = new Telegraf(process.env.BOT_TOKEN);

// Start command with buttons
bot.start((ctx) => {
  ctx.reply(
    "🚀 Welcome to EchoVault!\nChoose an option below:",
    Markup.inlineKeyboard([
      [Markup.button.callback("💰 Deposit", "deposit")],
      [Markup.button.callback("📊 Portfolio", "portfolio")],
      [Markup.button.callback("🏆 Leaderboard", "leaderboard")],
    ])
  );
});

// Handle Deposit button
bot.action("deposit", (ctx) => {
  ctx.answerCbQuery(); // remove "loading..."
  ctx.reply("💳 Your deposit address: `aptos1...` (dummy for now)");
});

// Handle Portfolio button
bot.action("portfolio", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply("📊 Your portfolio:\n- Balance: 100 APT\n- PnL: +5%");
});

// Handle Leaderboard button
bot.action("leaderboard", (ctx) => {
  ctx.answerCbQuery();
  ctx.reply(
    "🏆 Leaderboard:\n1. Chinmay: +12%\n2. Judge123: +5%\n3. RandomUser: -2%"
  );
});

bot.launch();
console.log("Bot running...");
