import { TelegramChatMember, TelegramUser } from './types.js';

export class TelegramApi {
  private getToken(): string {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured in process.env');
    }
    return token;
  }

  private async call<T = any>(method: string, body?: Record<string, any>): Promise<{ ok: boolean; result?: T; description?: string; error_code?: number }> {
    try {
      const token = this.getToken();
      const url = `https://api.telegram.org/bot${token}/${method}`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });

      const data = await res.json();
      return data;
    } catch (err: any) {
      return {
        ok: false,
        description: err.message || 'Network request failed'
      };
    }
  }

  public async getMe(): Promise<{ ok: boolean; result?: TelegramUser; description?: string; error_code?: number }> {
    return this.call<TelegramUser>('getMe');
  }

  public async deleteWebhook(): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('deleteWebhook', { drop_pending_updates: false });
  }

  public async getUpdates(offset?: number, timeout: number = 20, allowed_updates: string[] = ['message']): Promise<any> {
    return this.call('getUpdates', {
      offset: offset || undefined,
      timeout,
      allowed_updates
    });
  }

  public async sendMessage(
    chatId: number | string,
    text: string,
    options?: {
      reply_to_message_id?: number;
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      disable_web_page_preview?: boolean;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode || 'HTML',
      reply_to_message_id: options?.reply_to_message_id,
      disable_web_page_preview: options?.disable_web_page_preview ?? true
    });
  }

  public async deleteMessage(chatId: number | string, messageId: number): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  }

  public async banChatMember(
    chatId: number | string,
    userId: number,
    options?: { until_date?: number; revoke_messages?: boolean }
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('banChatMember', {
      chat_id: chatId,
      user_id: userId,
      until_date: options?.until_date,
      revoke_messages: options?.revoke_messages
    });
  }

  public async unbanChatMember(
    chatId: number | string,
    userId: number,
    onlyIfBanned: boolean = true
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('unbanChatMember', {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: onlyIfBanned
    });
  }

  public async kickChatMember(
    chatId: number | string,
    userId: number
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    // In Telegram Bot API, "kick" is ban followed immediately by unban so they can rejoin via invite link
    const banRes = await this.banChatMember(chatId, userId);
    if (!banRes.ok) {
      return banRes;
    }
    // Unban immediately so user is not permanently banned from re-joining
    await this.unbanChatMember(chatId, userId, false);
    return { ok: true };
  }

  public async promoteChatMember(
    chatId: number | string,
    userId: number,
    permissions: {
      is_anonymous?: boolean;
      can_manage_chat?: boolean;
      can_post_messages?: boolean;
      can_edit_messages?: boolean;
      can_delete_messages?: boolean;
      can_manage_video_chats?: boolean;
      can_restrict_members?: boolean;
      can_promote_members?: boolean;
      can_change_info?: boolean;
      can_invite_users?: boolean;
      can_pin_messages?: boolean;
      can_post_stories?: boolean;
      can_edit_stories?: boolean;
      can_delete_stories?: boolean;
      can_manage_topics?: boolean;
    }
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('promoteChatMember', {
      chat_id: chatId,
      user_id: userId,
      ...permissions
    });
  }

  public async getChatMember(
    chatId: number | string,
    userId: number
  ): Promise<{ ok: boolean; result?: TelegramChatMember; description?: string; error_code?: number }> {
    return this.call<TelegramChatMember>('getChatMember', {
      chat_id: chatId,
      user_id: userId
    });
  }

  public async getChatAdministrators(
    chatId: number | string
  ): Promise<{ ok: boolean; result?: TelegramChatMember[]; description?: string; error_code?: number }> {
    return this.call<TelegramChatMember[]>('getChatAdministrators', {
      chat_id: chatId
    });
  }
}

export const telegramApi = new TelegramApi();
