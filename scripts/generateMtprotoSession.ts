/**
 * Standalone interactive CLI script to generate TELEGRAM_MT_PROTO_SESSION.
 *
 * Usage:
 *   npx tsx scripts/generateMtprotoSession.ts
 *
 * This script runs locally in your terminal and interacts directly with Telegram MTProto
 * to authenticate your account and output the session string to be added to Render env variables.
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer.trim()));
  });
};

async function main() {
  console.log('================================================================');
  console.log(' Telegram MTProto Session Generator for MissRoxie /all');
  console.log('================================================================\n');

  let apiIdStr = process.env.TELEGRAM_API_ID;
  let apiHash = process.env.TELEGRAM_API_HASH;

  if (!apiIdStr || !apiHash) {
    console.log('Get your API ID and API HASH from https://my.telegram.org -> API development tools.\n');
    apiIdStr = await question('Enter TELEGRAM_API_ID: ');
    apiHash = await question('Enter TELEGRAM_API_HASH: ');
  }

  const apiId = parseInt(apiIdStr, 10);
  if (isNaN(apiId)) {
    console.error('❌ Error: TELEGRAM_API_ID must be a valid integer.');
    rl.close();
    process.exit(1);
  }

  console.log('\n[MTProto] Initializing client session...');
  const stringSession = new StringSession('');
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5
  });

  try {
    await client.start({
      phoneNumber: async () => await question('\nEnter your Telegram phone number (with country code, e.g. +1234567890): '),
      password: async () => await question('\nEnter your 2FA password (if enabled): '),
      phoneCode: async () => await question('\nEnter the verification code sent to your Telegram app: '),
      onError: (err) => console.error('[MTProto Error]', err.message)
    });

    console.log('\n✅ Successfully authenticated with Telegram MTProto!');
    const me = await client.getMe();
    console.log(`👤 Connected as: ${(me as any).firstName || ''} ${(me as any).lastName || ''} (@${(me as any).username || 'no_username'})`);

    const savedSession = client.session.save() as unknown as string;

    console.log('\n================================================================');
    console.log(' COPY YOUR MTProto SESSION STRING (Do NOT share this with anyone):');
    console.log('================================================================\n');
    console.log(savedSession);
    console.log('\n================================================================');
    console.log(' Add the following environment variables to your Render service:');
    console.log('================================================================');
    console.log(`TELEGRAM_API_ID=${apiId}`);
    console.log(`TELEGRAM_API_HASH=${apiHash}`);
    console.log(`TELEGRAM_MT_PROTO_SESSION=${savedSession}`);
    console.log('================================================================\n');

    await client.disconnect();
  } catch (err: any) {
    console.error('\n❌ Authentication failed:', err.message);
  } finally {
    rl.close();
  }
}

main();
