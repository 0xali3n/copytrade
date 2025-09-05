import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import { initDB } from "./db.js";
import {
  ensureUser,
  listWallets,
  createNewWallet,
  setDefaultWallet,
  softDeleteWallet,
  getBalance,
  short,
  getWalletById,
  getAddressQRCodeBuffer,
  getExplorerAddressUrl,
} from "./wallet.js";

const bot = new Telegraf(process.env.BOT_TOKEN);

// graceful error catcher
bot.catch((err, ctx) => {
  console.error("Bot error:", err);
  try {
    ctx.reply("⚠️ Something went wrong. Please try again.");
  } catch {}
});

async function renderWelcome(ctx) {
  const name = ctx.from?.first_name ? `, ${ctx.from.first_name}` : "";
  return ctx.reply(
    `🚀 Welcome${name} to EchoVault!\n\nSecurely manage Aptos wallets, view balances, and soon copy-trade top wallets.`,
    {
      ...Markup.inlineKeyboard([
        [Markup.button.callback("👛 Open Wallets", "wallets")],
        [Markup.button.callback("📊 Portfolio", "portfolio")],
      ]),
    }
  );
}

bot.start(async (ctx) => {
  await ensureUser(ctx.from);
  await renderWelcome(ctx);
});

// Simple /wallets command entrypoint (no persistent main menu)
bot.command("wallets", async (ctx) => {
  await ensureUser(ctx.from);
  await renderWallets(ctx, false);
});

// Set Telegram command menu (blue menu button)
(async () => {
  try {
    await bot.telegram.setMyCommands([
      { command: "start", description: "Open welcome" },
      { command: "wallets", description: "Manage wallets" },
    ]);
  } catch (e) {
    console.error("setMyCommands failed", e);
  }
})();

// Wallets menu
bot.action("wallets", async (ctx) => {
  await renderWallets(ctx, true);
});

// Back action: keep chat flow; just render wallets below
bot.action("wallets_back", async (ctx) => {
  try {
    ctx.answerCbQuery();
  } catch {}
  await renderWallets(ctx, false);
});

async function renderWallets(ctx, fromCallback) {
  try {
    const wallets = await listWallets(ctx.from.id);
    if (fromCallback) ctx.answerCbQuery();

    if (wallets.length === 0) {
      const text = "❌ No wallets yet. Create one:";
      const kb = Markup.inlineKeyboard([
        [Markup.button.callback("➕ Create Wallet", "wallet_create")],
        [Markup.button.callback("⬅️ Back", "welcome_back")],
      ]);
      return ctx.reply(text, kb);
    }

    let text = "👛 <b>Your Wallets</b>";
    const rows = [];
    const balances = await Promise.all(
      wallets.map((w) => getBalance(w.address).catch(() => 0))
    );
    for (let i = 0; i < wallets.length; i++) {
      const w = wallets[i];
      const bal = balances[i] || 0;
      const label = `${w.is_default ? "⭐ " : ""}${short(
        w.address
      )} — ${bal.toFixed(3)} APT`;
      rows.push([Markup.button.callback(label, `wallet_view_${w.id}`)]);
    }
    rows.push([Markup.button.callback("➕ Create Wallet", "wallet_create")]);
    rows.push([Markup.button.callback("⬅️ Back", "welcome_back")]);

    const payload = { parse_mode: "HTML", ...Markup.inlineKeyboard(rows) };
    return ctx.reply(text, payload);
  } catch (e) {
    console.error("wallets action failed:", e);
    try {
      await ctx.reply("⚠️ Unable to load wallets.");
    } catch {}
  }
}

// Create wallet
bot.action("wallet_create", async (ctx) => {
  try {
    ctx.answerCbQuery();
    const { id, address, privateKey } = await createNewWallet(
      ctx.from.id,
      true
    );
    // Send single QR/photo message with details (no extra text message)
    const png = await getAddressQRCodeBuffer(address);
    await ctx.replyWithPhoto(
      { source: png },
      {
        caption:
          `👛 <b>New Wallet</b> ⭐ (default)\n\n` +
          `Address: <code>${address}</code>\n\n` +
          `⚠️ Save your private key (shown once):\n<code>${privateKey}</code>`,
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("⭐ Set Default", `wallet_default_${id}`)],
          [Markup.button.callback("🗑️ Delete", `wallet_delete_confirm_${id}`)],
          [Markup.button.callback("🔐 Show Private Key", `wallet_pk_${id}`)],
          [Markup.button.callback("⬅️ Back", "wallets_back")],
        ]),
      }
    );
  } catch (e) {
    console.error("wallet_create failed:", e);
    try {
      await ctx.reply("⚠️ Failed to create wallet.");
    } catch {}
  }
});

// Set default
bot.action(/wallet_default_(\d+)/, async (ctx) => {
  try {
    ctx.answerCbQuery();
    const id = ctx.match[1];
    await setDefaultWallet(ctx.from.id, id);
    // Refresh current view if present
    try {
      await ctx.editMessageReplyMarkup();
    } catch {}
    await ctx.reply("⭐ Default wallet updated.");
  } catch (e) {
    console.error("wallet_default failed:", e);
  }
});

