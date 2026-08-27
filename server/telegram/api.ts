import { TelegramChatMember, TelegramUser, BotCommand, BotCommandScope } from './types.js';

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
      reply_markup?: any;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode || 'HTML',
      reply_to_message_id: options?.reply_to_message_id,
      disable_web_page_preview: options?.disable_web_page_preview ?? true,
      reply_markup: options?.reply_markup
    });
  }

  public async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options?: {
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      disable_web_page_preview?: boolean;
      reply_markup?: any;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options?.parse_mode || 'HTML',
      disable_web_page_preview: options?.disable_web_page_preview ?? true,
      reply_markup: options?.reply_markup
    });
  }

  public async answerCallbackQuery(
    callbackQueryId: string,
    options?: {
      text?: string;
      show_alert?: boolean;
      url?: string;
      cache_time?: number;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    return this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: options?.text,
      show_alert: options?.show_alert,
      url: options?.url,
      cache_time: options?.cache_time
    });
  }

  public async deleteMessage(chatId: number | string, messageId: number): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  }

  public async deleteMessages(chatId: number | string, messageIds: number[]): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    if (!messageIds || messageIds.length === 0) {
      return { ok: true, result: true };
    }
    return this.call('deleteMessages', {
      chat_id: chatId,
      message_ids: messageIds
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

  public async restrictChatMember(
    chatId: number | string,
    userId: number,
    permissions: import('./types.js').ChatPermissions,
    options?: { until_date?: number; use_independent_chat_permissions?: boolean }
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('restrictChatMember', {
      chat_id: chatId,
      user_id: userId,
      permissions,
      until_date: options?.until_date,
      use_independent_chat_permissions: options?.use_independent_chat_permissions ?? true
    });
  }

  public async unmuteChatMember(
    chatId: number | string,
    userId: number
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    // Standard member chat permissions to restore all standard rights
    const fullPermissions: import('./types.js').ChatPermissions = {
      can_send_messages: true,
      can_send_audios: true,
      can_send_documents: true,
      can_send_photos: true,
      can_send_videos: true,
      can_send_video_notes: true,
      can_send_voice_notes: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true,
      can_invite_users: true,
      can_pin_messages: false,
      can_change_info: false,
      can_manage_topics: false
    };

    return this.restrictChatMember(chatId, userId, fullPermissions, {
      use_independent_chat_permissions: true
    });
  }

  public async pinChatMessage(
    chatId: number | string,
    messageId: number,
    disableNotification: boolean = false
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('pinChatMessage', {
      chat_id: chatId,
      message_id: messageId,
      disable_notification: disableNotification
    });
  }

  public async unpinChatMessage(
    chatId: number | string,
    messageId?: number
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('unpinChatMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  }

  public async unpinAllChatMessages(
    chatId: number | string
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('unpinAllChatMessages', {
      chat_id: chatId
    });
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

  public async setChatSlowModeDelay(
    chatId: number | string,
    slowModeDelay: number
  ): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    return this.call('setChatSlowModeDelay', {
      chat_id: chatId,
      slow_mode_delay: slowModeDelay
    });
  }

  public async setMyCommands(
    commands: BotCommand[],
    scope?: BotCommandScope,
    language_code?: string
  ): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    return this.call('setMyCommands', {
      commands,
      scope: scope || undefined,
      language_code: language_code || undefined
    });
  }

  public async deleteMyCommands(
    scope?: BotCommandScope,
    language_code?: string
  ): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    return this.call('deleteMyCommands', {
      scope: scope || undefined,
      language_code: language_code || undefined
    });
  }

  public async sendChatAction(
    chatId: number | string,
    action: 'typing' | 'upload_photo' | 'record_video' | 'upload_video' | 'record_voice' | 'upload_voice' | 'upload_document' | 'choose_sticker' | 'find_location' | 'record_video_note' | 'upload_video_note'
  ): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    return this.call('sendChatAction', {
      chat_id: chatId,
      action
    });
  }

  public async sendSticker(
    chatId: number | string,
    sticker: string,
    options?: {
      reply_to_message_id?: number;
      reply_markup?: any;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    return this.call('sendSticker', {
      chat_id: chatId,
      sticker,
      reply_to_message_id: options?.reply_to_message_id,
      reply_markup: options?.reply_markup
    });
  }

  public async sendPhoto(
    chatId: number | string,
    photo: string,
    options?: {
      caption?: string;
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      reply_to_message_id?: number;
      reply_markup?: any;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    return this.call('sendPhoto', {
      chat_id: chatId,
      photo,
      caption: options?.caption,
      parse_mode: options?.parse_mode || 'HTML',
      reply_to_message_id: options?.reply_to_message_id,
      reply_markup: options?.reply_markup
    });
  }

  public async sendVideo(
    chatId: number | string,
    video: string,
    options?: {
      caption?: string;
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      reply_to_message_id?: number;
      reply_markup?: any;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    return this.call('sendVideo', {
      chat_id: chatId,
      video,
      caption: options?.caption,
      parse_mode: options?.parse_mode || 'HTML',
      reply_to_message_id: options?.reply_to_message_id,
      reply_markup: options?.reply_markup
    });
  }

  public async sendDocument(
    chatId: number | string,
    document: string,
    options?: {
      caption?: string;
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      reply_to_message_id?: number;
      reply_markup?: any;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    return this.call('sendDocument', {
      chat_id: chatId,
      document,
      caption: options?.caption,
      parse_mode: options?.parse_mode || 'HTML',
      reply_to_message_id: options?.reply_to_message_id,
      reply_markup: options?.reply_markup
    });
  }

  public async sendAnimation(
    chatId: number | string,
    animation: string,
    options?: {
      caption?: string;
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      reply_to_message_id?: number;
      reply_markup?: any;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    return this.call('sendAnimation', {
      chat_id: chatId,
      animation,
      caption: options?.caption,
      parse_mode: options?.parse_mode || 'HTML',
      reply_to_message_id: options?.reply_to_message_id,
      reply_markup: options?.reply_markup
    });
  }

  public async getStickerSet(name: string): Promise<{ ok: boolean; result?: { stickers: Array<{ file_id: string; [key: string]: any }> }; description?: string; error_code?: number }> {
    return this.call('getStickerSet', { name });
  }
}

export const telegramApi = new TelegramApi();
