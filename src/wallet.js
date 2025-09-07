import "dotenv/config";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
  PrivateKey,
} from "@aptos-labs/ts-sdk";
import QRCode from "qrcode";
import axios from "axios";
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
  return await QRCode.toBuffer(address, {
    type: "png",
    width: 300,
    margin: 4, // Increased margin to prevent edge cutting
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}

export function getExplorerAddressUrl(address) {
  // Default to Aptos Labs explorer; can be customized via env
  const base =
    process.env.APTOS_EXPLORER_BASE_URL || "https://explorer.aptoslabs.com";
  const networkSlug = "mainnet"; // We use Network.MAINNET above
  return `${base}/account/${address}?network=${networkSlug}`;
}

export function getExplorerTxUrl(txHash) {
  const base =
    process.env.APTOS_EXPLORER_BASE_URL || "https://explorer.aptoslabs.com";
  const networkSlug = "mainnet";
  return `${base}/txn/${txHash}?network=${networkSlug}`;
}

export async function sendAPT({
  senderPrivateKey,
  recipientAddress,
  amountApt,
}) {
  const amountOctas = BigInt(Math.round(Number(amountApt) * 1e8));
  const pkStr = String(senderPrivateKey);
  const hexMatch =
    pkStr.match(/0x[0-9a-fA-F]{64}/) || pkStr.match(/([0-9a-fA-F]{64})/);
  if (!hexMatch) throw new Error("Invalid Ed25519 private key format");
  const hex = hexMatch[0].startsWith("0x") ? hexMatch[0] : `0x${hexMatch[0]}`;
  const formatted = PrivateKey.formatPrivateKey(hex, "ed25519");
  const privateKey = new Ed25519PrivateKey(formatted);
  const sender = Account.fromPrivateKey({ privateKey });

  // Build transaction with optimized gas estimates (like OKX wallet)
  const txn = await aptos.transferCoinTransaction({
    sender: sender.accountAddress.toString(),
    recipient: recipientAddress,
    amount: amountOctas,
    options: {
      gasUnitPrice: 100, // Standard gas price (0.0001 APT per gas unit)
      maxGasAmount: 2000, // Higher gas limit for transfers (should cost ~0.0002 APT)
    },
  });

  const pending = await aptos.signAndSubmitTransaction({
    signer: sender,
    transaction: txn,
  });
  await aptos.waitForTransaction({ transactionHash: pending.hash });
  return pending.hash;
}

export async function simulateTransferFee({
  senderPrivateKey,
  recipientAddress,
  amountApt,
}) {
  const amountOctas = BigInt(Math.round(Number(amountApt) * 1e8));
  const pkStr = String(senderPrivateKey);
  const hexMatch =
    pkStr.match(/0x[0-9a-fA-F]{64}/) || pkStr.match(/([0-9a-fA-F]{64})/);
  if (!hexMatch) throw new Error("Invalid Ed25519 private key format");
  const hex = hexMatch[0].startsWith("0x") ? hexMatch[0] : `0x${hexMatch[0]}`;
  const formatted = PrivateKey.formatPrivateKey(hex, "ed25519");
  const privateKey = new Ed25519PrivateKey(formatted);
  const sender = Account.fromPrivateKey({ privateKey });

  // Build and sign transaction
  // Use optimized gas estimates for fee calculation (like OKX wallet)
  const gasUsed = 2000n; // Higher gas limit for transfers
  const gasUnitPrice = 100n; // Standard gas price
  const feeOctas = gasUsed * gasUnitPrice;
  return Number(feeOctas) / 1e8;
}

export async function computeMaxSpendableAPT({
  senderPrivateKey,
  senderAddress,
}) {
  const balanceApt = await getBalance(senderAddress);
  let fee = 0.0002;
  try {
    fee = await simulateTransferFee({
      senderPrivateKey,
      recipientAddress: senderAddress,
      amountApt: 0.00000001,
    });
  } catch {}
  const max = Math.max(0, balanceApt - fee);
  return { maxApt: max, estimatedFeeApt: fee };
}

// Token definitions with their asset types and display names
export const TOKEN_TYPES = {
  "0x1::aptos_coin::AptosCoin": "APT",
  "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC":
    "USDC",
  "0x73eb84966be67e4697fc5ae75173ca6c35089e802650f75422ab49a8729704ec::coin::DooDoo":
    "DooDoo",
  "0x7fd500c11216f0fe3095d0c4b8aa4d64a4e2e04f83758462f2b127255643615::thl_coin::THL":
    "THL",
  "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT":
    "USDT",
};

// Fetch token balance for a specific address and asset type
export async function getTokenBalance(address, assetType) {
  try {
    const options = {
      method: "GET",
      url: `https://api.mainnet.aptoslabs.com/v1/accounts/${address}/balance/${encodeURIComponent(
        assetType
      )}`,
      headers: { Accept: "application/json, application/x-bcs" },
    };

    console.log(`🔍 Fetching balance for ${address} - ${assetType}`);
    const { data } = await axios.request(options);
    // The API returns the raw number directly, not an object
    const balance = Number(data) / 1e8;
    console.log(`✅ Balance found: ${balance} for ${assetType}`);
    return balance;
  } catch (error) {
    console.log(`❌ No balance found for ${assetType}:`, error.message);
    // If balance is 0 or token doesn't exist, return 0
    return 0;
  }
}

// Get all token balances for a single address
export async function getAllTokenBalances(address) {
  console.log(`🚀 Getting all token balances for address: ${address}`);
  const balances = {};

  // Fetch all token balances in parallel
  const balancePromises = Object.keys(TOKEN_TYPES).map(async (assetType) => {
    const balance = await getTokenBalance(address, assetType);
    const tokenName = TOKEN_TYPES[assetType];
    return { tokenName, balance, assetType };
  });

  const results = await Promise.all(balancePromises);
  console.log(`📊 All token results for ${address}:`, results);

  // Aggregate balances by token name
  results.forEach(({ tokenName, balance }) => {
    if (balance > 0) {
      balances[tokenName] = (balances[tokenName] || 0) + balance;
    }
  });

  console.log(`💰 Final balances for ${address}:`, balances);
  return balances;
}

// Get individual wallet with all its token balances
export async function getWalletWithBalances(telegramId, walletId) {
  const wallet = await getWalletById(telegramId, walletId);
  if (!wallet) return null;

  const tokenBalances = await getAllTokenBalances(wallet.address);

  return {
    ...wallet,
    tokenBalances,
    totalTokens: Object.keys(tokenBalances).length,
  };
}

// Get portfolio summary across all wallets for a user
export async function getPortfolioSummary(telegramId) {
  const wallets = await listWallets(telegramId);
  if (!wallets.length) {
    return { totalValue: 0, tokens: {}, wallets: [] };
  }

  // Get all token balances for all wallets in parallel
  const walletBalancePromises = wallets.map(async (wallet) => {
    const tokenBalances = await getAllTokenBalances(wallet.address);
    return {
      ...wallet,
      tokenBalances,
      totalTokens: Object.keys(tokenBalances).length,
    };
  });

  const walletsWithBalances = await Promise.all(walletBalancePromises);

  // Aggregate balances across all wallets
  const totalBalances = {};
  walletsWithBalances.forEach((wallet) => {
    Object.entries(wallet.tokenBalances).forEach(([tokenName, balance]) => {
      totalBalances[tokenName] = (totalBalances[tokenName] || 0) + balance;
    });
  });

  return {
    totalValue: Object.values(totalBalances).reduce(
      (sum, balance) => sum + balance,
      0
    ),
    tokens: totalBalances,
    walletCount: wallets.length,
    wallets: walletsWithBalances,
  };
}
