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
  public static readonly POST_ID_REGEX = /\{\{post:(POST-[A-Z0-9_-]+)\}\}/gi;
  public static readonly EXACT_POST_REGEX = /^\{\{post:(POST-[A-Z0-9_-]+)\}\}$/i;

  /**
   * Checks whether a text contains one or more {{post:POST-XXXXX}} references.
   */
  public static containsPostReference(text?: string): boolean {
    if (!text || typeof text !== 'string') return false;
    return /\{\{post:POST-[A-Z0-9_-]+\}\}/i.test(text);
  }

  /**
   * Extracts all post IDs referenced in a string.
   */
  public static extractPostIds(text?: string): string[] {
    if (!text || typeof text !== 'string') return [];
    const ids: string[] = [];
    const matches = text.matchAll(/\{\{post:(POST-[A-Z0-9_-]+)\}\}/gi);
    for (const match of matches) {
      if (match[1]) ids.push(match[1].toUpperCase());
    }
    return ids;
  }

  /**
   * Resolves a message text or post reference into a complete PostPayload.
   * If input is exactly {{post:POST-XXXXX}}, adopts the full post content, media, buttons, and settings.
   * If embedded within other text, replaces the placeholders with the saved post's text.
   */
  public static resolveMessage(
    rawText?: string,
    options?: {
      user?: TelegramUser;
      chatTitle?: string;
      chatId?: number;
      enforceMediaType?: (type: string) => boolean;
    }
  ): PostPayload {
    if (!rawText) {
      return { contentType: 'text', text: '' };
    }

    const trimmed = rawText.trim();
    const exactMatch = trimmed.match(this.EXACT_POST_REGEX);

    if (exactMatch) {
      const postId = exactMatch[1].toUpperCase();
      const post = db.getSavedPost(postId);
      if (!post) {
        throw new PostResolutionError(`Saved post "${postId}" not found in library.`, postId);
      }

      if (options?.enforceMediaType && !options.enforceMediaType(post.contentType)) {
        throw new PostResolutionError(
          `Post "${postId}" uses content type "${post.contentType}", which is not supported in this feature.`,
          postId
        );
      }

      return {
        contentType: post.contentType,
        text: post.text,
        mediaFileId: post.mediaFileId,
        mediaUploadId: post.mediaUploadId,
        buttons: post.buttons ? JSON.parse(JSON.stringify(post.buttons)) : undefined,
        protectContent: post.protectContent,
        pinAfterSend: post.pinAfterSend,
        replyToLatest: post.replyToLatest,
        autoDeletePrevious: post.autoDeletePrevious
      };
    }

    // Embedded post references: replace placeholders in text
    if (this.containsPostReference(rawText)) {
      let resolvedText = rawText;
      const ids = this.extractPostIds(rawText);

      for (const id of ids) {
        const post = db.getSavedPost(id);
        if (!post) {
          throw new PostResolutionError(`Referenced saved post "${id}" not found in library.`, id);
        }
        const replacement = post.text || '';
        resolvedText = resolvedText.replace(new RegExp(`\\{\\{post:${id}\\}\\}`, 'gi'), replacement);
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
      const postId = exactMatch[1].toUpperCase();
      const post = db.getSavedPost(postId);
      if (!post) {
        throw new PostResolutionError(`Saved post "${postId}" not found in library.`, postId);
      }

      return {
        contentType: payload.contentType && payload.contentType !== 'text' ? payload.contentType : post.contentType,
        text: post.text,
        mediaFileId: payload.mediaFileId || post.mediaFileId,
        mediaUploadId: payload.mediaUploadId || post.mediaUploadId,
        buttons: payload.buttons && payload.buttons.length > 0 ? payload.buttons : post.buttons,
        protectContent: payload.protectContent !== undefined ? payload.protectContent : post.protectContent,
        pinAfterSend: payload.pinAfterSend !== undefined ? payload.pinAfterSend : post.pinAfterSend,
        replyToLatest: payload.replyToLatest !== undefined ? payload.replyToLatest : post.replyToLatest,
        replyToMessageId: payload.replyToMessageId,
        autoDeletePrevious: payload.autoDeletePrevious !== undefined ? payload.autoDeletePrevious : post.autoDeletePrevious
      };
    }

    // Embedded in text
    let resolvedText = payload.text;
    const ids = this.extractPostIds(payload.text);
    for (const id of ids) {
      const post = db.getSavedPost(id);
      if (!post) {
        throw new PostResolutionError(`Referenced saved post "${id}" not found in library.`, id);
      }
      resolvedText = resolvedText.replace(new RegExp(`\\{\\{post:${id}\\}\\}`, 'gi'), post.text || '');
    }

    return {
      ...payload,
      text: resolvedText
    };
  }
}
