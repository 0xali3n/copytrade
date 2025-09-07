const { startCopyTrading } = require("./telegrambot.js");

// Example master and followers
const masterWallet = "0x09e81dc97ffc0a3d576466872dde7ee5cd144267facb0da26d85e982f498ac93"; // replace with real address
const followerWallets = ["0xabcd...", "0xefgh..."];

startCopyTrading(masterWallet, followerWallets);

