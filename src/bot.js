import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import { initDB } from "./db.js";
import {
  createWalletForUser,
  generateNewWalletForUser,
  getBalance,
  isValidHexAddress,
  deleteWalletForUser,
  formatAddressShort,
  listWallets,
  createNewWallet,
  deleteWalletById,
} from "./wallet.js";

const botToken = process.env.BOT_TOKEN;
if (!botToken) {
  console.error(
    "BOT_TOKEN is missing. Set it in .env or environment variables."
  );
  process.exit(1);
}
const bot = new Telegraf(botToken);
let db;

// Global error handler to avoid crashes from unhandled errors
bot.catch((err, ctx) => {
  console.error("Update error", err);
  try {
    ctx.reply("⚠️ Something went wrong. Please try again.");
  } catch {}
});

// Start with buttons
bot.start((ctx) => {
  ctx.reply(
    "🚀 Welcome to EchoVault!\nChoose an option below:",
    Markup.inlineKeyboard([
      [Markup.button.callback("📊 Portfolio", "portfolio")],
      [Markup.button.callback("👛 Wallet", "wallet")],
      [Markup.button.callback("🏆 Leaderboard", "leaderboard")],
    ])
  );
});

// Deposit button removed per updated UX

// Portfolio button → fetch balance
bot.action("portfolio", async (ctx) => {
  try {
    ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const user = await db.get("SELECT * FROM users WHERE telegram_id = ?", [
      telegramId,
    ]);

    if (!user) {
      await ctx.reply("⚠️ You don’t have a wallet yet. Press Deposit first.");
      return;
    }

    await ctx.reply(
      `📊 Your portfolio:\n- Balance: ${user.balance} APT\n- PnL: ${user.pnl}%`
    );
  } catch (e) {
    console.error("portfolio handler failed:", e);
    try {
      await ctx.reply("⚠️ Unable to fetch portfolio right now.");
    } catch {}
  }
});

// Leaderboard button → top users
bot.action("leaderboard", async (ctx) => {
  try {
    ctx.answerCbQuery();
    const users = await db.all("SELECT * FROM users ORDER BY pnl DESC LIMIT 5");

    let message = "🏆 Leaderboard:\n";
    users.forEach((u, i) => {
      message += `${i + 1}. User${u.id} → ${u.pnl}%\n`;
    });

    await ctx.reply(message);
  } catch (e) {
    console.error("leaderboard handler failed:", e);
    try {
      await ctx.reply("⚠️ Unable to fetch leaderboard right now.");
    } catch {}
  }
});

// Wallet button → show wallet submenu with available wallet, generate, close
bot.action("wallet", async (ctx) => {
  try {
    ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const wallets = await listWallets(db, telegramId);

    const rows = [];
    for (const w of wallets) {
      let balance = "…";
      try {
        balance = `${(await getBalance(w.address)).toFixed(4)} APT`;
      } catch {}
      const label = `${w.is_default ? "⭐ " : ""}${formatAddressShort(
        w.address
      )} — ${balance}`;
      rows.push([Markup.button.callback(label, `wallet_view_${w.id}`)]);
    }

    rows.push([
      Markup.button.callback("➕ Generate New Wallet", "wallet_generate_multi"),
    ]);
    rows.push([Markup.button.callback("⬅️ Close", "wallet_close")]);

    const keyboard = Markup.inlineKeyboard(rows);

    try {
      await ctx.editMessageText("Wallets", keyboard);
    } catch {
      await ctx.reply("Wallets", keyboard);
    }
  } catch (e) {
    console.error("wallet handler failed:", e);
    try {
      await ctx.reply("⚠️ Unable to process wallet request right now.");
    } catch {}
  }
});

// View current wallet details with live balance
bot.action(/wallet_view_(\d+)/, async (ctx) => {
  try {
    ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const walletId = ctx.match[1];
    const wallet = await db.get(
      "SELECT * FROM wallets WHERE telegram_id = ? AND id = ?",
      [telegramId, walletId]
    );
    if (!wallet) {
      await ctx.reply("Wallet not found.");
      return;
    }
    const balanceApt = await getBalance(wallet.address);
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("🗑️ Delete", `wallet_delete_${wallet.id}`)],
      [Markup.button.callback("⬅️ Back", "wallet")],
    ]);
    await ctx.reply(
      `👛 Wallet\nAddress: ${wallet.address}\nBalance: ${balanceApt.toFixed(
        6
      )} APT`,
      keyboard
    );
  } catch (e) {
    console.error("wallet_view failed:", e);
    try {
      await ctx.reply("⚠️ Unable to display wallet right now.");
    } catch {}
  }
});

// Generate a new wallet, persist in DB, and show address + private key
bot.action("wallet_generate", async (ctx) => {
  try {
    ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const { address, privateKey } = await generateNewWalletForUser(
      db,
      telegramId
    );
    await ctx.reply(
      `✅ New wallet generated\nAddress: ${address}\nPrivate Key: ${privateKey}\n\nStore your private key securely.`
    );
  } catch (e) {
    console.error("wallet_generate failed:", e);
    try {
      await ctx.reply("⚠️ Failed to generate wallet.");
    } catch {}
  }
});

// Multi-wallet: generate and list
bot.action("wallet_generate_multi", async (ctx) => {
  try {
    ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const { address, privateKey } = await createNewWallet(
      db,
      telegramId,
      false
    );
    await ctx.reply(
      `✅ New wallet generated\nAddress: ${address}\nPrivate Key: ${privateKey}`
    );
    // refresh list
    await bot.telegram.emit("callback_query", { data: "wallet" });
  } catch (e) {
    console.error("wallet_generate_multi failed:", e);
  }
});

// Delete the current wallet
bot.action("wallet_delete", async (ctx) => {
  try {
    ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const user = await db.get("SELECT * FROM users WHERE telegram_id = ?", [
      telegramId,
    ]);
    if (!user || !user.wallet_address) {
      await ctx.reply("No wallet to delete.");
      return;
    }
    await deleteWalletForUser(db, telegramId);
    await ctx.reply(
      "🗑️ Wallet deleted. You can generate a new one from Wallet Center."
    );
  } catch (e) {
    console.error("wallet_delete failed:", e);
    try {
      await ctx.reply("⚠️ Failed to delete wallet.");
    } catch {}
  }
});

// Multi-wallet delete by id
bot.action(/wallet_delete_(\d+)/, async (ctx) => {
  try {
    ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const walletId = ctx.match[1];
    await deleteWalletById(db, telegramId, walletId);
    await ctx.reply("🗑️ Wallet deleted.");
  } catch (e) {
    console.error("wallet_delete_by_id failed:", e);
  }
});

// Close wallet section and go back to main menu
bot.action("wallet_close", async (ctx) => {
  try {
    ctx.answerCbQuery();
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("📊 Portfolio", "portfolio")],
      [Markup.button.callback("👛 Wallet", "wallet")],
      [Markup.button.callback("🏆 Leaderboard", "leaderboard")],
    ]);
    try {
      await ctx.editMessageText("Back to main menu", keyboard);
    } catch {
      await ctx.reply("Back to main menu", keyboard);
    }
  } catch (e) {
    console.error("wallet_close failed:", e);
  }
});

// Initialize DB then launch bot to avoid race conditions
(async () => {
  try {
    db = await initDB();
    await bot.launch();
    console.log("Bot running...");
  } catch (err) {
    console.error("Failed to initialize:", err);
    process.exit(1);
  }
})();
