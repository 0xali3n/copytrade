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
      const loadingMsg = await ctx.reply("⏳ Loading portfolio data...");

      try {
        const portfolio = await getPortfolioSummary(ctx.from.id);

        let text = `📊 <b>Neo Trade - Portfolio Overview</b>\n\n`;
        text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (portfolio.walletCount === 0) {
          text += `📭 <b>No Wallets Found</b>\n\n`;
          text += `Create your first wallet to start your trading journey with Neo Trade's advanced analytics.\n\n`;
          text += `🚀 <b>Get Started:</b>\n`;
          text += `• Create secure Aptos wallets\n`;
          text += `• Track real-time balances\n`;
          text += `• Monitor token holdings\n`;
          text += `• View advanced portfolio analytics\n`;
          text += `• Access AI-powered insights\n\n`;
        } else {
          text += `📈 <b>Portfolio Summary</b>\n`;
          text += `🏦 <b>Total Wallets:</b> ${portfolio.walletCount}\n`;
          text += `💰 <b>Total Value:</b> ${portfolio.totalValue.toFixed(
            6
          )} APT\n\n`;
          text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

          // Show each wallet with its balances
          portfolio.wallets.forEach((wallet, index) => {
            const shortAddr = `${wallet.address.slice(
              0,
              8
            )}...${wallet.address.slice(-6)}`;
            const star = wallet.is_default ? "⭐ " : "";
            text += `🏦 <b>Wallet ${index + 1}</b> ${star}\n`;
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
            text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            text += `📊 <b>Total Portfolio Holdings:</b>\n`;
            const sortedTokens = Object.entries(portfolio.tokens).sort(
              ([, a], [, b]) => b - a
            );
            sortedTokens.forEach(([tokenName, balance]) => {
              const emoji = getTokenEmoji(tokenName);
              text += `${emoji} <b>${tokenName}:</b> ${balance.toFixed(6)}\n`;
            });
            text += `\n`;
          }
        }

        text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        text += `🕐 Last updated: ${new Date().toLocaleTimeString()}`;

        // Delete loading message and send portfolio
        try {
          await ctx.deleteMessage(loadingMsg.message_id);
        } catch {}

        await ctx.reply(text, {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("🔄 Refresh", "portfolio"),
              Markup.button.callback("🏦 Wallets", "wallets"),
            ],
            [
              Markup.button.callback(
                "🤖 AI Copy Trading",
                "start_copy_trading"
              ),
              Markup.button.callback("🏠 Main Menu", "start"),
            ],
          ]),
        });
      } catch (error) {
        // Delete loading message
        try {
          await ctx.deleteMessage(loadingMsg.message_id);
        } catch {}

        await ctx.reply(
          `❌ <b>Portfolio Load Error</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Unable to load portfolio data. Please try again later or check your wallet connections.\n\n` +
            `🔧 <b>Troubleshooting:</b>\n` +
            `• Check internet connection\n` +
            `• Verify wallet addresses\n` +
            `• Try refreshing the data\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("🔄 Retry", "portfolio")],
              [Markup.button.callback("🏦 View Wallets", "wallets")],
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
        `🏆 <b>Neo Trade - Elite Trading Leaderboard</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `🚀 <b>Coming Soon!</b>\n\n` +
          `Discover the most profitable traders and copy their winning strategies with our AI-powered leaderboard system.\n\n` +
          `✨ <b>Premium Features:</b>\n` +
          `• 📊 Elite trader rankings\n` +
          `• 🎯 AI copy trading signals\n` +
          `• 📈 Advanced performance metrics\n` +
          `• 🔥 Hot wallet tracking\n` +
          `• 💎 Diamond hands leaderboard\n` +
          `• 🎪 Trading competitions\n` +
          `• 🤖 AI strategy analysis\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `🎯 <b>Get Ready:</b> Start building your portfolio now to dominate the leaderboard!`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("🏦 View Wallets", "wallets"),
              Markup.button.callback("📊 Portfolio", "portfolio"),
            ],
            [
              Markup.button.callback(
                "🤖 AI Copy Trading",
                "start_copy_trading"
              ),
              Markup.button.callback("🏠 Main Menu", "start"),
            ],
          ]),
        }
      );
    } catch (e) {
      console.error("leaderboard failed:", e);
    }
  });

  // Main menu action
  bot.action("main_menu", async (ctx) => {
    try {
      ctx.answerCbQuery();
      await ctx.reply(
        `⚙️ <b>Neo Trade - Main Menu</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `🎯 <b>Quick Access:</b>\n\n` +
          `Choose from our advanced trading tools and AI-powered features:`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("🏦 Wallets", "wallets"),
              Markup.button.callback("📊 Portfolio", "portfolio"),
            ],
            [
              Markup.button.callback(
                "🤖 AI Copy Trading",
                "start_copy_trading"
              ),
              Markup.button.callback("🏆 Elite Leaderboard", "leaderboard"),
            ],
            [Markup.button.callback("🏠 Home", "start")],
          ]),
        }
      );
    } catch (e) {
      console.error("main_menu failed:", e);
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
