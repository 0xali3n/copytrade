import { Markup } from "telegraf";
import {
  ensureUser,
  createNewWallet,
  getWalletById,
  getBalance,
  setDefaultWallet,
  softDeleteWallet,
  getAddressQRCodeBuffer,
  getWalletWithBalances,
} from "../wallet.js";
import { renderWallets } from "./ui.js";

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

// Create new wallet
export function setupWalletActions(bot) {
  bot.action("create_wallet", async (ctx) => {
    try {
      ctx.answerCbQuery();
      await ensureUser(ctx.from);
      const { id, address, privateKey } = await createNewWallet(
        ctx.from.id,
        true // Set as default
      );

      const png = await getAddressQRCodeBuffer(address);

      await ctx.replyWithPhoto(
        { source: png },
        {
          caption:
            `🎉 <b>Neo Trade - Wallet Created Successfully!</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📋 <b>Wallet Address:</b>\n<code>${address}</code>\n\n` +
            `⭐ <b>Status:</b> Set as your primary trading wallet\n\n` +
            `🔐 <b>Security Protocol:</b>\n` +
            `• Store your private key in a secure location\n` +
            `• Never share your private key with anyone\n` +
            `• Create multiple secure backups\n` +
            `• Enable 2FA for additional security\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🚀 <b>Ready to Trade!</b> Your wallet is now active and optimized for trading.`,
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("🔐 Show Private Key", `wallet_pk_${id}`),
              Markup.button.callback(
                "💸 Transfer APT",
                `wallet_transfer_${id}`
              ),
            ],
            [
              Markup.button.callback("🏦 All Wallets", "wallets"),
              Markup.button.callback("📊 Portfolio", "portfolio"),
            ],
            [Markup.button.callback("🏠 Main Menu", "start")],
          ]),
        }
      );
    } catch (e) {
      console.error("create_wallet failed:", e);
      await ctx.reply("❌ Failed to create wallet.");
    }
  });

  // View wallet: show QR + actions (sends new photo message instead of editing)
  bot.action(/wallet_view_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const id = ctx.match[1];

      // Show loading message
      const loadingMsg = await ctx.reply("⏳ Loading wallet details...");

      try {
        const wallet = await getWalletWithBalances(ctx.from.id, id);
        if (!wallet) {
          await ctx.deleteMessage(loadingMsg.message_id);
          return ctx.reply("❌ Wallet not found.");
        }

        const bal = await getBalance(wallet.address).catch(() => 0);

        let caption =
          `🏦 <b>Neo Trade - Wallet Details</b> ${
            wallet.is_default ? "⭐" : ""
          }\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📋 <b>Wallet Address:</b>\n<code>${wallet.address}</code>\n\n` +
          `💰 <b>APT Balance:</b> <b>${bal.toFixed(6)} APT</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        // Add token balances if any
        if (Object.keys(wallet.tokenBalances).length > 0) {
          caption += `🪙 <b>Token Holdings:</b>\n\n`;

          // Sort tokens by balance (descending)
          const sortedTokens = Object.entries(wallet.tokenBalances).sort(
            ([, a], [, b]) => b - a
          );

          sortedTokens.forEach(([tokenName, balance]) => {
            const emoji = getTokenEmoji(tokenName);
            caption += `${emoji} <b>${tokenName}:</b> ${balance.toFixed(6)}\n`;
          });
          caption += `\n`;
        } else {
          caption += `🪙 <b>Token Holdings:</b> None\n\n`;
        }

        caption += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        caption += `🕐 Last updated: ${new Date().toLocaleTimeString()}`;

        const png = await getAddressQRCodeBuffer(wallet.address);

        // Delete loading message
        await ctx.deleteMessage(loadingMsg.message_id);

        // Send new photo message instead of trying to edit text message to photo
        await ctx.replyWithPhoto(
          { source: png },
          {
            caption,
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "💸 Transfer APT",
                  `wallet_transfer_${wallet.id}`
                ),
                Markup.button.callback(
                  "🔐 Private Key",
                  `wallet_pk_${wallet.id}`
                ),
              ],
              [
                Markup.button.callback(
                  "⭐ Set Default",
                  `wallet_default_${wallet.id}`
                ),
                Markup.button.callback(
                  "🗑️ Delete",
                  `wallet_delete_confirm_${wallet.id}`
                ),
              ],
              [
                Markup.button.callback("🏦 All Wallets", "wallets_back"),
                Markup.button.callback("🏠 Main Menu", "start"),
              ],
            ]),
          }
        );
      } catch (error) {
        // Delete loading message
        try {
          await ctx.deleteMessage(loadingMsg.message_id);
        } catch {}

        await ctx.reply("❌ Failed to load wallet details. Please try again.");
      }
    } catch (e) {
      console.error("wallet_view failed:", e);
      try {
        await ctx.reply("⚠️ Failed to load wallet view.");
      } catch {}
    }
  });

  // Show private key
  bot.action(/wallet_pk_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const id = ctx.match[1];
      const wallet = await getWalletById(ctx.from.id, id);
      if (!wallet) return ctx.reply("❌ Wallet not found.");
      await ctx.reply(
        `🔐 <b>Neo Trade - Wallet Credentials</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📋 <b>Wallet Address:</b>\n<code>${wallet.address}</code>\n\n` +
          `🔑 <b>Private Key:</b>\n<code>${wallet.private_key}</code>\n\n` +
          `⚠️ <b>Critical Security Alert:</b>\n` +
          `• Never share your private key with anyone\n` +
          `• Store it in an encrypted, secure location\n` +
          `• Anyone with this key has full wallet access\n` +
          `• Consider using a hardware wallet for large amounts\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🔙 Back to Wallet", `wallet_view_${id}`)],
            [Markup.button.callback("🏠 Main Menu", "start")],
          ]),
        }
      );
    } catch (e) {
      console.error("wallet_pk failed:", e);
    }
  });

  // Set default wallet
  bot.action(/wallet_default_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const id = ctx.match[1];
      await setDefaultWallet(ctx.from.id, id);
      await ctx.reply("✅ Default wallet updated!");
    } catch (e) {
      console.error("wallet_default failed:", e);
      await ctx.reply("❌ Failed to set default wallet.");
    }
  });

  // Delete wallet confirmation
  bot.action(/wallet_delete_confirm_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const id = ctx.match[1];
      await ctx.reply(
        "⚠️ <b>Delete Wallet</b>\n\nThis will permanently delete the wallet. Are you sure?",
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("✅ Yes, Delete", `wallet_delete_${id}`),
              Markup.button.callback("❌ Cancel", `wallet_view_${id}`),
            ],
          ]),
        }
      );
    } catch (e) {
      console.error("wallet_delete_confirm failed:", e);
    }
  });

  // Delete wallet
  bot.action(/wallet_delete_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const id = ctx.match[1];
      await softDeleteWallet(ctx.from.id, id);
      await ctx.reply("✅ Wallet deleted successfully!");
    } catch (e) {
      console.error("wallet_delete failed:", e);
      await ctx.reply("❌ Failed to delete wallet.");
    }
  });
}
