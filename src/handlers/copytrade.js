import { Markup } from "telegraf";
import axios from "axios";
import {
  ensureUser,
  getDefaultWallet,
  addCopyTrading,
  getCopyTrading,
  stopCopyTrading,
  updateLastTxVersion,
  isValidHexAddress,
  short,
} from "../wallet.js";

// Copy trading state management
export const copyTradeState = new Map();

// Active copy trading sessions
const activeCopyTrading = new Map();

// Helper function to format private key for Pontem SDK
function formatPrivateKeyForPontem(privateKey) {
  // Remove ed25519-priv- prefix if present
  let formattedKey = privateKey;
  if (privateKey.startsWith("ed25519-priv-")) {
    formattedKey = privateKey.replace("ed25519-priv-", "");
  }

  // Ensure it starts with 0x
  if (!formattedKey.startsWith("0x")) {
    formattedKey = "0x" + formattedKey;
  }

  console.log(`🔑 Formatted private key: ${formattedKey.slice(0, 10)}...`);
  return formattedKey;
}

export function setupCopyTradeActions(bot) {
  console.log("🚀 Setting up copy trading handlers...");

  // Start copy trading flow
  bot.action("start_copy_trading", async (ctx) => {
    try {
      console.log(`🔍 Copy trading button clicked by user ${ctx.from.id}`);
      ctx.answerCbQuery();
      await ensureUser(ctx.from);

      // Check if user has a default wallet
      const defaultWallet = await getDefaultWallet(ctx.from.id);
      if (!defaultWallet) {
        return ctx.reply(
          "❌ <b>No Default Wallet Found</b>\n\n" +
            "You need to create a wallet and set it as default before starting copy trading.\n\n" +
            "The default wallet will be used to execute copy trades.",
          {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
              [Markup.button.callback("👛 Create Wallet", "create_wallet")],
              [Markup.button.callback("🏠 Main Menu", "start")],
            ]),
          }
        );
      }

      const key = `${ctx.from.id}_copy_trade`;
      copyTradeState.set(key, { step: "ask_master_wallet" });

      await ctx.reply(
        `🚀 <b>EchoVault - Copy Trading Setup</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📋 <b>Your Trading Wallet:</b>\n<code>${defaultWallet.address}</code>\n\n` +
          `🎯 <b>Next Step:</b>\n` +
          `Enter the master wallet address (0x...) that you want to copy trades from.\n\n` +
          `✨ <b>How it works:</b>\n` +
          `• Monitor master wallet transactions\n` +
          `• Automatically copy swap trades\n` +
          `• Execute with your default wallet\n` +
          `• Real-time notifications\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📤 <b>Enter Master Wallet Address:</b>`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("❌ Cancel", "start")],
          ]),
        }
      );
    } catch (e) {
      console.error("start_copy_trading failed:", e);
      await ctx.reply("❌ Failed to start copy trading setup.");
    }
  });

  // Handle copy trading text flow
  bot.on("text", async (ctx) => {
    try {
      // Check if user is in copy trading flow
      const key = `${ctx.from.id}_copy_trade`;
      const state = copyTradeState.get(key);

      console.log(
        `📝 Text received from user ${ctx.from.id}: "${ctx.message.text}"`
      );
      console.log(`🔍 Copy trade state for user:`, state);

      if (state && state.step === "ask_master_wallet") {
        const masterWallet = ctx.message.text.trim();
        console.log(
          `🔍 User ${ctx.from.id} entered master wallet: ${masterWallet}`
        );

        if (!isValidHexAddress(masterWallet)) {
          return ctx.reply(
            "❌ Invalid address format. Please send a valid Aptos address (0x...):"
          );
        }

        // Check if user already has copy trading for this wallet
        const existingCopyTrading = await getCopyTrading(ctx.from.id);
        const alreadyExists = existingCopyTrading.some(
          (ct) =>
            ct.master_wallet_address.toLowerCase() ===
            masterWallet.toLowerCase()
        );

        if (alreadyExists) {
          copyTradeState.delete(key);
          return ctx.reply(
            "⚠️ <b>Already Copy Trading</b>\n\n" +
              `You are already copy trading from:\n<code>${masterWallet}</code>\n\n` +
              "Use the copy trading management to stop or modify existing sessions.",
            {
              parse_mode: "HTML",
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback(
                    "📊 Manage Copy Trading",
                    "manage_copy_trading"
                  ),
                ],
                [Markup.button.callback("🏠 Main Menu", "start")],
              ]),
            }
          );
        }

        state.masterWallet = masterWallet;
        state.step = "confirm";

        const defaultWallet = await getDefaultWallet(ctx.from.id);

        return ctx.reply(
          `🔐 <b>EchoVault - Confirm Copy Trading</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📋 <b>Master Wallet:</b>\n<code>${masterWallet}</code>\n\n` +
            `👛 <b>Your Trading Wallet:</b>\n<code>${defaultWallet.address}</code>\n\n` +
            `⚠️ <b>Important Information:</b>\n` +
            `• Your wallet will automatically copy swap trades\n` +
            `• Ensure sufficient balance for trading fees\n` +
            `• Monitor your trades and stop anytime\n` +
            `• Real-time notifications for all activities\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `🎯 <b>Ready to start copy trading?</b>`,
          {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "✅ Start Copy Trading",
                  `confirm_copy_trading_${ctx.from.id}`
                ),
              ],
              [
                Markup.button.callback(
                  "❌ Cancel",
                  `cancel_copy_trading_${ctx.from.id}`
                ),
              ],
            ]),
          }
        );
      }
    } catch (e) {
      console.error("copy trading text flow failed:", e);
    }
  });

  // Confirm copy trading
  bot.action(/confirm_copy_trading_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const telegramId = ctx.match[1];
      const key = `${telegramId}_copy_trade`;
      const state = copyTradeState.get(key);

      if (!state) {
        return ctx.reply("❌ Copy trading session expired. Please try again.");
      }

      const defaultWallet = await getDefaultWallet(telegramId);
      if (!defaultWallet) {
        copyTradeState.delete(key);
        return ctx.reply("❌ Default wallet not found. Please try again.");
      }

      // Add copy trading to database
      const copyTradingId = await addCopyTrading(
        telegramId,
        state.masterWallet
      );

      // Start the copy trading monitoring
      const sessionKey = `${telegramId}_${state.masterWallet}`;
      if (!activeCopyTrading.has(sessionKey)) {
        // Format private key for Pontem SDK
        const formattedPrivateKey = formatPrivateKeyForPontem(
          defaultWallet.private_key
        );

        console.log(`🚀 Starting copy trading session for user ${telegramId}`);
        console.log(`📋 Master wallet: ${state.masterWallet}`);
        console.log(`👛 User wallet: ${defaultWallet.address}`);

        // Start copy trading with user's default wallet private key
        startCopyTradingForUser(
          state.masterWallet,
          formattedPrivateKey,
          telegramId,
          ctx
        );
        activeCopyTrading.set(sessionKey, {
          masterWallet: state.masterWallet,
          userWallet: defaultWallet,
          telegramId: telegramId,
          ctx: ctx,
        });
      }

      copyTradeState.delete(key);

      await ctx.reply(
        `🎉 <b>EchoVault - Copy Trading Active!</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📋 <b>Master Wallet:</b>\n<code>${state.masterWallet}</code>\n\n` +
          `👛 <b>Your Trading Wallet:</b>\n<code>${defaultWallet.address}</code>\n\n` +
          `✅ <b>Status:</b> Active & Monitoring\n` +
          `🔄 <b>Check Frequency:</b> Every 3 seconds\n` +
          `📊 <b>Trade Types:</b> Swap transactions only\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `🚀 <b>Your wallet will now automatically copy trades from the master wallet!</b>\n\n` +
          `You'll receive real-time notifications for all trading activities.`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "📊 Manage Copy Trading",
                "manage_copy_trading"
              ),
              Markup.button.callback("📊 Portfolio", "portfolio"),
            ],
            [Markup.button.callback("🏠 Main Menu", "start")],
          ]),
        }
      );
    } catch (e) {
      console.error("confirm_copy_trading failed:", e);
      await ctx.reply("❌ Failed to start copy trading. Please try again.");
    }
  });

  // Cancel copy trading
  bot.action(/cancel_copy_trading_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const telegramId = ctx.match[1];
      const key = `${telegramId}_copy_trade`;
      copyTradeState.delete(key);

      await ctx.reply("❌ <b>Copy Trading Cancelled</b>", {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🏠 Main Menu", "start")],
        ]),
      });
    } catch (e) {
      console.error("cancel_copy_trading failed:", e);
    }
  });

  // Manage copy trading
  bot.action("manage_copy_trading", async (ctx) => {
    try {
      ctx.answerCbQuery();
      await ensureUser(ctx.from);

      const copyTradingList = await getCopyTrading(ctx.from.id);

      if (copyTradingList.length === 0) {
        return ctx.reply(
          `📊 <b>EchoVault - Copy Trading Management</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📭 <b>No Active Sessions</b>\n\n` +
            `You don't have any active copy trading sessions.\n\n` +
            `🚀 <b>Get Started:</b>\n` +
            `• Start copy trading to follow successful traders\n` +
            `• Automatically copy profitable strategies\n` +
            `• Monitor and manage your sessions\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          {
            parse_mode: "HTML",
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "🚀 Start Copy Trading",
                  "start_copy_trading"
                ),
              ],
              [Markup.button.callback("🏠 Main Menu", "start")],
            ]),
          }
        );
      }

      let text = `📊 <b>EchoVault - Copy Trading Management</b>\n\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      text += `📈 <b>Active Sessions:</b> ${copyTradingList.length}\n\n`;

      const buttons = [];

      copyTradingList.forEach((ct, index) => {
        const shortAddr = short(ct.master_wallet_address);
        text += `🎯 <b>Session ${index + 1}</b>\n`;
        text += `📋 <b>Master:</b> <code>${shortAddr}</code>\n`;
        text += `✅ <b>Status:</b> Active & Monitoring\n`;
        text += `📅 <b>Started:</b> ${new Date(
          ct.created_at
        ).toLocaleDateString()}\n\n`;

        buttons.push([
          Markup.button.callback(
            `🛑 Stop ${shortAddr}`,
            `stop_copy_trading_${ct.id}`
          ),
        ]);
      });

      text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      text += `🕐 Last updated: ${new Date().toLocaleTimeString()}`;

      buttons.push([
        Markup.button.callback("🚀 Add New Session", "start_copy_trading"),
      ]);
      buttons.push([
        Markup.button.callback("📊 Portfolio", "portfolio"),
        Markup.button.callback("🏠 Main Menu", "start"),
      ]);

      await ctx.reply(text, {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard(buttons),
      });
    } catch (e) {
      console.error("manage_copy_trading failed:", e);
      await ctx.reply("❌ Failed to load copy trading management.");
    }
  });

  // Stop copy trading
  bot.action(/stop_copy_trading_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const copyTradingId = ctx.match[1];

      await stopCopyTrading(ctx.from.id, copyTradingId);

      // Remove from active sessions
      for (const [key, session] of activeCopyTrading.entries()) {
        if (session.telegramId === ctx.from.id) {
          activeCopyTrading.delete(key);
          break;
        }
      }

      await ctx.reply(
        "✅ <b>Copy Trading Stopped</b>\n\nCopy trading session has been stopped successfully.",
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "📊 Manage Copy Trading",
                "manage_copy_trading"
              ),
            ],
            [Markup.button.callback("🏠 Main Menu", "start")],
          ]),
        }
      );
    } catch (e) {
      console.error("stop_copy_trading failed:", e);
      await ctx.reply("❌ Failed to stop copy trading.");
    }
  });

  console.log("✅ Copy trading handlers setup complete");
}

