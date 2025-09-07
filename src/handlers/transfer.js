import { Markup } from "telegraf";
import {
  getWalletById,
  getBalance,
  sendAPT,
  computeMaxSpendableAPT,
  getExplorerTxUrl,
} from "../wallet.js";

// Transfer state management
export const transferState = new Map();

export function setupTransferActions(bot) {
  // Start transfer flow
  bot.action(/wallet_transfer_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const walletId = ctx.match[1];
      const key = `${ctx.from.id}_${walletId}`;
      transferState.set(key, { walletId, step: "ask_to" });
      await ctx.reply(
        `💸 <b>EchoVault - Transfer APT</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📤 <b>Step 1:</b> Enter recipient address\n\n` +
          `Send the Aptos wallet address (0x...) where you want to transfer APT.\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("❌ Cancel", "wallets_back")],
          ]),
        }
      );
    } catch (e) {
      console.error("transfer_start failed:", e);
    }
  });

  // Handle transfer text flow
  bot.on("text", async (ctx) => {
    try {
      // Check if user is in transfer flow
      for (const [key, state] of transferState.entries()) {
        if (key.startsWith(`${ctx.from.id}_`)) {
          if (state.step === "ask_to") {
            const to = ctx.message.text.trim();
            if (!/^0x[0-9a-fA-F]+$/.test(to))
              return ctx.reply("❌ Invalid address. Send again (0x...)");
            state.to = to;
            state.step = "ask_amount";
            return ctx.reply(
              `💸 <b>EchoVault - Transfer APT</b>\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `📤 <b>Recipient:</b> <code>${state.to}</code>\n\n` +
                `💰 <b>Step 2:</b> Enter amount in APT\n\n` +
                `Send the amount you want to transfer, or use the "Use Max" button for maximum available amount.\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
              {
                parse_mode: "HTML",
                ...Markup.inlineKeyboard([
                  [
                    Markup.button.callback(
                      "💰 Use Max Amount",
                      `transfer_max_${state.walletId}`
                    ),
                  ],
                  [Markup.button.callback("❌ Cancel", "wallets_back")],
                ]),
              }
            );
          }
          if (state.step === "ask_amount") {
            const text = ctx.message.text.trim().toLowerCase();
            const amount = text === "max" ? NaN : Number(text);
            if (!Number.isFinite(amount) || amount <= 0)
              return ctx.reply("❌ Invalid amount. Send a positive number.");
            state.amount = amount;
            state.step = "confirm";
            return ctx.reply(
              `🔐 <b>EchoVault - Confirm Transfer</b>\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `📤 <b>Recipient:</b> <code>${state.to}</code>\n` +
                `💰 <b>Amount:</b> <b>${amount} APT</b>\n` +
                `⛽ <b>Est. Fee:</b> ~0.0002 APT\n` +
                `📊 <b>Total:</b> ${(amount + 0.0002).toFixed(6)} APT\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `⚠️ <b>Important:</b>\n` +
                `• This action cannot be undone\n` +
                `• Double-check the recipient address\n` +
                `• Ensure sufficient balance\n\n` +
                `🎯 <b>Ready to proceed?</b>`,
              {
                parse_mode: "HTML",
                ...Markup.inlineKeyboard([
                  [
                    Markup.button.callback(
                      "✅ Confirm Transfer",
                      `transfer_confirm_${state.walletId}`
                    ),
                  ],
                  [
                    Markup.button.callback(
                      "❌ Cancel",
                      `transfer_cancel_${state.walletId}`
                    ),
                  ],
                ]),
              }
            );
          }
          return;
        }
      }
    } catch (e) {
      console.error("transfer text flow failed:", e);
    }
  });

  // Handle Max amount
  bot.action(/transfer_max_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const walletId = ctx.match[1];
      const wallet = await getWalletById(ctx.from.id, walletId);
      if (!wallet) return ctx.reply("❌ Wallet not found.");
      const { maxApt, estimatedFeeApt } = await computeMaxSpendableAPT({
        senderPrivateKey: wallet.private_key,
        senderAddress: wallet.address,
      });
      const max = maxApt;
      const key = `${ctx.from.id}_${walletId}`;
      const state = transferState.get(key);
      if (!state) return ctx.reply("❌ Transfer session expired.");

      state.amount = max;
      state.step = "confirm";

      // Go directly to confirmation if we have recipient address
      if (state.to) {
        await ctx.reply(
          `🎯 <b>Using Max Amount</b>\n\n` +
            `💰 <b>Amount:</b> ${max.toFixed(6)} APT\n` +
            `⛽ <b>Est. Fee:</b> ${estimatedFeeApt.toFixed(6)} APT\n` +
            `📤 <b>To:</b> <code>${state.to}</code>\n\n` +
            `Confirm this transfer?`,
          {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "✅ Confirm Transfer",
                  `transfer_confirm_${walletId}`
                ),
              ],
              [
                Markup.button.callback(
                  "❌ Cancel",
                  `transfer_cancel_${walletId}`
                ),
              ],
            ]),
          }
        );
      } else {
        // Still need recipient address
        await ctx.reply(
          `Using max spendable: <b>${max.toFixed(
            6
          )}</b> APT (est. fee ${estimatedFeeApt.toFixed(
            6
          )}). Now send recipient address (0x...).`,
          { parse_mode: "HTML" }
        );
      }
    } catch (e) {
      console.error("transfer_max failed:", e);
    }
  });

  // Confirm transfer
  bot.action(/transfer_confirm_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const walletId = ctx.match[1];
      const key = `${ctx.from.id}_${walletId}`;
      const state = transferState.get(key);
      if (!state) return ctx.reply("❌ Transfer session expired.");

      const wallet = await getWalletById(ctx.from.id, walletId);
      if (!wallet) return ctx.reply("❌ Wallet not found.");

      // Check balance
      try {
        const fee = await computeMaxSpendableAPT({
          senderPrivateKey: wallet.private_key,
          senderAddress: wallet.address,
        }).then((r) => r.estimatedFeeApt);
        const balance = await getBalance(wallet.address).catch(() => 0);
        if (state.amount + fee > balance)
          return ctx.reply(
            `❌ Insufficient balance. Need ${(state.amount + fee).toFixed(
              6
            )} APT (amount + est. fee ${fee.toFixed(
              6
            )}), have ${balance.toFixed(6)}.`
          );
      } catch {}

      await ctx.reply("⏳ Sending transaction...");
      const txHash = await sendAPT({
        senderPrivateKey: wallet.private_key,
        recipientAddress: state.to,
        amountApt: state.amount,
      });
      transferState.delete(key);

      // Beautiful success message
      await ctx.reply(
        `🎉 <b>EchoVault - Transfer Successful!</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `💰 <b>Amount Sent:</b> <b>${state.amount} APT</b>\n` +
          `📤 <b>Recipient:</b> <code>${state.to}</code>\n` +
          `🔗 <b>Transaction Hash:</b> <code>${txHash}</code>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `✅ <b>Status:</b> Confirmed on Aptos Network\n` +
          `🕐 <b>Time:</b> ${new Date().toLocaleTimeString()}\n\n` +
          `🔗 <b>View on Explorer:</b> ${getExplorerTxUrl(txHash)}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `✨ <b>Your transaction has been successfully processed!</b>`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("🏦 View Wallets", "wallets"),
              Markup.button.callback("📊 Portfolio", "portfolio"),
            ],
            [Markup.button.callback("🏠 Main Menu", "start")],
          ]),
        }
      );
    } catch (e) {
      console.error("transfer_confirm failed:", e);
      const msg = e?.message || "unknown error";
      try {
        await ctx.reply(`⚠️ <b>Transfer Failed</b>\n\n${msg}`, {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("📋 View Wallets", "wallets")],
            [Markup.button.callback("🏠 Main Menu", "start")],
          ]),
        });
      } catch {}
    }
  });

  // Cancel transfer
  bot.action(/transfer_cancel_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const walletId = ctx.match[1];
      const key = `${ctx.from.id}_${walletId}`;
      transferState.delete(key);
      await ctx.reply("❌ <b>Transfer Cancelled</b>", {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📋 View Wallets", "wallets")],
          [Markup.button.callback("🏠 Main Menu", "start")],
        ]),
      });
    } catch (e) {
      console.error("transfer_cancel failed:", e);
    }
  });
}
