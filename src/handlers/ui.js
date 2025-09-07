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
      `🏦 <b>EchoVault</b> - Professional Aptos Wallet Manager\n\n` +
        `👋 Welcome back, <b>${name}</b>!\n\n` +
        `🔐 <b>Secure • Fast • Professional</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `✨ <b>Core Features:</b>\n` +
        `• 🏦 Multi-wallet management\n` +
        `• 📊 Real-time portfolio tracking\n` +
        `• 🚀 Advanced copy trading\n` +
        `• 💸 Optimized gas transfers\n` +
        `• 📱 Professional UI/UX\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🎯 <b>Quick Actions:</b>`,
      {
        parse_mode: "HTML",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("🏦 My Wallets", "wallets"),
            Markup.button.callback("📊 Portfolio", "portfolio"),
          ],
          [
            Markup.button.callback("🚀 Copy Trading", "start_copy_trading"),
            Markup.button.callback("🏆 Leaderboard", "leaderboard"),
          ],
          [Markup.button.callback("⚙️ Menu", "main_menu")],
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
        `🏦 <b>EchoVault - Wallet Management</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📭 <b>No Wallets Found</b>\n\n` +
          `Create your first secure Aptos wallet to get started with professional wallet management.\n\n` +
          `🔐 <b>Features:</b>\n` +
          `• Secure key generation\n` +
          `• QR code access\n` +
          `• Multi-wallet support\n` +
          `• Real-time balances\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        {
          parse_mode: "HTML",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("➕ Create New Wallet", "create_wallet")],
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

    let text = `🏦 <b>EchoVault - Wallet Management</b>\n\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `💰 <b>Total Portfolio Value:</b> <b>${totalBalance.toFixed(
      6
    )} APT</b>\n`;
    text += `📊 <b>Active Wallets:</b> ${wallets.length}\n\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Create a cleaner button layout
    const buttons = [];

    // Add wallet buttons in single column with balance display
    for (const wallet of walletsWithBalances) {
      const star = wallet.is_default ? "⭐ " : "";
      const shortAddr = `${wallet.address.slice(0, 8)}...${wallet.address.slice(
        -6
      )}`;
      const balance = wallet.balance.toFixed(4);
      const buttonText = `${star}${shortAddr} • ${balance} APT`;
      buttons.push([
        Markup.button.callback(buttonText, `wallet_view_${wallet.id}`),
      ]);
    }

    // Add action buttons in a more professional layout
    buttons.push([
      Markup.button.callback("➕ Create Wallet", "create_wallet"),
      Markup.button.callback("📊 Portfolio", "portfolio"),
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
