import { Markup } from "telegraf";
import {
  ensureUser,
  listWallets,
  getBalance,
  getAddressQRCodeBuffer,
} from "../wallet.js";

// Render welcome screen
export async function renderWelcome(ctx) {
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
export async function renderWallets(ctx) {
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

    // Add wallet buttons in single column with balance display
    for (const wallet of walletsWithBalances) {
      const star = wallet.is_default ? "⭐ " : "";
      const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(
        -4
      )}`;
      const balance = wallet.balance.toFixed(3);
      const buttonText = `${star}${shortAddr} — ${balance} APT`;
      buttons.push([
        Markup.button.callback(buttonText, `wallet_view_${wallet.id}`),
      ]);
    }

    // Add action buttons
    buttons.push([Markup.button.callback("➕ Create Wallet", "create_wallet")]);
    buttons.push([Markup.button.callback("⬅️ Back", "start")]);

    await ctx.reply(text, {
      parse_mode: "HTML",
      ...Markup.inlineKeyboard(buttons),
    });
  } catch (e) {
    console.error("renderWallets failed:", e);
    await ctx.reply("❌ Failed to load wallets.");
  }
}
