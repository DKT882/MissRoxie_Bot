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
  new_chat_members?: TelegramUser[];
  left_chat_member?: TelegramUser;
  new_chat_title?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
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
  can_post_stories?: boolean;
  can_edit_stories?: boolean;
  can_delete_stories?: boolean;
}

export interface GroupSettings {
  chatId: number;
  chatTitle?: string;
  linksProtection: boolean; // default true
  stickerProtection: boolean; // default true
  warnLimit: number; // default 3
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
  timestamp: string;
}

export interface StickerFreeUser {
  chatId: number;
  userId: number;
  username?: string;
  grantedBy: number;
  grantedAt: string;
}

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
  action: 'kick' | 'ban' | 'unban' | 'demote' | 'promote' | 'warn' | 'resetwarns' | 'auto_ban' | 'delete_link' | 'delete_sticker' | 'free_sticker' | 'unfree_sticker' | 'report' | 'say' | 'schedule_created' | 'schedule_deleted' | 'schedule_sent' | 'setting_change';
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
    totalReports: number;
    activeSchedules: number;
    groupsCount: number;
  };
  recentLogs: ModerationLog[];
}
