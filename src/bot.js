import "dotenv/config";
import { Telegraf } from "telegraf";
import { setupAllHandlers } from "./handlers/index.js";
import { initDB } from "./db.js";

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

// Initialize database and start bot
async function startBot() {
  try {
    console.log("🔄 Initializing database...");
    await initDB();
    console.log("✅ Database initialized");

    console.log("🚀 Starting bot...");
    await bot.launch();
    console.log("✅ Bot started successfully");
  } catch (error) {
    console.error("❌ Failed to start bot:", error);
    process.exit(1);
  }
}

startBot();

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
