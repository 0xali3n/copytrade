import { Markup } from "telegraf";
import {
  ensureUser,
  createNewWallet,
  getWalletById,
  getBalance,
  setDefaultWallet,
  softDeleteWallet,
  getAddressQRCodeBuffer,
} from "../wallet.js";
import { renderWallets } from "./ui.js";

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
            `🎉 <b>New Wallet Created!</b>\n\n` +
            `📋 <b>Address:</b>\n<code>${address}</code>\n\n` +
            `⭐ This wallet is now your default wallet.\n\n` +
            `⚠️ <b>Important:</b> Save your private key securely!`,
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("🔐 Show Private Key", `wallet_pk_${id}`),
              Markup.button.callback(
                "💸 Transfer APT",
                `wallet_transfer_${id}`
              ),
            ],
            [Markup.button.callback("📋 View All Wallets", "wallets")],
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
      const wallet = await getWalletById(ctx.from.id, id);
      if (!wallet) return ctx.reply("❌ Wallet not found.");

      const bal = await getBalance(wallet.address).catch(() => 0);

      const caption =
        `👛 <b>Wallet</b> ${wallet.is_default ? "⭐" : ""}\n\n` +
        `📋 <b>Address:</b>\n<code>${wallet.address}</code>\n\n` +
        `💰 <b>Balance:</b> ${bal.toFixed(4)} APT`;

      const png = await getAddressQRCodeBuffer(wallet.address);

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
            ],
            [
              Markup.button.callback(
                "⭐ Set Default",
                `wallet_default_${wallet.id}`
              ),
              Markup.button.callback(
                "🔐 Private Key",
                `wallet_pk_${wallet.id}`
              ),
            ],
            [
              Markup.button.callback(
                "🗑️ Delete",
                `wallet_delete_confirm_${wallet.id}`
              ),
            ],
            [Markup.button.callback("⬅️ Back", "wallets_back")],
          ]),
        }
      );
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
        `📋 <b>Wallet Address</b>\n\n` +
          `<code>${wallet.address}</code>\n\n` +
          `⚠️ <b>Private Key</b> (do not share):\n` +
          `<code>${wallet.private_key}</code>`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("🔙 Back to Wallet", `wallet_view_${id}`)],
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
