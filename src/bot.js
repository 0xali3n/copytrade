import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import { initDB } from "./db.js";
import {
  createWalletForUser,
  getBalance,
  isValidHexAddress,
  formatAddressShort,
  listWallets,
  createNewWallet,
  deleteWalletById,
  setDefaultWallet,
  getAddressQRCodeDataUrl,
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
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("📊 Portfolio", "portfolio")],
    [Markup.button.callback("👛 Wallet", "wallet")],
    [Markup.button.callback("🏆 Leaderboard", "leaderboard")],
  ]);
  ctx.reply("🚀 <b>Welcome to EchoVault!</b>\nChoose an option below:", {
    parse_mode: "HTML",
    ...keyboard,
  });
});

// /menu command to always return to main menu
bot.command("menu", (ctx) => {
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback("📊 Portfolio", "portfolio")],
    [Markup.button.callback("👛 Wallet", "wallet")],
    [Markup.button.callback("🏆 Leaderboard", "leaderboard")],
  ]);
  ctx.reply("📋 <b>Main Menu</b>", { parse_mode: "HTML", ...keyboard });
});

// Deposit button removed per updated UX

// Portfolio button → list all wallets with live balances; default marked inline
bot.action("portfolio", async (ctx) => {
  try {
    ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const wallets = await listWallets(db, telegramId);
    if (wallets.length === 0) {
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback("👛 Open Wallets", "wallet")],
      ]);
      await ctx.reply("You don't have a wallet yet.", keyboard);
      return;
    }
    let lines = ["📊 <b>Portfolio</b>"];
    for (const w of wallets) {
      let bal = "0";
      try {
        bal = (await getBalance(w.address)).toFixed(3);
      } catch {}
      const prefix = w.is_default ? "⭐ " : "";
      lines.push(
        `${prefix}${formatAddressShort(w.address)} — <code>${bal} APT</code>`
      );
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
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
    let message = "🏆 <b>Leaderboard</b>\n";
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const wallet = await db.get(
        "SELECT address FROM wallets WHERE telegram_id = ? ORDER BY is_default DESC, id ASC LIMIT 1",
        [u.telegram_id]
      );
      const short = wallet?.address
        ? formatAddressShort(wallet.address)
        : `User${u.id}`;
      message += `${i + 1}. ${i === 0 ? "⭐ " : ""}${short} → ${u.pnl}%\n`;
    }
    await ctx.reply(message, { parse_mode: "HTML" });
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
    let qrBuffer = null;
    try {
      const qrDataUrl = await getAddressQRCodeDataUrl(wallet.address);
      qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
    } catch {}
    // QR code of the address for easy mobile transfer
    // In a future iteration, we can attach the PNG file; for now, display address prominently
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          wallet.is_default ? "⭐ Default" : "Set as default",
          `wallet_set_default_${wallet.id}`
        ),
      ],
      [Markup.button.callback("🗑️ Delete", `wallet_delete_${wallet.id}`)],
      [Markup.button.callback("⬅️ Back", "wallet")],
    ]);
    if (qrBuffer) {
      try {
        await ctx.replyWithPhoto(
          { source: qrBuffer },
          {
            caption: `👛 <b>Wallet</b>\nAddress: <code>${
              wallet.address
            }</code>\nBalance: <code>${balanceApt.toFixed(6)} APT</code>`,
            parse_mode: "HTML",
            ...keyboard,
          }
        );
        return;
      } catch {}
    }
    await ctx.reply(
      `👛 <b>Wallet</b>\nAddress: <code>${
        wallet.address
      }</code>\nBalance: <code>${balanceApt.toFixed(6)} APT</code>`,
      { parse_mode: "HTML", ...keyboard }
    );
  } catch (e) {
    console.error("wallet_view failed:", e);
    try {
      await ctx.reply("⚠️ Unable to display wallet right now.");
    } catch {}
  }
});

// Single-wallet generator removed (multi-wallet flow only)

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
    const qrDataUrl = await getAddressQRCodeDataUrl(address);
    try {
      await ctx.replyWithPhoto(
        { source: Buffer.from(qrDataUrl.split(",")[1], "base64") },
        {
          caption: `✅ <b>New wallet generated</b>\nAddress: <code>${address}</code>\nPrivate Key: <code>${privateKey}</code>\n\n<b>⚠️ Do not share this private key. Store securely.</b>`,
          parse_mode: "HTML",
        }
      );
    } catch {
      await ctx.reply(
        `✅ <b>New wallet generated</b>\nAddress: <code>${address}</code>\nPrivate Key: <code>${privateKey}</code>\n\n<b>⚠️ Do not share this private key. Store securely.</b>`,
        { parse_mode: "HTML" }
      );
    }
    // refresh list
    await bot.telegram.emit("callback_query", { data: "wallet" });
  } catch (e) {
    console.error("wallet_generate_multi failed:", e);
  }
});

// Single-wallet delete removed (per-id delete only)

// Multi-wallet delete by id
bot.action(/wallet_delete_(\d+)/, async (ctx) => {
  try {
    ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const walletId = ctx.match[1];
    await deleteWalletById(db, telegramId, walletId);
    await ctx.reply("🗑️ Wallet deleted.");
    // Optionally refresh list
    try {
      await ctx.editMessageText("Wallet deleted.");
    } catch {}
  } catch (e) {
    console.error("wallet_delete_by_id failed:", e);
  }
});

// Set default wallet (move star)
bot.action(/wallet_set_default_(\d+)/, async (ctx) => {
  try {
    ctx.answerCbQuery();
    const telegramId = String(ctx.from.id);
    const walletId = ctx.match[1];
    await setDefaultWallet(db, telegramId, walletId);
    // Refresh the list with updated star placement using edit if possible
    try {
      const wallets = await listWallets(db, telegramId);
      const rows = [];
      for (const w of wallets) {
        let balance = "…";
        try {
          balance = `${(await getBalance(w.address)).toFixed(4)} APT`;
        } catch {}
        const label = `${formatAddressShort(w.address)} — ${balance}`;
        rows.push([
          Markup.button.callback(label, `wallet_view_${w.id}`),
          Markup.button.callback(
            w.is_default ? "⭐" : "☆",
            `wallet_set_default_${w.id}`
          ),
        ]);
      }
      rows.push([
        Markup.button.callback(
          "➕ Generate New Wallet",
          "wallet_generate_multi"
        ),
      ]);
      rows.push([Markup.button.callback("⬅️ Close", "wallet_close")]);
      await ctx.editMessageText("Wallets", Markup.inlineKeyboard(rows));
    } catch {}
    const changed = await db.get("SELECT address FROM wallets WHERE id = ?", [
      walletId,
    ]);
    if (changed?.address) {
      await ctx.reply(
        `✅ ${formatAddressShort(changed.address)} set as default wallet.`
      );
    } else {
      await ctx.reply("✅ Default wallet updated.");
    }
  } catch (e) {
    console.error("wallet_set_default failed:", e);
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
