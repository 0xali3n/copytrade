import { Markup } from "telegraf";
import { renderWelcome, renderWallets } from "./ui.js";

// Helper function to clean up messages with smooth disappearing effect
async function cleanupMessages(ctx, messageIds = []) {
  try {
    // Delete multiple messages in parallel for smooth cleanup
    await Promise.all(
      messageIds.map(
        (id) => ctx.deleteMessage(id).catch(() => {}) // Ignore errors if message already deleted
      )
    );
  } catch (e) {
    // Ignore cleanup errors - messages might already be deleted
  }
}

// Main menu actions
export function setupMenuActions(bot) {
  bot.action("start", async (ctx) => {
    try {
      ctx.answerCbQuery();
      // Clean up current message before showing welcome screen
      try {
        await ctx.deleteMessage();
      } catch {}
      await renderWelcome(ctx);
    } catch (e) {
      console.error("start action failed:", e);
    }
  });

  bot.action("wallets", async (ctx) => {
    try {
      ctx.answerCbQuery();
      // Clean up current message before showing wallet list
      try {
        await ctx.deleteMessage();
      } catch {}
      await renderWallets(ctx);
    } catch (e) {
      console.error("wallets action failed:", e);
    }
  });

  bot.action("portfolio", async (ctx) => {
    try {
      ctx.answerCbQuery();
      // Clean up current message before showing portfolio
      try {
        await ctx.deleteMessage();
      } catch {}
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
      // Clean up current message before showing leaderboard
      try {
        await ctx.deleteMessage();
      } catch {}
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

  // Wallets back action - clean up previous messages for smooth navigation
  bot.action("wallets_back", async (ctx) => {
    try {
      ctx.answerCbQuery();
      // Clean up the current message (wallet detail view) before showing wallet list
      try {
        await ctx.deleteMessage();
      } catch {}
    } catch {}
    await renderWallets(ctx);
  });

  // Welcome back action from sections - clean up previous messages
  bot.action("welcome_back", async (ctx) => {
    try {
      ctx.answerCbQuery();
      // Clean up the current message before showing welcome screen
      try {
        await ctx.deleteMessage();
      } catch {}
    } catch {}
    await renderWelcome(ctx);
  });
}
