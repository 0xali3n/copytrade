import "dotenv/config";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";
import QRCode from "qrcode";

// Aptos client configured via env for hackathon flexibility
const rpcUrl = process.env.APTOS_RPC_URL;
const config = new AptosConfig({ network: Network.MAINNET, fullnode: rpcUrl });
const aptos = new Aptos(config);

// Basic validation for on-chain hex address format (0x-prefixed hex)
export function isValidHexAddress(address) {
  if (typeof address !== "string") return false;
  if (!address.startsWith("0x")) return false;
  const hex = address.slice(2);
  if (hex.length === 0 || hex.length > 64) return false;
  return /^[0-9a-fA-F]+$/.test(hex);
}

export function formatAddressShort(address) {
  if (!isValidHexAddress(address)) return "Unknown";
  const hex = address.toString();
  const start = hex.slice(0, 8);
  const end = hex.slice(-4);
  return `${start}…${end}`;
}

// Create a new Aptos account for a user and persist it if they don't have one
export async function createWalletForUser(db, telegramId) {
  // Check if user exists and has a wallet
  const user = await db.get("SELECT * FROM users WHERE telegram_id = ?", [
    String(telegramId),
  ]);
  if (user && user.wallet_address && isValidHexAddress(user.wallet_address)) {
    return { address: user.wallet_address, privateKey: user.private_key };
  }

  // Generate a new account (Ed25519 keypair)
  const account = Account.generate();
  const address = account.accountAddress.toString();
  const privateKey = account.privateKey.toString();

  // If user row exists, update; otherwise insert
  if (user) {
    await db.run(
      "UPDATE users SET wallet_address = ?, private_key = ? WHERE telegram_id = ?",
      [address, privateKey, String(telegramId)]
    );
  } else {
    await db.run(
      "INSERT INTO users (telegram_id, wallet_address, private_key) VALUES (?, ?, ?)",
      [String(telegramId), address, privateKey]
    );
  }

  return { address, privateKey };
}

// Force-generate a new wallet for a user and persist it (overwrites existing)
export async function generateNewWalletForUser(db, telegramId) {
  const account = Account.generate();
  const address = account.accountAddress.toString();
  const privateKey = account.privateKey.toString();

  const user = await db.get("SELECT * FROM users WHERE telegram_id = ?", [
    String(telegramId),
  ]);

  if (user) {
    await db.run(
      "UPDATE users SET wallet_address = ?, private_key = ? WHERE telegram_id = ?",
      [address, privateKey, String(telegramId)]
    );
  } else {
    await db.run(
      "INSERT INTO users (telegram_id, wallet_address, private_key) VALUES (?, ?, ?)",
      [String(telegramId), address, privateKey]
    );
  }

  return { address, privateKey };
}

// Get current APT balance (APT) from mainnet
export async function getBalance(address) {
  // Returns amount in octas (1 APT = 1e8 octas)
  if (!isValidHexAddress(address)) {
    throw new Error("Invalid address format; expected 0x-prefixed hex address");
  }
  const octas = await aptos.getAccountAPTAmount({ accountAddress: address });
  const apt = Number(octas) / 1e8;
  return apt;
}

// Delete the user's wallet (clear address and private key)
// Legacy single-wallet delete kept removed to avoid confusion; prefer per-id functions

// Multi-wallet: list wallets for a user
export async function listWallets(db, telegramId) {
  // Keep stable ordering; do not sort default to top
  return db.all(
    "SELECT id, address, private_key, is_default FROM wallets WHERE telegram_id = ? ORDER BY id DESC",
    [String(telegramId)]
  );
}

// Multi-wallet: create and persist a new wallet row; optionally set default
export async function createNewWallet(db, telegramId, setDefault = false) {
  const account = Account.generate();
  const address = account.accountAddress.toString();
  const privateKey = account.privateKey.toString();
  await db.run(
    "INSERT INTO wallets (telegram_id, address, private_key, is_default) VALUES (?, ?, ?, ?)",
    [String(telegramId), address, privateKey, setDefault ? 1 : 0]
  );
  return { address, privateKey };
}

// Multi-wallet: delete a wallet by id (only for this user)
export async function deleteWalletById(db, telegramId, walletId) {
  await db.run("DELETE FROM wallets WHERE telegram_id = ? AND id = ?", [
    String(telegramId),
    walletId,
  ]);
}

// Multi-wallet: set a wallet as default for a user
export async function setDefaultWallet(db, telegramId, walletId) {
  await db.run("UPDATE wallets SET is_default = 0 WHERE telegram_id = ?", [
    String(telegramId),
  ]);
  await db.run(
    "UPDATE wallets SET is_default = 1 WHERE telegram_id = ? AND id = ?",
    [String(telegramId), walletId]
  );
}

// Generate a QR code PNG as a data URL for a given address
export async function getAddressQRCodeDataUrl(address) {
  const text = address;
  return QRCode.toDataURL(text, { margin: 1, scale: 4 });
}
