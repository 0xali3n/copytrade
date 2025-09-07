import { Markup } from "telegraf";
import { renderWelcome, renderWallets } from "./ui.js";
import { getPortfolioSummary } from "../wallet.js";

// Helper function to get token emoji
function getTokenEmoji(tokenName) {
  const emojis = {
    APT: "🟡",
    USDC: "💙",
    USDT: "💚",
    DooDoo: "💩",
    THL: "🟠",
  };
  return emojis[tokenName] || "🪙";
}

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
      await renderWelcome(ctx);
    } catch (e) {
      console.error("start action failed:", e);
    }
  });

  bot.action("wallets", async (ctx) => {
    try {
      ctx.answerCbQuery();
      await renderWallets(ctx);
    } catch (e) {
      console.error("wallets action failed:", e);
    }
  });

  bot.action("portfolio", async (ctx) => {
    try {
      ctx.answerCbQuery();
      // Show loading message
      const loadingMsg = await ctx.reply("⏳ Loading portfolio...");

      try {
        const portfolio = await getPortfolioSummary(ctx.from.id);

        let text = "📊 <b>Portfolio Overview</b>\n\n";

        if (portfolio.walletCount === 0) {
          text +=
            "No wallets found. Create a wallet to start tracking your portfolio!";
        } else {
          text += `📈 <b>Total Wallets:</b> ${portfolio.walletCount}\n\n`;

          // Show each wallet with its balances
          portfolio.wallets.forEach((wallet, index) => {
            const shortAddr = `${wallet.address.slice(
              0,
              6
            )}...${wallet.address.slice(-4)}`;
            const star = wallet.is_default ? "⭐ " : "";
            text += `👛 <b>Wallet ${index + 1}</b> ${star}\n`;
            text += `📋 <code>${shortAddr}</code>\n`;

            if (Object.keys(wallet.tokenBalances).length === 0) {
              text += `💰 <b>Balance:</b> Empty\n\n`;
            } else {
              text += `💰 <b>Token Holdings:</b>\n`;

              // Sort tokens by balance (descending)
              const sortedTokens = Object.entries(wallet.tokenBalances).sort(
                ([, a], [, b]) => b - a
              );

              sortedTokens.forEach(([tokenName, balance]) => {
                const emoji = getTokenEmoji(tokenName);
                text += `  ${emoji} <b>${tokenName}:</b> ${balance.toFixed(
                  6
                )}\n`;
              });
              text += `\n`;
            }
          });

          // Show total aggregated balances
          if (Object.keys(portfolio.tokens).length > 0) {
            text += `📊 <b>Total Portfolio:</b>\n`;
            const sortedTokens = Object.entries(portfolio.tokens).sort(
              ([, a], [, b]) => b - a
            );
            sortedTokens.forEach(([tokenName, balance]) => {
              const emoji = getTokenEmoji(tokenName);
              text += `${emoji} <b>${tokenName}:</b> ${balance.toFixed(6)}\n`;
            });
          }
        }

        // Delete loading message and send portfolio
        try {
          await ctx.deleteMessage(loadingMsg.message_id);
        } catch {}

        await ctx.reply(text, {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🔄 Refresh", "portfolio")],
            [Markup.button.callback("👛 View Wallets", "wallets")],
            [Markup.button.callback("🏠 Main Menu", "start")],
          ]),
        });
      } catch (error) {
        // Delete loading message
        try {
          await ctx.deleteMessage(loadingMsg.message_id);
        } catch {}

        await ctx.reply(
          "❌ <b>Failed to load portfolio</b>\n\n" +
            "Please try again later or check your wallet connections.",
          {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("🔄 Retry", "portfolio")],
              [Markup.button.callback("👛 View Wallets", "wallets")],
              [Markup.button.callback("🏠 Main Menu", "start")],
            ]),
          }
        );
      }
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
      await renderWallets(ctx);
    } catch (e) {
      console.error("wallets_back failed:", e);
    }
  });

  // Welcome back action from sections
  bot.action("welcome_back", async (ctx) => {
    try {
      ctx.answerCbQuery();
      await renderWelcome(ctx);
    } catch (e) {
      console.error("welcome_back failed:", e);
    }
  });
}
