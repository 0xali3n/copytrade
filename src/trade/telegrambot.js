import axios from "axios";
import { swapTokens } from "./swap_transaction.js";

// Aptos REST API
const APTOS_API = "https://fullnode.mainnet.aptoslabs.com/v1";

// Store last seen transaction version per master
const lastSeen = {};

/**
 * Start monitoring a master wallet for new transactions
 */
async function startCopyTrading(masterWallet, followerWallets = []) {
  console.log(`🚀 Starting copy trading for master: ${masterWallet}`);
  const url = `${APTOS_API}/accounts/${masterWallet}/transactions?limit=1`;
  const { data } = await axios.get(url);

  if (!data || data.length === 0) return;

  let latestTx = data[data.length - 1];
  let txVersion = latestTx.version;

  lastSeen[masterWallet] = txVersion;
  // Run loop every second
  setInterval(async () => {
    try {
      // Skip if we’ve already seen this tx
      // console.log(`🚀 Starting copy trading for master: ${masterWallet}`);
      const { data } = await axios.get(url);

      if (!data || data.length === 0) return;

      latestTx = data[data.length - 1];
      txVersion = latestTx.version;

      if (lastSeen[masterWallet] === txVersion) return;

      if (!latestTx.payload.function.toLowerCase().includes("swap")) {
        return; // Not a swap transaction
      }

      // Update last seen
      lastSeen[masterWallet] = txVersion;

      console.log(
        `🔎 New transaction detected for ${masterWallet}: version ${txVersion}`
      );

      // Show transaction details
      // console.log("Payload:", latestTx.payload);

      const func = latestTx.payload.function;
      const typeArgs = latestTx.payload.type_arguments || [];
      const args = latestTx.payload.arguments || [];

      // Input & output coins
      let coininput = typeArgs[0].split("::");
      const inputCoin = coininput[coininput.length - 1];
      let coinoutput = typeArgs[1].split("::");
      const outputCoin = coinoutput[coinoutput.length - 1];
      const amountSpentInInputCoin = args[0];
      const minOut = 0.95 * args[1];

      const inputDecimals = await getCoinDecimals(typeArgs[0]);
      const inputAmount = amountSpentInInputCoin / Math.pow(10, inputDecimals);

      console.log(
        inputCoin,
        outputCoin,
        amountSpentInInputCoin,
        inputDecimals,
        inputAmount,
        minOut
      );

      const privateKey =
        "0xc5ac00b4974362883d6073e45eb913ac2e36e0f5884e5732a4e6dedaeb4c8a35";
      swapTokens(privateKey, typeArgs[0], typeArgs[1], amountSpentInInputCoin);
    } catch (err) {
      console.error("❌ Error fetching transactions:", err.message);
    }
  }, 3000); // every 1s
}

async function getCoinDecimals(coinType) {
  try {
    const url = `${APTOS_API}/accounts/${
      coinType.split("::")[0]
    }/resource/0x1::coin::CoinInfo<${coinType}>`;
    const { data } = await axios.get(url);
    return data.data.decimals;
  } catch (err) {
    console.error(`❌ Failed to fetch decimals for ${coinType}:`, err.message);
    return null; // fallback if not found
  }
}

export { startCopyTrading, getCoinDecimals };
