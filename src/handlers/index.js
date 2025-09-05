import { setupCommands } from "./commands.js";
import { setupMenuActions } from "./menu.js";
import { setupWalletActions } from "./wallet.js";
import { setupTransferActions } from "./transfer.js";

export function setupAllHandlers(bot) {
  setupCommands(bot);
  setupMenuActions(bot);
  setupWalletActions(bot);
  setupTransferActions(bot);
}
