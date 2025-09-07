import { setupCommands } from "./commands.js";
import { setupMenuActions } from "./menu.js";
import { setupWalletActions } from "./wallet.js";
import { setupTransferActions } from "./transfer.js";
import { setupCopyTradeActions } from "./copytrade.js";

export function setupAllHandlers(bot) {
  setupCommands(bot);
  setupMenuActions(bot);
  setupWalletActions(bot);
  setupCopyTradeActions(bot); // Add copy trading before transfer to handle text input first
  setupTransferActions(bot);
}
