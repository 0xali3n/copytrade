import "dotenv/config";
import { Telegraf } from "telegraf";
import { setupAllHandlers } from "./handlers/index.js";

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Set bot commands
bot.telegram.setMyCommands([
  { command: "start", description: "🏠 Main menu" },
  { command: "wallets", description: "👛 View wallets" },
]);

// Setup all handlers
setupAllHandlers(bot);

// Error handling
bot.catch((err, ctx) => {
  console.error("Bot error:", err);
  try {
    ctx.reply("❌ An error occurred. Please try again.");
  } catch {}
});

// Start bot
bot.launch().then(() => {
  console.log("✅ Bot started successfully");
});

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
