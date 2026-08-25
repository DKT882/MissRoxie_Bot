export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessageEntity {
  type: 'mention' | 'hashtag' | 'cashtag' | 'bot_command' | 'url' | 'email' | 'phone_number' | 'bold' | 'italic' | 'underline' | 'strikethrough' | 'spoiler' | 'code' | 'pre' | 'text_link' | 'text_mention' | 'custom_emoji';
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
}

export interface TelegramSticker {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  is_animated?: boolean;
  is_video?: boolean;
  emoji?: string;
  set_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  message_thread_id?: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  author_signature?: string;
  sender_tag?: string;
  date: number;
  chat: TelegramChat;
  reply_to_message?: TelegramMessage;
  text?: string;
  entities?: TelegramMessageEntity[];
  caption?: string;
  caption_entities?: TelegramMessageEntity[];
  sticker?: TelegramSticker;
  photo?: Array<{
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    file_size?: number;
  }>;
  animation?: {
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    duration: number;
    mime_type?: string;
    file_name?: string;
    file_size?: number;
  };
  document?: {
    file_id: string;
    file_unique_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
  video?: {
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    duration: number;
    mime_type?: string;
    file_name?: string;
    file_size?: number;
  };
  video_note?: {
    file_id: string;
    file_unique_id: string;
    length: number;
    duration: number;
  };
  voice?: {
    file_id: string;
    file_unique_id: string;
    duration: number;
    mime_type?: string;
    file_size?: number;
  };
  audio?: {
    file_id: string;
    file_unique_id: string;
    duration: number;
    performer?: string;
    title?: string;
    mime_type?: string;
    file_size?: number;
  };
  poll?: {
    id: string;
    question: string;
    options: Array<{ text: string; voter_count: number }>;
    total_voter_count: number;
    is_closed: boolean;
  };
  contact?: {
    phone_number: string;
    first_name: string;
    last_name?: string;
    user_id?: number;
  };
  location?: {
    longitude: number;
    latitude: number;
  };
  venue?: {
    location: { longitude: number; latitude: number };
    title: string;
    address: string;
  };
  forward_from?: TelegramUser;
  forward_from_chat?: TelegramChat;
  forward_date?: number;
  forward_origin?: any;
  new_chat_members?: TelegramUser[];
  left_chat_member?: TelegramUser;
  new_chat_title?: string;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  inline_message_id?: string;
  chat_instance?: string;
  data?: string;
  game_short_name?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface BotCommand {
  command: string;
  description: string;
}

export type BotCommandScope =
  | { type: 'default' }
  | { type: 'all_private_chats' }
  | { type: 'all_group_chats' }
  | { type: 'all_chat_administrators' }
  | { type: 'chat'; chat_id: number | string }
  | { type: 'chat_administrators'; chat_id: number | string }
  | { type: 'chat_member'; chat_id: number | string; user_id: number };

export interface AdminPermissions {
  is_anonymous: boolean;
  can_manage_chat: boolean;
  can_delete_messages: boolean;
  can_manage_video_chats: boolean;
  can_restrict_members: boolean;
  can_promote_members: boolean;
  can_change_info: boolean;
  can_invite_users: boolean;
  can_pin_messages: boolean;
  can_manage_topics: boolean;
  can_post_messages: boolean;
  can_edit_messages: boolean;
  can_post_stories: boolean;
  can_edit_stories: boolean;
  can_delete_stories: boolean;
}

export interface TelegramChatMember {
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
  user: TelegramUser;
  is_anonymous?: boolean;
  custom_title?: string;
  can_be_edited?: boolean;
  can_manage_chat?: boolean;
  can_delete_messages?: boolean;
  can_manage_video_chats?: boolean;
  can_restrict_members?: boolean;
  can_promote_members?: boolean;
  can_change_info?: boolean;
  can_invite_users?: boolean;
  can_pin_messages?: boolean;
  can_manage_topics?: boolean;
  can_post_messages?: boolean;
  can_edit_messages?: boolean;
  can_post_stories?: boolean;
  can_edit_stories?: boolean;
  can_delete_stories?: boolean;
}

export interface GroupSettings {
  chatId: number;
  chatTitle?: string;
  // Warnings
  warnLimit: number; // default 3
  warnAction: 'ban' | 'mute' | 'kick' | 'warn_only'; // default 'ban'
  // Anti-Flood
  floodEnabled: boolean; // default false
  floodCount: number; // default 8
  floodWindow: number; // default 5 (seconds)
  floodAction: 'delete' | 'mute' | 'kick' | 'ban'; // default 'mute'
  // Links & Whitelist
  linksProtection: boolean; // default true
  linksWhitelist: string[]; // default []
  // Media Toggles
  mediaProtection: boolean; // default true
  stickerProtection: boolean; // default true
  gifsProtection: boolean; // default false
  videosProtection: boolean; // default false
  photosProtection: boolean; // default false
  voiceProtection: boolean; // default false
  audioProtection: boolean; // default false
  // Content Locks
  locks: Record<string, boolean>; // e.g. { links, stickers, gifs, videos, photos, audio, voice, documents, polls, forwards, contacts, locations }
  // Custom Text Filters
  filters: Record<string, string>; // word/phrase -> reply or empty for delete
  // Welcome & Goodbye
  welcomeEnabled: boolean; // default false
  welcomeMessage?: string;
  goodbyeEnabled: boolean; // default false
  goodbyeMessage?: string;
  // Slow Mode
  slowModeSeconds: number; // 0 = off
  // Reports
  reportsEnabled: boolean; // default true
  updatedAt: string;
}

export interface WarningRecord {
  id: string;
  chatId: number;
  userId: number;
  userUsername?: string;
  userFirstName?: string;
  adminId: number;
  adminUsername?: string;
  reason: string;
  count?: number;
  timestamp: string;
}

export interface StickerFreeUser {
  chatId: number;
  userId: number;
  username?: string;
  grantedBy: number;
  grantedAt: string;
}

export type MediaFreeUser = StickerFreeUser;

export interface ScheduledMessage {
  id: string;
  chatId: number;
  chatTitle?: string;
  adminId: number;
  adminUsername?: string;
  message: string;
  intervalMs: number;
  intervalFormatted: string;
  nextRun: string;
  createdAt: string;
  runsCount: number;
}

export type RoleLevel = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'MEMBER';

export interface CachedMember {
  userId: number;
  username?: string;
  firstName: string;
  lastName?: string;
  groupId?: number;
  lastSeen: string;
  customRole?: 'MODERATOR' | 'NONE';
}

export interface TrackedChatMessage {
  messageId: number;
  chatId: number;
  date: number; // Unix timestamp in seconds or ms
  userId?: number;
}

export interface ChatPermissions {
  can_send_messages?: boolean;
  can_send_audios?: boolean;
  can_send_documents?: boolean;
  can_send_photos?: boolean;
  can_send_videos?: boolean;
  can_send_video_notes?: boolean;
  can_send_voice_notes?: boolean;
  can_send_polls?: boolean;
  can_send_other_messages?: boolean;
  can_add_web_page_previews?: boolean;
  can_change_info?: boolean;
  can_invite_users?: boolean;
  can_pin_messages?: boolean;
  can_manage_topics?: boolean;
}

export interface TempActionRecord {
  id: string;
  chatId: number;
  chatTitle?: string;
  userId: number;
  username?: string;
  userFirstName?: string;
  action: 'tmute' | 'tban';
  durationSeconds: number;
  durationFormatted: string;
  reason?: string;
  adminId: number;
  adminUsername?: string;
  createdAt: string;
  expiresAt: number; // Unix timestamp in seconds
}

export interface ModerationLog {
  id: string;
  chatId: number;
  chatTitle?: string;
  groupId?: number;
  actorId?: number;
  actorUsername?: string;
  actorRole?: string;
  targetId?: number;
  targetUserId?: number;
  targetUsername?: string;
  targetTelegramStatus?: string;
  targetCustomRole?: string;
  adminUserId?: number;
  adminUsername?: string;
  command?: string;
  action: 'kick' | 'ban' | 'unban' | 'mute' | 'unmute' | 'tmute' | 'tban' | 'dban' | 'dmute' | 'dkick' | 'sban' | 'smute' | 'skick' | 'demote' | 'promote' | 'permissions' | 'warn' | 'resetwarns' | 'auto_ban' | 'delete_link' | 'delete_sticker' | 'delete_image' | 'delete_media' | 'free_sticker' | 'unfree_sticker' | 'report' | 'say' | 'clear' | 'schedule_created' | 'schedule_deleted' | 'schedule_sent' | 'setting_change' | 'lock' | 'unlock' | 'flood_action' | 'filter_match' | 'set_slowmode' | 'pin' | 'unpin';
  result?: 'success' | 'denied' | 'error';
  telegramError?: string;
  reason?: string;
  details?: string;
  timestamp: string;
}

export interface TelegramBotStatus {
  variableName: string;
  isConfigured: boolean;
  isValidFormat: boolean;
  isPolling: boolean;
  botInfo: TelegramUser | null;
  totalMessagesReceived: number;
  lastPolledAt: string | null;
  pollingError: string | null;
  stats: {
    totalBans: number;
    totalKicks: number;
    totalWarns: number;
    totalDeletedLinks: number;
    totalDeletedStickers: number;
    totalDeletedImages: number;
    totalReports: number;
    activeSchedules: number;
    groupsCount: number;
  };
  recentLogs: ModerationLog[];
}
