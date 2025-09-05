import { Markup } from "telegraf";
import { renderWelcome, renderWallets } from "./ui.js";

// Main menu actions
export function setupMenuActions(bot) {
  bot.action("start", async (ctx) => {
    try {
      await renderWelcome(ctx);
    } catch (e) {
      console.error("start action failed:", e);
    }
  });

  bot.action("wallets", async (ctx) => {
    try {
      await renderWallets(ctx);
    } catch (e) {
      console.error("wallets action failed:", e);
    }
  });

  bot.action("portfolio", async (ctx) => {
    try {
      ctx.answerCbQuery();
      await ctx.reply(
        "📊 <b>Portfolio</b>\n\n" +
          "Coming soon! Track your APT holdings and performance.\n\n" +
          "Features in development:\n" +
          "• Portfolio overview\n" +
          "• Performance charts\n" +
          "• Transaction history",
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("👛 View Wallets", "wallets")],
            [Markup.button.callback("🏠 Main Menu", "start")],
          ]),
        }
      );
    } catch (e) {
      console.error("portfolio failed:", e);
    }
  });

  bot.action("leaderboard", async (ctx) => {
    try {
      ctx.answerCbQuery();
      await ctx.reply(
        "🏆 <b>Leaderboard</b>\n\n" +
          "Coming soon! See top traders and copy their strategies.\n\n" +
          "Features in development:\n" +
          "• Top traders ranking\n" +
          "• Copy trading signals\n" +
          "• Performance metrics",
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("👛 View Wallets", "wallets")],
            [Markup.button.callback("🏠 Main Menu", "start")],
          ]),
        }
      );
    } catch (e) {
      console.error("leaderboard failed:", e);
    }
  });

  // Wallets back action
  bot.action("wallets_back", async (ctx) => {
    try {
      ctx.answerCbQuery();
    } catch {}
    await renderWallets(ctx);
  });

  // Welcome back action from sections
  bot.action("welcome_back", async (ctx) => {
    try {
      ctx.answerCbQuery();
    } catch {}
    await renderWelcome(ctx);
  });
}
