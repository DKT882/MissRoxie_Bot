import { telegramApi } from './api.js';
import { PostSender, sanitizeInlineButtons } from './postSender.js';
import { PostPayload, PostContentType, ScheduledPostButton, TelegramMessage, TelegramCallbackQuery } from './types.js';
import { CommandContext, TelegramMiddleware } from './middleware.js';

export type PostBuilderState =
  | 'SELECTING_TYPE'
  | 'WAITING_FOR_TEXT'
  | 'WAITING_FOR_MEDIA'
  | 'WAITING_FOR_CAPTION'
  | 'MANAGING_BUTTONS'
  | 'WAITING_FOR_BUTTON_TEXT'
  | 'WAITING_FOR_BUTTON_URL'
  | 'PREVIEW';

export interface PostBuilderSession {
  chatId: number;
  userId: number;
  messageId?: number;
  state: PostBuilderState;
  contentType: PostContentType;
  text?: string;
  mediaFileId?: string;
  buttons: ScheduledPostButton[][];
  pendingButtonText?: string;
  createdAt: number;
  updatedAt: number;
}

function isValidHttpUrl(stringUrl?: string): boolean {
  if (!stringUrl || typeof stringUrl !== 'string') return false;
  try {
    const parsed = new URL(stringUrl.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class PostBuilderManager {
  private static sessions: Map<string, PostBuilderSession> = new Map();

  public static getSessionKey(chatId: number, userId: number): string {
    return `${chatId}:${userId}`;
  }

  public static getSession(chatId: number, userId: number): PostBuilderSession | undefined {
    return this.sessions.get(this.getSessionKey(chatId, userId));
  }

  public static hasActiveSession(chatId: number, userId: number): boolean {
    return this.sessions.has(this.getSessionKey(chatId, userId));
  }

  public static clearSession(chatId: number, userId: number): boolean {
    return this.sessions.delete(this.getSessionKey(chatId, userId));
  }

  public static resetSessions(): void {
    this.sessions.clear();
  }

  public static getAllSessions(): PostBuilderSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Entry point for /post and /buildpost commands.
   */
  public static async handlePostCommand(ctx: CommandContext): Promise<boolean> {
    const chatId = ctx.chatId;
    const userId = ctx.sender.id;

    // Check if user replied to an existing message/media to prefill the builder
    const reply = ctx.message.reply_to_message;
    let initialContentType: PostContentType = 'text';
    let initialMediaId: string | undefined = undefined;
    let initialText: string | undefined = ctx.rawArgs ? ctx.rawArgs.trim() : undefined;
    let initialButtons: ScheduledPostButton[][] = [];

    if (reply) {
      // Extract inline buttons if present in replied message
      if (reply.reply_markup?.inline_keyboard && Array.isArray(reply.reply_markup.inline_keyboard)) {
        const extracted = reply.reply_markup.inline_keyboard
          .map((row: any[]) =>
            (Array.isArray(row) ? row : [])
              .filter((btn: any) => btn && typeof btn.text === 'string' && btn.text.trim() && isValidHttpUrl(btn.url))
              .map((btn: any) => ({ text: String(btn.text).trim(), url: String(btn.url).trim() }))
          )
          .filter((row: any[]) => row.length > 0);

        if (extracted.length > 0) {
          initialButtons = extracted;
        }
      }

      if (reply.photo && reply.photo.length > 0) {
        initialContentType = 'photo';
        const largest = reply.photo[reply.photo.length - 1];
        initialMediaId = largest.file_id;
        if (!initialText && reply.caption) {
          initialText = reply.caption;
        }
      } else if (reply.video) {
        initialContentType = 'video';
        initialMediaId = reply.video.file_id;
        if (!initialText && reply.caption) {
          initialText = reply.caption;
        }
      } else if (reply.animation) {
        initialContentType = 'animation';
        initialMediaId = reply.animation.file_id;
        if (!initialText && reply.caption) {
          initialText = reply.caption;
        }
      } else if (reply.document) {
        initialContentType = 'document';
        initialMediaId = reply.document.file_id;
        if (!initialText && reply.caption) {
          initialText = reply.caption;
        }
      } else if (reply.text) {
        if (!initialText) {
          initialText = reply.text;
        }
      }
    }

    const hasPrefilledContent = (initialContentType === 'text' && initialText) || (initialContentType !== 'text' && initialMediaId);

    const session: PostBuilderSession = {
      chatId,
      userId,
      state: hasPrefilledContent ? 'PREVIEW' : 'SELECTING_TYPE',
      contentType: initialContentType,
      text: initialText,
      mediaFileId: initialMediaId,
      buttons: initialButtons,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.sessions.set(this.getSessionKey(chatId, userId), session);

    if (hasPrefilledContent) {
      await this.sendPreviewMenu(session);
    } else {
      await this.sendTypeSelectionMenu(session);
    }

    return true;
  }

  /**
   * Sends the content-type selection menu.
   */
  public static async sendTypeSelectionMenu(session: PostBuilderSession): Promise<void> {
    const text = '🛠 <b>Roxie Post Builder</b>\n\n' +
      'Select the type of post you would like to compose:';

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📝 Text', callback_data: 'postb:type:text' },
          { text: '🖼 Photo', callback_data: 'postb:type:photo' }
        ],
        [
          { text: '🎥 Video', callback_data: 'postb:type:video' },
          { text: '🎞 GIF / Animation', callback_data: 'postb:type:animation' }
        ],
        [
          { text: '📄 Document', callback_data: 'postb:type:document' }
        ],
        [
          { text: '❌ Cancel', callback_data: 'postb:cancel' }
        ]
      ]
    };

    if (session.messageId) {
      await telegramApi.editMessageText(session.chatId, session.messageId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    } else {
      const res = await telegramApi.sendMessage(session.chatId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
      if (res.ok && res.result) {
        session.messageId = res.result.message_id;
      }
    }
  }

  /**
   * Sends the preview menu.
   */
  public static async sendPreviewMenu(session: PostBuilderSession): Promise<void> {
    const totalButtons = session.buttons.reduce((sum, row) => sum + row.length, 0);
    const buttonRows = session.buttons.filter(r => r.length > 0).length;

    let previewText = '👁 <b>Post Preview</b>\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      `📦 <b>Type:</b> <code>${session.contentType.toUpperCase()}</code>\n` +
      `📝 <b>Text / Caption:</b>\n` +
      `${session.text ? session.text : '<i>(No text provided)</i>'}\n\n` +
      `🔘 <b>Buttons:</b> ${totalButtons} button(s) in ${buttonRows} row(s)\n` +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      'Ready to send? Choose an option below:';

    const controlButtons: ScheduledPostButton[][] = [
      [
        { text: '✏️ Edit Text', url: '' }, // placeholder converted below
        { text: '🔘 Manage Buttons', url: '' }
      ],
      [
        { text: '📤 Send Now', url: '' }
      ],
      [
        { text: '❌ Cancel', url: '' }
      ]
    ];

    const inlineKeyboard: any[][] = [];

    // If user created buttons, display them as interactive preview in the menu
    if (session.buttons && session.buttons.length > 0) {
      for (const row of session.buttons) {
        if (row.length > 0) {
          inlineKeyboard.push(row.map(b => ({ text: `🔗 ${b.text}`, url: b.url })));
        }
      }
    }

    // Append control buttons
    inlineKeyboard.push([
      { text: '✏️ Edit Text', callback_data: 'postb:preview:edittext' },
      { text: '🔘 Manage Buttons', callback_data: 'postb:preview:buttons' }
    ]);
    inlineKeyboard.push([
      { text: '📤 Send Now', callback_data: 'postb:preview:send' }
    ]);
    inlineKeyboard.push([
      { text: '❌ Cancel', callback_data: 'postb:cancel' }
    ]);

    const keyboard = { inline_keyboard: inlineKeyboard };

    if (session.messageId) {
      await telegramApi.editMessageText(session.chatId, session.messageId, previewText, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    } else {
      const res = await telegramApi.sendMessage(session.chatId, previewText, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
      if (res.ok && res.result) {
        session.messageId = res.result.message_id;
      }
    }
  }

  /**
   * Sends the button management menu.
   */
  public static async sendButtonManagementMenu(session: PostBuilderSession): Promise<void> {
    let buttonList = '';
    if (session.buttons.length === 0 || session.buttons.every(r => r.length === 0)) {
      buttonList = '<i>(No buttons attached yet)</i>\n';
    } else {
      session.buttons.forEach((row, rIdx) => {
        if (row.length > 0) {
          buttonList += `<b>Row ${rIdx + 1}:</b>\n`;
          row.forEach((btn, bIdx) => {
            buttonList += `  ${bIdx + 1}. [${escapeHtml(btn.text)}] → <code>${escapeHtml(btn.url)}</code>\n`;
          });
        }
      });
    }

    const text = '🔘 <b>Button Management</b>\n\n' +
      '<b>Current Buttons:</b>\n' +
      buttonList + '\n' +
      'Use the controls below to build your button grid:';

    const keyboard = {
      inline_keyboard: [
        [
          { text: '➕ Add Button', callback_data: 'postb:btn:add' },
          { text: '↔ New Row', callback_data: 'postb:btn:newrow' }
        ],
        [
          { text: '🗑 Remove Last', callback_data: 'postb:btn:remlast' },
          { text: '🗑 Clear All', callback_data: 'postb:btn:clear' }
        ],
        [
          { text: '✅ Done (Preview)', callback_data: 'postb:btn:done' }
        ]
      ]
    };

    if (session.messageId) {
      await telegramApi.editMessageText(session.chatId, session.messageId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    } else {
      const res = await telegramApi.sendMessage(session.chatId, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
      if (res.ok && res.result) {
        session.messageId = res.result.message_id;
      }
    }
  }

  /**
   * Handles callback queries starting with 'postb:'.
   */
  public static async handleCallbackQuery(query: TelegramCallbackQuery): Promise<boolean> {
    if (!query.data || !query.data.startsWith('postb:')) {
      return false;
    }

    const chatId = query.message?.chat?.id;
    const userId = query.from?.id;

    if (!chatId || !userId) {
      await telegramApi.answerCallbackQuery(query.id);
      return true;
    }

    const session = this.getSession(chatId, userId);

    // If query is cancel but no session exists, simply dismiss
    if (!session) {
      if (query.data === 'postb:cancel' && query.message) {
        await telegramApi.answerCallbackQuery(query.id);
        await telegramApi.editMessageText(chatId, query.message.message_id, '❌ <b>Post builder session has expired or was already closed.</b>', { parse_mode: 'HTML' });
        return true;
      }
      await telegramApi.answerCallbackQuery(query.id, { text: '⚠️ No active post builder session found.', show_alert: true });
      return true;
    }

    // Verify user authorization (only the session creator can control this builder)
    if (session.userId !== userId) {
      await telegramApi.answerCallbackQuery(query.id, { text: '❌ Only the admin who started this post builder can interact with it.', show_alert: true });
      return true;
    }

    await telegramApi.answerCallbackQuery(query.id);

    const action = query.data.replace(/^postb:/, '');

    // 1. Cancel
    if (action === 'cancel') {
      this.clearSession(chatId, userId);
      if (query.message) {
        await telegramApi.editMessageText(chatId, query.message.message_id, '❌ <b>Post creation cancelled.</b>', { parse_mode: 'HTML' });
      }
      return true;
    }

    // 2. Select Content Type
    if (action.startsWith('type:')) {
      const selectedType = action.replace(/^type:/, '') as PostContentType;
      session.contentType = selectedType;
      session.updatedAt = Date.now();

      if (selectedType === 'text') {
        session.state = 'WAITING_FOR_TEXT';
        const prompt = '📝 <b>Send the text content for your post.</b>\n\n' +
          '(HTML formatting like &lt;b&gt;bold&lt;/b&gt;, &lt;i&gt;italic&lt;/i&gt;, and &lt;code&gt;code&lt;/code&gt; is supported)';
        const keyboard = {
          inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'postb:cancel' }]]
        };
        if (query.message) {
          await telegramApi.editMessageText(chatId, query.message.message_id, prompt, { parse_mode: 'HTML', reply_markup: keyboard });
        }
      } else {
        session.state = 'WAITING_FOR_MEDIA';
        const prompt = `🖼 <b>Send the ${selectedType} file for your post.</b>\n\n` +
          'You can also include an optional caption with the media.';
        const keyboard = {
          inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'postb:cancel' }]]
        };
        if (query.message) {
          await telegramApi.editMessageText(chatId, query.message.message_id, prompt, { parse_mode: 'HTML', reply_markup: keyboard });
        }
      }
      return true;
    }

    // 3. Preview actions
    if (action === 'preview:edittext') {
      session.updatedAt = Date.now();
      if (session.contentType === 'text') {
        session.state = 'WAITING_FOR_TEXT';
        const prompt = '📝 <b>Send the new text for your post:</b>';
        const keyboard = {
          inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'postb:cancel' }]]
        };
        if (query.message) {
          await telegramApi.editMessageText(chatId, query.message.message_id, prompt, { parse_mode: 'HTML', reply_markup: keyboard });
        }
      } else {
        session.state = 'WAITING_FOR_CAPTION';
        const prompt = '📝 <b>Send the new caption for your media post:</b>\n\n(Send <code>/skip</code> to leave caption empty)';
        const keyboard = {
          inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'postb:cancel' }]]
        };
        if (query.message) {
          await telegramApi.editMessageText(chatId, query.message.message_id, prompt, { parse_mode: 'HTML', reply_markup: keyboard });
        }
      }
      return true;
    }

    if (action === 'preview:buttons') {
      session.state = 'MANAGING_BUTTONS';
      session.updatedAt = Date.now();
      await this.sendButtonManagementMenu(session);
      return true;
    }

    if (action === 'preview:send') {
      // Validate post before sending
      if (session.contentType === 'text' && (!session.text || !session.text.trim())) {
        await telegramApi.answerCallbackQuery(query.id, { text: '❌ Text post cannot be empty. Please edit text.', show_alert: true });
        return true;
      }
      if (session.contentType !== 'text' && !session.mediaFileId) {
        await telegramApi.answerCallbackQuery(query.id, { text: '❌ Media file is missing. Please re-select media.', show_alert: true });
        return true;
      }

      const payload: PostPayload = {
        contentType: session.contentType,
        text: session.text || '',
        mediaFileId: session.mediaFileId,
        buttons: session.buttons && session.buttons.length > 0 ? session.buttons : undefined
      };

      // Call PostSender to deliver the post
      const sendRes = await PostSender.send(session.chatId, payload);

      if (sendRes.ok && sendRes.messageId) {
        this.clearSession(chatId, userId);
        const successMsg = `✅ <b>Post delivered successfully!</b>\n\nMessage ID: <code>${sendRes.messageId}</code>`;
        if (query.message) {
          await telegramApi.editMessageText(chatId, query.message.message_id, successMsg, { parse_mode: 'HTML' });
        } else {
          await telegramApi.sendMessage(chatId, successMsg, { parse_mode: 'HTML' });
        }
      } else {
        const errorMsg = `❌ <b>Failed to send post:</b> ${escapeHtml(sendRes.error || 'Telegram send failed')}\n\nYou can edit your post and try again.`;
        if (query.message) {
          await telegramApi.editMessageText(chatId, query.message.message_id, errorMsg, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '👁 Back to Preview', callback_data: 'postb:btn:done' }],
                [{ text: '❌ Cancel', callback_data: 'postb:cancel' }]
              ]
            }
          });
        } else {
          await telegramApi.sendMessage(chatId, errorMsg, { parse_mode: 'HTML' });
        }
      }
      return true;
    }

    // 4. Button Management Actions
    if (action === 'btn:add') {
      session.state = 'WAITING_FOR_BUTTON_TEXT';
      session.updatedAt = Date.now();
      const prompt = '🔤 <b>Send the text for the button:</b>\n\n(e.g., <i>Visit Website</i> or <i>Join Channel</i>)';
      const keyboard = {
        inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'postb:cancel' }]]
      };
      if (query.message) {
        await telegramApi.editMessageText(chatId, query.message.message_id, prompt, { parse_mode: 'HTML', reply_markup: keyboard });
      }
      return true;
    }

    if (action === 'btn:newrow') {
      if (session.buttons.length === 0 || session.buttons[session.buttons.length - 1].length > 0) {
        session.buttons.push([]);
      }
      session.updatedAt = Date.now();
      await this.sendButtonManagementMenu(session);
      return true;
    }

    if (action === 'btn:remlast') {
      if (session.buttons.length > 0) {
        const lastRow = session.buttons[session.buttons.length - 1];
        if (lastRow.length > 0) {
          lastRow.pop();
        }
        if (lastRow.length === 0 && session.buttons.length > 1) {
          session.buttons.pop();
        }
      }
      session.updatedAt = Date.now();
      await this.sendButtonManagementMenu(session);
      return true;
    }

    if (action === 'btn:clear') {
      session.buttons = [];
      session.updatedAt = Date.now();
      await this.sendButtonManagementMenu(session);
      return true;
    }

    if (action === 'btn:done') {
      session.state = 'PREVIEW';
      session.updatedAt = Date.now();
      await this.sendPreviewMenu(session);
      return true;
    }

    return false;
  }

  /**
   * Handles incoming text/media messages from users who have an active builder session.
   */
  public static async handleIncomingMessage(message: TelegramMessage): Promise<boolean> {
    const chatId = message.chat.id;
    const userId = message.from?.id;

    if (!userId) return false;

    const session = this.getSession(chatId, userId);
    if (!session) return false;

    const textContent = message.text || message.caption || '';
    const trimmedText = textContent.trim();

    // Allow user to cancel by typing /cancel
    if (trimmedText === '/cancel') {
      this.clearSession(chatId, userId);
      await telegramApi.sendMessage(chatId, '❌ <b>Post creation cancelled.</b>', { parse_mode: 'HTML' });
      return true;
    }

    // 1. Text post input
    if (session.state === 'WAITING_FOR_TEXT') {
      if (!trimmedText) {
        await telegramApi.sendMessage(chatId, '⚠️ Please send non-empty text content for your post (or send /cancel to abort):', { parse_mode: 'HTML' });
        return true;
      }
      session.text = textContent;
      session.state = 'PREVIEW';
      session.updatedAt = Date.now();
      await this.sendPreviewMenu(session);
      return true;
    }

    // 2. Caption input
    if (session.state === 'WAITING_FOR_CAPTION') {
      if (trimmedText === '/skip' || trimmedText === '/skipcaption') {
        session.text = undefined;
      } else {
        session.text = textContent;
      }
      session.state = 'PREVIEW';
      session.updatedAt = Date.now();
      await this.sendPreviewMenu(session);
      return true;
    }

    // 3. Media file input
    if (session.state === 'WAITING_FOR_MEDIA') {
      let extractedFileId: string | undefined = undefined;

      if (session.contentType === 'photo' && message.photo && message.photo.length > 0) {
        const largest = message.photo[message.photo.length - 1];
        extractedFileId = largest.file_id;
      } else if (session.contentType === 'video' && message.video) {
        extractedFileId = message.video.file_id;
      } else if (session.contentType === 'animation' && message.animation) {
        extractedFileId = message.animation.file_id;
      } else if (session.contentType === 'document' && message.document) {
        extractedFileId = message.document.file_id;
      } else if (message.photo && message.photo.length > 0) {
        // Fallback: auto-detect photo
        session.contentType = 'photo';
        const largest = message.photo[message.photo.length - 1];
        extractedFileId = largest.file_id;
      } else if (message.video) {
        session.contentType = 'video';
        extractedFileId = message.video.file_id;
      } else if (message.animation) {
        session.contentType = 'animation';
        extractedFileId = message.animation.file_id;
      } else if (message.document) {
        session.contentType = 'document';
        extractedFileId = message.document.file_id;
      }

      if (!extractedFileId) {
        await telegramApi.sendMessage(chatId, `⚠️ Expected a <b>${session.contentType}</b> file. Please send a valid media message (or send /cancel to abort):`, { parse_mode: 'HTML' });
        return true;
      }

      session.mediaFileId = extractedFileId;
      if (message.caption) {
        session.text = message.caption;
      }
      session.state = 'PREVIEW';
      session.updatedAt = Date.now();
      await this.sendPreviewMenu(session);
      return true;
    }

    // 4. Button Text input
    if (session.state === 'WAITING_FOR_BUTTON_TEXT') {
      if (!trimmedText || trimmedText.length > 64) {
        await telegramApi.sendMessage(chatId, '⚠️ Button text must be between 1 and 64 characters. Please send the button text:', { parse_mode: 'HTML' });
        return true;
      }
      session.pendingButtonText = trimmedText;
      session.state = 'WAITING_FOR_BUTTON_URL';
      session.updatedAt = Date.now();
      await telegramApi.sendMessage(chatId, `🔗 <b>Send the URL for button "${escapeHtml(trimmedText)}":</b>\n\n(Must start with <code>http://</code> or <code>https://</code>)`, { parse_mode: 'HTML' });
      return true;
    }

    // 5. Button URL input
    if (session.state === 'WAITING_FOR_BUTTON_URL') {
      if (!isValidHttpUrl(trimmedText)) {
        await telegramApi.sendMessage(chatId, '❌ <b>Invalid URL.</b> URL must start with <code>http://</code> or <code>https://</code>.\n\nPlease send a valid URL (or send /cancel to abort):', { parse_mode: 'HTML' });
        return true;
      }

      if (session.buttons.length === 0) {
        session.buttons.push([]);
      }
      const lastRow = session.buttons[session.buttons.length - 1];
      lastRow.push({ text: session.pendingButtonText!, url: trimmedText });
      session.pendingButtonText = undefined;
      session.state = 'MANAGING_BUTTONS';
      session.updatedAt = Date.now();
      await this.sendButtonManagementMenu(session);
      return true;
    }

    return false;
  }
}
