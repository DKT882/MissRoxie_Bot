import { telegramApi } from '../server/telegram/api.js';

async function checkLiveTelegram() {
  console.log('Testing live Telegram API connection...');
  try {
    const me = await telegramApi.getMe();
    console.log('Bot getMe result:', JSON.stringify(me, null, 2));

    const chatId = -1004353139683;
    const admins = await telegramApi.getChatAdministrators(chatId);
    console.log('Live Chat Admins result:', JSON.stringify(admins, null, 2));

    // Get specific chat member details
    if (me.result?.id) {
      const botMember = await telegramApi.getChatMember(chatId, me.result.id);
      console.log('Bot Chat Member status in live group:', JSON.stringify(botMember, null, 2));
    }
  } catch (err: any) {
    console.error('Live Telegram error:', err);
  }
}

checkLiveTelegram();
