import { COMMAND_CATALOG } from '../server/telegram/commandCatalog.js';

console.log('Total commands in catalog:', COMMAND_CATALOG.length);
let invalidCount = 0;
for (const item of COMMAND_CATALOG) {
  const clean = item.command.replace(/^\//, '');
  if (!/^[a-z0-9_]{1,32}$/.test(clean)) {
    console.log('❌ INVALID TELEGRAM COMMAND NAME:', item.command, '->', clean);
    invalidCount++;
  }
}

if (invalidCount === 0) {
  console.log('✅ ALL', COMMAND_CATALOG.length, 'COMMANDS HAVE VALID TELEGRAM NAMES!');
}
