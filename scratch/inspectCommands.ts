import { COMMAND_CATALOG, getCatalogItem, getCatalogByCategory } from '../server/telegram/commandCatalog.js';
import { CommandHandler, TELEGRAM_SUGGESTED_COMMANDS, ADMIN_COMMANDS } from '../server/telegram/commands.js';

console.log('--- COMMAND CATALOG STATS ---');
console.log('Total Canonical Commands in Catalog:', COMMAND_CATALOG.length);

const aliasMap = new Map();
for (const item of COMMAND_CATALOG) {
  if (item.aliases && item.aliases.length > 0) {
    aliasMap.set(item.command, item.aliases);
  }
}
const totalAliases = Array.from(aliasMap.values()).reduce((sum, arr) => sum + arr.length, 0);
console.log('Total Aliases across all commands:', totalAliases);

// Count CommandHandler methods
const proto = CommandHandler.prototype;
const handlerMethods = Object.getOwnPropertyNames(proto).filter(name =>
  typeof proto[name] === 'function' && name !== 'constructor' && (name.startsWith('handle') || name.startsWith('execute'))
);
console.log('Total Handler Methods on CommandHandler:', handlerMethods.length);
console.log('Telegram Suggested Commands:', TELEGRAM_SUGGESTED_COMMANDS.length);
console.log('Admin Commands:', ADMIN_COMMANDS.length);

console.log('\nSample Command Catalog entries:');
COMMAND_CATALOG.slice(0, 10).forEach(c => {
  console.log(`- ${c.command} [${c.category}] (aliases: ${c.aliases?.join(', ') || 'none'}): ${c.description}`);
});
