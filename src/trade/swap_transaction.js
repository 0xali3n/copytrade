import { SDK } from "@pontem/liquidswap-sdk";
import { AptosAccount, CoinClient, HexString } from "aptos";
import {
  NODE_URL,
  TokensMapping,
  MODULES_ACCOUNT,
  RESOURCE_ACCOUNT,
  NETWORKS_MAPPING,
} from "./common.js";

// /**
//  * Swap tokens on Aptos using Pontem Liquidswap
//  * @param {string} privateKeyHex - Wallet private key in hex
//  * @param {string} fromToken - Token to swap from (e.g., TokensMapping.APTOS)
//  * @param {string} toToken - Token to swap to (e.g., TokensMapping.USDT)
//  * @param {number} amount - Amount in smallest unit (e.g., 0.1 APTOS = 10000000)
//  */
async function swapTokens(privateKeyHex, fromToken, toToken, amount) {
  // setup SDK
  const sdk = new SDK({
    nodeUrl: NODE_URL,
    networkOptions: {
      resourceAccount: RESOURCE_ACCOUNT,
      moduleAccount: MODULES_ACCOUNT,
      modules: {
        Scripts: `${MODULES_ACCOUNT}::scripts_v2`,
        CoinInfo: "0x1::coin::CoinInfo",
        CoinStore: "0x1::coin::CoinStore",
      },
    },
  });

  const client = sdk.client;
  const coinClient = new CoinClient(client);
  const alice = new AptosAccount(
    HexString.ensure(privateKeyHex).toUint8Array()
  );

  try {
    // Register the "toToken" if not registered
    const coinRegisterPayload = {
      type: "entry_function_payload",
      function: "0x1::managed_coin::register",
      type_arguments: [toToken],
      arguments: [],
    };

    const rawTxn = await client.generateTransaction(
      alice.address(),
      coinRegisterPayload
    );
    const bcsTxn = await client.signTransaction(alice, rawTxn);
    const { hash } = await client.submitTransaction(bcsTxn);
    await client.waitForTransaction(hash);

    console.log(`Coin ${toToken} successfully registered to Alice account`);
    console.log(
      `Check on explorer: https://explorer.aptoslabs.com/txn/${hash}?network=${NETWORKS_MAPPING.MAINNET}`
    );
  } catch (e) {
    console.log(
      "Coin register error (may already be registered): ",
      e.message || e
    );
  }

  try {
    // Get swap rate
    const rate = await sdk.Swap.calculateRates({
      fromToken: fromToken,
      toToken: toToken,
      amount: amount,
      curveType: "uncorrelated",
      interactiveToken: "from",
    });

    console.log(`Estimated ${toToken} for ${amount} of ${fromToken}:`, rate);

    // Create swap transaction payload
    const swapTransactionPayload = await sdk.Swap.createSwapTransactionPayload({
      fromToken: fromToken,
      toToken: toToken,
      fromAmount: amount,
      toAmount: Number(rate),
      interactiveToken: "from",
      slippage: 0.005,
      stableSwapType: "normal",
      curveType: "uncorrelated",
    });

    const rawSwapTxn = await client.generateTransaction(
      alice.address(),
      swapTransactionPayload
    );
    const bcsSwapTxn = await client.signTransaction(alice, rawSwapTxn);
    const { hash } = await client.submitTransaction(bcsSwapTxn);
    await client.waitForTransaction(hash);

    console.log(`Swap transaction submitted!`);
    console.log(
      `Check on explorer: https://explorer.aptoslabs.com/txn/${hash}?network=${NETWORKS_MAPPING.MAINNET}`
    );
    console.log(
      "---------------------------------------------------------------------------"
    );
  } catch (e) {
    console.log("Swap error: ", e.message || e);
  }
}

export { swapTokens };
