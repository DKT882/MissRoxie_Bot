import { db } from '../db/storage.js';
import { PostPayload, SavedPost, TelegramUser } from './types.js';

export class PostResolutionError extends Error {
  public readonly missingPostId?: string;
  constructor(message: string, public readonly postId?: string) {
    super(message);
    this.name = 'PostResolutionError';
    this.missingPostId = postId;
  }
}

export class PostResolverService {
  public static readonly POST_ID_REGEX = /\{\{(item|post|schedule|template):([A-Za-z0-9_-]+)\}\}/gi;
  public static readonly EXACT_POST_REGEX = /^\s*\{\{(item|post|schedule|template):([A-Za-z0-9_-]+)\}\}\s*$/i;

  /**
   * Checks whether a text contains one or more reference placeholders.
   */
  public static containsPostReference(text?: string): boolean {
    if (!text || typeof text !== 'string') return false;
    return /\{\{(item|post|schedule|template):[A-Za-z0-9_-]+\}\}/i.test(text);
  }

  /**
   * Extracts all referenced items in a string, returned as { type: string; id: string }.
   */
  public static extractReferences(text?: string): Array<{ type: string; id: string }> {
    if (!text || typeof text !== 'string') return [];
    const refs: Array<{ type: string; id: string }> = [];
    const matches = text.matchAll(/\{\{(item|post|schedule|template):([A-Za-z0-9_-]+)\}\}/gi);
    for (const match of matches) {
      if (match[1] && match[2]) {
        refs.push({ type: match[1].toLowerCase(), id: match[2].toUpperCase() });
      }
    }
    return refs;
  }

  /**
   * Backward compatibility: Extracts post IDs referenced in a string.
   */
  public static extractPostIds(text?: string): string[] {
    return this.extractReferences(text).map(r => r.id);
  }

  /**
   * Resolves a message text or post reference into a complete PostPayload.
   * If input is exactly {{item:ID}}, adopts the full post content, media, buttons, and settings.
   * If embedded within other text, replaces the placeholders with the saved post's text.
   */
  public static resolveMessage(
    rawText?: string,
    options?: {
      user?: TelegramUser;
      chatTitle?: string;
      chatId?: number;
      enforceMediaType?: (type: string) => boolean;
      visitedIds?: Set<string>;
      depth?: number;
    }
  ): PostPayload {
    if (!rawText) {
      return { contentType: 'text', text: '' };
    }

    const trimmed = rawText.trim();
    const exactMatch = trimmed.match(this.EXACT_POST_REGEX);

    if (exactMatch) {
      const typeTag = exactMatch[1].toLowerCase();
      const itemId = exactMatch[2].toUpperCase();
      const item = db.getContentItem(itemId, options?.chatId ? { chatId: options.chatId } : undefined);
      if (!item) {
        throw new PostResolutionError(`Content item "${itemId}" not found in library.`, itemId);
      }

      if (typeTag !== 'item') {
        const isTemplateMatch = typeTag === 'template' && (item.type === 'broadcast' || item.type === 'inline_button');
        if (!isTemplateMatch && item.type !== typeTag) {
          throw new PostResolutionError(`Referenced item "${itemId}" is a ${item.type}, but was referenced as ${typeTag}.`, itemId);
        }
      }

      if (options?.enforceMediaType && !options.enforceMediaType(item.contentType)) {
        throw new PostResolutionError(
          `Item "${itemId}" uses content type "${item.contentType}", which is not supported in this feature.`,
          itemId
        );
      }

      return {
        contentType: item.contentType,
        text: item.text,
        mediaFileId: item.mediaFileId,
        mediaUploadId: item.mediaUploadId,
        buttons: item.buttons ? JSON.parse(JSON.stringify(item.buttons)) : undefined,
        protectContent: item.options?.protectContent,
        pinAfterSend: item.options?.pinAfterSend,
        replyToLatest: item.options?.replyToLatest,
        autoDeletePrevious: item.options?.autoDeletePrevious
      };
    }

    // Embedded references: replace placeholders in text (cycle & depth safe)
    if (this.containsPostReference(rawText)) {
      const depth = options?.depth || 0;
      if (depth > 3) {
        return { contentType: 'text', text: rawText };
      }

      const visited = options?.visitedIds ? new Set(options.visitedIds) : new Set<string>();
      let resolvedText = rawText;
      const refs = this.extractReferences(rawText);

      for (const ref of refs) {
        if (visited.has(ref.id)) {
          continue; // Prevent infinite cycle
        }
        visited.add(ref.id);

        const item = db.getContentItem(ref.id, options?.chatId ? { chatId: options.chatId } : undefined);
        if (!item) {
          throw new PostResolutionError(`Referenced item "${ref.id}" not found in library.`, ref.id);
        }

        let replacement = item.text || '';
        if (this.containsPostReference(replacement)) {
          const nested = this.resolveMessage(replacement, {
            ...options,
            visitedIds: visited,
            depth: depth + 1
          });
          replacement = nested.text || '';
        }

        resolvedText = resolvedText.replace(new RegExp(`\\{\\{(${ref.type}|item):${ref.id}\\}\\}`, 'gi'), replacement);
      }

      return {
        contentType: 'text',
        text: resolvedText
      };
    }

    return {
      contentType: 'text',
      text: rawText
    };
  }

  /**
   * Resolves a PostPayload that may have post references in its text field.
   */
  public static resolvePayload(
    payload: PostPayload,
    options?: {
      user?: TelegramUser;
      chatTitle?: string;
      chatId?: number;
    }
  ): PostPayload {
    if (!payload.text || !this.containsPostReference(payload.text)) {
      return payload;
    }

    const trimmed = payload.text.trim();
    const exactMatch = trimmed.match(this.EXACT_POST_REGEX);

    if (exactMatch) {
      const typeTag = exactMatch[1].toLowerCase();
      const itemId = exactMatch[2].toUpperCase();
      const item = db.getContentItem(itemId, options?.chatId ? { chatId: options.chatId } : undefined);
      if (!item) {
        throw new PostResolutionError(`Content item "${itemId}" not found in library.`, itemId);
      }

      if (typeTag !== 'item') {
        const isTemplateMatch = typeTag === 'template' && (item.type === 'broadcast' || item.type === 'inline_button');
        if (!isTemplateMatch && item.type !== typeTag) {
          throw new PostResolutionError(`Referenced item "${itemId}" is a ${item.type}, but was referenced as ${typeTag}.`, itemId);
        }
      }

      return {
        contentType: payload.contentType && payload.contentType !== 'text' ? payload.contentType : item.contentType,
        text: item.text,
        mediaFileId: payload.mediaFileId || item.mediaFileId,
        mediaUploadId: payload.mediaUploadId || item.mediaUploadId,
        buttons: payload.buttons && payload.buttons.length > 0 ? payload.buttons : item.buttons,
        protectContent: payload.protectContent !== undefined ? payload.protectContent : item.options?.protectContent,
        pinAfterSend: payload.pinAfterSend !== undefined ? payload.pinAfterSend : item.options?.pinAfterSend,
        replyToLatest: payload.replyToLatest !== undefined ? payload.replyToLatest : item.options?.replyToLatest,
        replyToMessageId: payload.replyToMessageId,
        autoDeletePrevious: payload.autoDeletePrevious !== undefined ? payload.autoDeletePrevious : item.options?.autoDeletePrevious
      };
    }

    const resolved = this.resolveMessage(payload.text, options);
    return {
      ...payload,
      text: resolved.text
    };
  }
}
