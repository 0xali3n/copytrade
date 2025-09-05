import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import {
  ensureUser,
  listWallets,
  getBalance,
  createNewWallet,
  getWalletById,
  setDefaultWallet,
  softDeleteWallet,
  getAddressQRCodeBuffer,
  sendAPT,
  computeMaxSpendableAPT,
  getExplorerTxUrl,
} from "./wallet.js";

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Set bot commands
bot.telegram.setMyCommands([
  { command: "start", description: "🏠 Main menu" },
  { command: "wallets", description: "👛 View wallets" },
]);

// Transfer state management
const transferState = new Map();

// Render welcome screen
async function renderWelcome(ctx) {
  try {
    await ensureUser(ctx.from);
    const name = ctx.from.first_name || ctx.from.username || "User";

    await ctx.reply(
      `🚀 Welcome, <b>${name}</b> to EchoVault!\n\n` +
        `Securely manage Aptos wallets, view balances, and soon copy-trade top wallets.\n\n` +
        `✨ <b>Features:</b>\n` +
        `• Create & manage multiple wallets\n` +
        `• View balances & QR codes\n` +
        `• Transfer APT with optimized gas\n` +
        `• Professional UI/UX\n\n` +
        `Choose an option below:`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("👛 My Wallets", "wallets")],
          [Markup.button.callback("📊 Portfolio", "portfolio")],
          [Markup.button.callback("🏆 Leaderboard", "leaderboard")],
        ]),
      }
    );
  } catch (e) {
    console.error("renderWelcome failed:", e);
    await ctx.reply("❌ Failed to load welcome screen.");
  }
}

// Render wallets list
async function renderWallets(ctx) {
  try {
    await ensureUser(ctx.from);
    const wallets = await listWallets(ctx.from.id);
    if (!wallets.length) {
      return ctx.reply(
        "👛 <b>No wallets found</b>\n\nCreate your first wallet to get started!",
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("➕ Create Wallet", "create_wallet")],
            [Markup.button.callback("🏠 Main Menu", "start")],
          ]),
        }
      );
    }

    // Fetch balances in parallel
    const walletsWithBalances = await Promise.all(
      wallets.map(async (w) => ({
        ...w,
        balance: await getBalance(w.address).catch(() => 0),
      }))
    );

    const totalBalance = walletsWithBalances.reduce(
      (sum, w) => sum + w.balance,
      0
    );

    let text = `👛 <b>Your Wallets</b>\n\n`;
    text += `💰 Total Balance: <b>${totalBalance.toFixed(4)} APT</b>\n\n`;

    // Create a cleaner button layout
    const buttons = [];

    // Add wallet buttons in pairs (2 per row)
    for (let i = 0; i < walletsWithBalances.length; i += 2) {
      const row = [];
      for (let j = 0; j < 2 && i + j < walletsWithBalances.length; j++) {
        const wallet = walletsWithBalances[i + j];
        const star = wallet.is_default ? "⭐ " : "";
        const shortAddr = `${wallet.address.slice(
          0,
          6
        )}...${wallet.address.slice(-4)}`;
        const buttonText = `${star}${shortAddr}`;
        row.push(
          Markup.button.callback(buttonText, `wallet_view_${wallet.id}`)
        );
      }
      buttons.push(row);
    }

    // Add action buttons
    buttons.push([
      Markup.button.callback("➕ Create New Wallet", "create_wallet"),
    ]);
    buttons.push([Markup.button.callback("🏠 Main Menu", "start")]);

    await ctx.reply(text, {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard(buttons),
    });
  } catch (e) {
    console.error("renderWallets failed:", e);
    await ctx.reply("❌ Failed to load wallets.");
  }
}

// Commands
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

// Main menu actions
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

// Create new wallet
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
            Markup.button.callback("💸 Transfer APT", `wallet_transfer_${id}`),
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

// View wallet: show QR + actions
bot.action(/wallet_view_(\d+)/, async (ctx) => {
  try {
    ctx.answerCbQuery();
    const id = ctx.match[1];
    const wallet = await getWalletById(ctx.from.id, id);
    if (!wallet) return ctx.reply("❌ Wallet not found.");

    const bal = await getBalance(wallet.address).catch(() => 0);
    const caption =
      `👛 <b>Wallet</b> ${wallet.is_default ? "⭐" : ""}\n\n` +
      `💰 Balance: ${bal.toFixed(4)} APT\n\n` +
      `📋 <b>Address:</b>\n<code>${wallet.address}</code>`;

    const png = await getAddressQRCodeBuffer(wallet.address);

    await ctx.editMessageMedia(
      { type: "photo", media: { source: png } },
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
              "⭐ Set Default",
              `wallet_default_${wallet.id}`
            ),
          ],
          [
            Markup.button.callback("🔐 Private Key", `wallet_pk_${wallet.id}`),
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

// Start transfer flow
bot.action(/wallet_transfer_(\d+)/, async (ctx) => {
  try {
    ctx.answerCbQuery();
    const walletId = ctx.match[1];
    const key = `${ctx.from.id}_${walletId}`;
    transferState.set(key, { walletId, step: "ask_to" });
    await ctx.reply("📤 Send recipient address (0x...):");
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
          return ctx.reply("💰 Enter amount in APT:", {
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "Use Max",
                  `transfer_max_${state.walletId}`
                ),
              ],
            ]),
          });
        }
        if (state.step === "ask_amount") {
          const text = ctx.message.text.trim().toLowerCase();
          const amount = text === "max" ? NaN : Number(text);
          if (!Number.isFinite(amount) || amount <= 0)
            return ctx.reply("❌ Invalid amount. Send a positive number.");
          state.amount = amount;
          state.step = "confirm";
          return ctx.reply(
            `🔐 <b>Confirm Transfer</b>\n\n` +
              `📤 <b>To:</b> <code>${state.to}</code>\n` +
              `💰 <b>Amount:</b> ${amount} APT\n` +
              `⛽ <b>Est. Fee:</b> ~0.0002 APT\n\n` +
              `⚠️ This action cannot be undone!`,
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
          )} APT (amount + est. fee ${fee.toFixed(6)}), have ${balance.toFixed(
            6
          )}.`
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
      `🎉 <b>Transfer Successful!</b>\n\n` +
        `💰 <b>Amount:</b> ${state.amount} APT\n` +
        `📤 <b>To:</b> <code>${state.to}</code>\n` +
        `🔗 <b>Transaction:</b> ${getExplorerTxUrl(txHash)}\n\n` +
        `✨ Your transaction has been confirmed on the Aptos network!`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("📋 View Wallets", "wallets")],
          [Markup.button.callback("🏠 Main Menu", "start")],
        ]),
      }
    );
  } catch (e) {
    console.error("transfer_confirm failed:", e);
    const msg = e?.message || "unknown error";
    try {
      await ctx.reply(`⚠️ Transfer failed: ${msg}`);
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
    await ctx.reply("❌ Transfer cancelled.");
  } catch (e) {
    console.error("transfer_cancel failed:", e);
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error("Bot error:", err);
  try {
    ctx.reply("❌ An error occurred. Please try again.");
  } catch {}
});

// Start bot
bot.launch().then(() => {
  console.log("✅ Bot started successfully");
});

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