// Delete (soft)
bot.action(/wallet_delete_(\d+)/, async (ctx) => {
  try {
    ctx.answerCbQuery();
    const id = ctx.match[1];
    await softDeleteWallet(ctx.from.id, id);
    await ctx.reply("🗑️ Wallet deleted.");
  } catch (e) {
    console.error("wallet_delete failed:", e);
  }
});

// Delete confirm flow
bot.action(/wallet_delete_confirm_(\d+)/, async (ctx) => {
  try {
    ctx.answerCbQuery();
    const id = ctx.match[1];
    await ctx.editMessageReplyMarkup(
      Markup.inlineKeyboard([
        [Markup.button.callback("✅ Yes, delete", `wallet_delete_${id}`)],
        [Markup.button.callback("❌ Cancel", `wallet_view_${id}`)],
      ])
    );
  } catch (e) {
    console.error("wallet_delete_confirm failed:", e);
  }
});

// Show private key (warning)
bot.action(/wallet_pk_(\d+)/, async (ctx) => {
  try {
    ctx.answerCbQuery();
    const id = ctx.match[1];
    const wallet = await getWalletById(ctx.from.id, id);
    if (!wallet) return ctx.reply("❌ Wallet not found.");
    await ctx.reply(
      `⚠️ <b>Private Key</b> (do not share):\n<code>${wallet.private_key}</code>`,
      { parse_mode: "HTML" }
    );
  } catch (e) {
    console.error("wallet_pk failed:", e);
  }
});

// Welcome back action from sections
bot.action("welcome_back", async (ctx) => {
  try {
    ctx.answerCbQuery();
  } catch {}
  await renderWelcome(ctx);
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
      `Address: <code>${wallet.address}</code>\n` +
      `Balance: ${bal.toFixed(4)} APT`;

    const png = await getAddressQRCodeBuffer(wallet.address);

    await ctx.editMessageMedia(
      { type: "photo", media: { source: png } },
      {
        caption,
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "⭐ Set Default",
              `wallet_default_${wallet.id}`
            ),
          ],
          [
            Markup.button.callback(
              "🗑️ Delete",
              `wallet_delete_confirm_${wallet.id}`
            ),
          ],
          [
            Markup.button.callback(
              "🔐 Show Private Key",
              `wallet_pk_${wallet.id}`
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

// Show QR inline (edit message to photo with the same actions)
bot.action(/wallet_qr_(\d+)/, async (ctx) => {
  try {
    ctx.answerCbQuery();
    const id = ctx.match[1];
    const wallet = await getWalletById(ctx.from.id, id);
    if (!wallet) return ctx.reply("❌ Wallet not found.");

    const bal = await getBalance(wallet.address).catch(() => 0);
    const caption =
      `👛 <b>Wallet</b> ${wallet.is_default ? "⭐" : ""}\n\n` +
      `Address: <code>${wallet.address}</code>\n` +
      `Balance: ${bal.toFixed(4)} APT`;

    const png = await getAddressQRCodeBuffer(wallet.address);

    await ctx.editMessageMedia(
      { type: "photo", media: { source: png } },
      {
        caption,
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "📄 Show Details",
              `wallet_view_${wallet.id}`
            ),
          ],
          [Markup.button.callback("⬅️ Back", "wallets")],
        ]),
      }
    );
  } catch (e) {
    console.error("wallet_qr failed:", e);
  }
});

// Portfolio: list all wallets with balances (⭐ marks default)
bot.action("portfolio", async (ctx) => {
  try {
    ctx.answerCbQuery();
    const wallets = await listWallets(ctx.from.id);
    if (wallets.length === 0)
      return ctx.editMessageText("❌ No wallets. Create one first.");

    let text = "📊 <b>Your Portfolio</b>\n\n";
    for (const w of wallets) {
      const bal = await getBalance(w.address).catch(() => 0);
      text += `${w.is_default ? "⭐ " : ""}<code>${short(
        w.address
      )}</code> — ${bal.toFixed(3)} APT\n`;
    }
    await ctx.editMessageText(text, { parse_mode: "HTML" });
  } catch (e) {
    console.error("portfolio failed:", e);
    try {
      await ctx.reply("⚠️ Unable to load portfolio.");
    } catch {}
  }
});

// Leaderboard (mock PnL for now)
bot.action("leaderboard", async (ctx) => {
  try {
    ctx.answerCbQuery();
    // you can later replace with a real query
    await ctx.reply(
      "🏆 <b>Leaderboard</b>\n\n(Coming soon — will rank by PnL once copy-trades land)",
      { parse_mode: "HTML" }
    );
  } catch (e) {
    console.error("leaderboard failed:", e);
  }
});

// Start DB then launch bot
(async () => {
  await initDB();
  await bot.launch();
  console.log("🤖 EchoVault bot running");
})();
