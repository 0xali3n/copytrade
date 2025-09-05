import "dotenv/config";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";
import QRCode from "qrcode";
import { pool } from "./db.js";

const aptos = new Aptos(
  new AptosConfig({
    network: Network.MAINNET,
    fullnode: process.env.APTOS_RPC_URL,
  })
);

export const isValidHexAddress = (a) => /^0x[0-9a-fA-F]+$/.test(a);
export const short = (a) => `${a.slice(0, 8)}…${a.slice(-4)}`;

export async function ensureUser(telegramUser) {
  const telegramId = String(telegramUser.id ?? telegramUser);
  const username = telegramUser.username || null;
  const firstName = telegramUser.first_name || null;
  const lastName = telegramUser.last_name || null;
  const languageCode = telegramUser.language_code || null;
  await pool.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name, language_code, last_active)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (telegram_id)
     DO UPDATE SET username=EXCLUDED.username,
                   first_name=EXCLUDED.first_name,
                   last_name=EXCLUDED.last_name,
                   language_code=EXCLUDED.language_code,
                   last_active=NOW()`,
    [telegramId, username, firstName, lastName, languageCode]
  );
}

export async function getBalance(address) {
  const octas = await aptos.getAccountAPTAmount({ accountAddress: address });
  return Number(octas) / 1e8; // 1 APT = 1e8 octas
}

export async function listWallets(telegramId) {
  const { rows } = await pool.query(
    `SELECT id, address, private_key, is_default
       FROM wallets
      WHERE telegram_id=$1 AND is_deleted=false
      ORDER BY id DESC`,
    [String(telegramId)]
  );
  return rows;
}

export async function getWalletById(telegramId, walletId) {
  const { rows } = await pool.query(
    `SELECT id, address, private_key, is_default
       FROM wallets
      WHERE telegram_id=$1 AND id=$2 AND is_deleted=false
      LIMIT 1`,
    [String(telegramId), walletId]
  );
  return rows[0] || null;
}

export async function createNewWallet(telegramId, setDefault = true) {
  const acct = Account.generate();
  const address = acct.accountAddress.toString();
  const privateKey = acct.privateKey.toString();

  if (setDefault) {
    await pool.query(
      "UPDATE wallets SET is_default=false WHERE telegram_id=$1",
      [String(telegramId)]
    );
  }

  const { rows } = await pool.query(
    `INSERT INTO wallets (telegram_id, address, private_key, is_default)
     VALUES ($1,$2,$3,$4)
     RETURNING id`,
    [String(telegramId), address, privateKey, !!setDefault]
  );

  return { id: rows[0]?.id, address, privateKey };
}

export async function setDefaultWallet(telegramId, walletId) {
  await pool.query("UPDATE wallets SET is_default=false WHERE telegram_id=$1", [
    String(telegramId),
  ]);
  await pool.query(
    "UPDATE wallets SET is_default=true WHERE telegram_id=$1 AND id=$2 AND is_deleted=false",
    [String(telegramId), walletId]
  );
}

export async function softDeleteWallet(telegramId, walletId) {
  await pool.query(
    "UPDATE wallets SET is_deleted=true WHERE telegram_id=$1 AND id=$2",
    [String(telegramId), walletId]
  );
}

export async function getAddressQRCodeBuffer(address) {
  const dataUrl = await QRCode.toDataURL(address, { margin: 1, scale: 6 });
  const base64 = dataUrl.split(",")[1];
  return Buffer.from(base64, "base64");
}

export function getExplorerAddressUrl(address) {
  // Default to Aptos Labs explorer; can be customized via env
  const base =
    process.env.APTOS_EXPLORER_BASE_URL || "https://explorer.aptoslabs.com";
  const networkSlug = "mainnet"; // We use Network.MAINNET above
  return `${base}/account/${address}?network=${networkSlug}`;
}
