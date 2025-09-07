export const NODE_URL = "https://aptos-mainnet.pontem.network";

export const RESOURCE_ACCOUNT =
  "0x05a97986a9d031c4567e15b797be516910cfcb4156312482efc6a19c0a30c948";
export const MODULES_ACCOUNT =
  "0x190d44266241744264b964a37b8f09863167a12d3e70cda39376cfb4e3561e12";

export const TokensMapping = {
  APTOS: "0x1::aptos_coin::AptosCoin", // APTOS
  USDT: "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT", // Mainnet USDT
  USDC: "0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC", // Mainnet USDC
  DooDoo:
    "0x73eb84966be67e4697fc5ae75173ca6c35089e802650f75422ab49a8729704ec::coin::DooDoo",
  THL: "0x7fd500c11216f0fe3095d0c4b8aa4d64a4e2e04f83758462f2b127255643615::thl_coin::THL",
};

export const NETWORKS_MAPPING = {
  TESTNET: "testnet",
  DEVNET: "devnet",
  MAINNET: "mainnet",
};