// Modified copy trading function for individual users
async function startCopyTradingForUser(
  masterWallet,
  userPrivateKey,
  telegramId,
  ctx
) {
  console.log(`🚀 Starting copy trading for user ${telegramId}`);
  console.log(`📋 Master wallet: ${masterWallet}`);
  console.log(`🔑 Using private key: ${userPrivateKey.slice(0, 10)}...`);

  const APTOS_API = "https://fullnode.mainnet.aptoslabs.com/v1";
  const url = `${APTOS_API}/accounts/${masterWallet}/transactions?limit=1`;

  try {
    console.log(`🔍 Fetching initial transactions for ${masterWallet}`);
    const { data } = await axios.get(url);
    if (!data || data.length === 0) {
      console.log(`❌ No transactions found for ${masterWallet}`);
      return;
    }

    let latestTx = data[data.length - 1];
    let txVersion = latestTx.version;
    let lastSeen = txVersion;

    console.log(`📊 Initial transaction version: ${txVersion}`);
    console.log(`✅ Copy trading monitoring started for user ${telegramId}`);

    // Run monitoring loop
    const interval = setInterval(async () => {
      try {
        // Check if copy trading is still active
        const copyTradingList = await getCopyTrading(telegramId);
        const isActive = copyTradingList.some(
          (ct) =>
            ct.master_wallet_address.toLowerCase() ===
            masterWallet.toLowerCase()
        );

        if (!isActive) {
          console.log(`🛑 Copy trading stopped for user ${telegramId}`);
          clearInterval(interval);
          return;
        }

        const { data } = await axios.get(url);
        if (!data || data.length === 0) return;

        latestTx = data[data.length - 1];
        txVersion = latestTx.version;

        if (lastSeen === txVersion) return;

        console.log(`🔍 Checking transaction ${txVersion} for swap...`);

        if (!latestTx.payload.function.toLowerCase().includes("swap")) {
          console.log(`⏭️ Transaction ${txVersion} is not a swap, skipping`);
          return; // Not a swap transaction
        }

        lastSeen = txVersion;
        await updateLastTxVersion(telegramId, masterWallet, txVersion);

        console.log(`🔎 NEW SWAP DETECTED!`);
        console.log(`📋 Master: ${masterWallet}`);
        console.log(`🔗 Transaction: ${txVersion}`);
        console.log(`📊 Function: ${latestTx.payload.function}`);

        // Notify user about new trade
        await ctx.reply(
          `🔄 <b>New Trade Detected!</b>\n\n` +
            `📋 <b>Master Wallet:</b> <code>${short(masterWallet)}</code>\n` +
            `🔗 <b>Transaction:</b> <code>${txVersion}</code>\n\n` +
            `⏳ Executing copy trade...`,
          { parse_mode: "HTML" }
        );

        // Execute the copy trade
        const func = latestTx.payload.function;
        const typeArgs = latestTx.payload.type_arguments || [];
        const args = latestTx.payload.arguments || [];

        console.log(`📊 Trade details:`);
        console.log(`📤 From token: ${typeArgs[0]}`);
        console.log(`📥 To token: ${typeArgs[1]}`);
        console.log(`💰 Amount: ${args[0]}`);

        if (typeArgs.length >= 2) {
          const fromToken = typeArgs[0];
          const toToken = typeArgs[1];
          const amount = args[0];

          // Import swapTokens dynamically to avoid circular imports
          const { swapTokens } = await import("../trade/swap_transaction.js");

          try {
            console.log(`🚀 Executing copy trade...`);
            await swapTokens(userPrivateKey, fromToken, toToken, amount);

            console.log(`✅ Copy trade executed successfully!`);

            await ctx.reply(
              `✅ <b>Copy Trade Executed!</b>\n\n` +
                `🔄 <b>Trade Details:</b>\n` +
                `📤 <b>From:</b> ${fromToken.split("::").pop()}\n` +
                `📥 <b>To:</b> ${toToken.split("::").pop()}\n` +
                `💰 <b>Amount:</b> ${amount}\n\n` +
                `Your wallet has successfully copied the trade!`,
              { parse_mode: "HTML" }
            );
          } catch (swapError) {
            console.error(`❌ Copy trade execution failed:`, swapError);
            console.error(`❌ Error details:`, swapError.message);
            console.error(`❌ Stack trace:`, swapError.stack);

            await ctx.reply(
              `❌ <b>Copy Trade Failed</b>\n\n` +
                `Error: ${swapError.message}\n\n` +
                `Please check your wallet balance and try again.`,
              { parse_mode: "HTML" }
            );
          }
        } else {
          console.log(`❌ Invalid transaction format - missing type arguments`);
        }
      } catch (err) {
        console.error("❌ Error in copy trading loop:", err.message);
        console.error("❌ Error stack:", err.stack);
      }
    }, 3000); // Check every 3 seconds
  } catch (err) {
    console.error("❌ Error starting copy trading:", err.message);
    console.error("❌ Error stack:", err.stack);
    await ctx.reply("❌ Failed to start copy trading monitoring.");
  }
}
