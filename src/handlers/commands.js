import { renderWelcome, renderWallets } from "./ui.js";

// Commands
export function setupCommands(bot) {
  bot.start(async (ctx) => {
    try {
      await renderWelcome(ctx);
    } catch (e) {
      console.error("start command failed:", e);
    }
  });

  bot.command("wallets", async (ctx) => {
    try {
      await renderWallets(ctx);
    } catch (e) {
      console.error("wallets command failed:", e);
    }
  });
}
