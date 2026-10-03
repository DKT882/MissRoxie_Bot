export interface TelegramRequestContext {
  readonly traceId?: string;
  readonly updateId?: number;
  readonly chatId: number;
  readonly messageId: number;
  readonly userId?: number;
  readonly chatType: string;
  readonly isCommand: boolean;
  readonly receivedAt: number;
}

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
  forward_sender_name?: string;
  forward_origin?: any;
  reply_markup?: any;
  new_chat_members?: TelegramUser[];
  left_chat_member?: TelegramUser;
  new_chat_title?: string;
  new_chat_photo?: any[];
  delete_chat_photo?: boolean;
  group_chat_created?: boolean;
  supergroup_chat_created?: boolean;
  channel_chat_created?: boolean;
  pinned_message?: any;
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

export interface TelegramChatJoinRequest {
  chat: TelegramChat;
  from: TelegramUser;
  user_chat_id: number;
  date: number;
  bio?: string;
  invite_link?: any;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  chat_join_request?: TelegramChatJoinRequest;
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

export interface NoteRecord {
  name: string;
  chatId: number;
  content: string;
  savedBy: number;
  savedByUsername?: string;
  savedAt: string;
  fileId?: string;
  fileType?: string;
}

export interface ApprovedUserRecord {
  chatId: number;
  userId: number;
  username?: string;
  firstName?: string;
  approvedBy: number;
  approvedAt: string;
}

export interface CaptchaSession {
  id: string;
  chatId: number;
  userId: number;
  messageId?: number;
  question: string;
  correctAnswer: string;
  token: string;
  createdAt: number; // Unix timestamp in seconds
  expiresAt: number; // Unix timestamp in seconds
}

export type PolicyDecision = 'ALLOW' | 'BLOCK' | 'EXEMPT' | 'ADMIN_BYPASS';

export interface GroupSettings {
  botId?: number;
  botUsername?: string;
  chatId: number;
  chatTitle?: string;
  // Warnings
  warnLimit: number; // default 3
  warnAction: 'ban' | 'mute' | 'kick' | 'warn_only'; // default 'ban'
  warnExpireSeconds?: number; // 0 = permanent
  // Anti-Flood
  floodEnabled: boolean; // default false
  floodCount: number; // default 8
  floodWindow: number; // default 5 (seconds)
  floodAction: 'delete' | 'mute' | 'kick' | 'ban'; // default 'mute'
  // Anti-Raid
  raidEnabled: boolean; // default false
  raidLimit: number; // default 8 joins
  raidWindow: number; // default 30 seconds
  raidAction: 'kick' | 'mute' | 'ban' | 'restrict'; // default 'kick'
  raidDuration: number; // default 300 seconds (5 mins)
  // CAPTCHA / Join Verification
  captchaEnabled: boolean; // default false
  captchaMode: 'button' | 'math'; // default 'button'
  captchaTimeout: number; // default 120 seconds
  captchaAction: 'kick' | 'mute' | 'ban'; // default 'kick'
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
  locks: Record<string, boolean>; // e.g. { links, stickers, gifs, videos, photos, audio, voice, documents, polls, forwards, contacts, locations, commands, invitelinks }
  // Custom Text Filters (word/phrase -> reply or empty for delete)
  filters: Record<string, string>;
  // Saved Notes (notename -> NoteRecord or content)
  notes?: Record<string, NoteRecord>;
  // Approved / Trusted Users
  approvedUsers?: Record<number, ApprovedUserRecord>;
  // Welcome & Goodbye
  welcomeEnabled: boolean; // default false
  welcomeMessage?: string;
  goodbyeEnabled: boolean; // default false
  goodbyeMessage?: string;
  autoDeleteJoinLeave?: boolean; // default false
  // Slow Mode
  slowModeSeconds: number; // 0 = off
  // Reports
  reportsEnabled: boolean; // default true
  // AI Chatbot & Smart Reactions
  chatbotEnabled?: boolean; // default true
  chatbotMode?: string; // e.g. 'auto' | 'normal' | 'friendly' | 'playful' | 'teasing' | 'sarcastic' | 'serious' | 'cute' | 'romantic' | 'flirty' | string
  lustMode?: boolean; // default false (mildly suggestive/spicy teasing personality modifier)
  lustLevel?: number; // 0 to 4
  reactionEnabled?: boolean; // default true
  reactionProbability?: number; // default 0.15 (15%)
  // Phase 17 Smart User Protection
  protectionEnabled?: boolean;
  protectionFloodCount?: number;
  protectionFloodWindow?: number;
  protectionDuplicateLimit?: number;
  protectionLinkBurstLimit?: number;
  // Phase 9A Smart Content Protection & Message Control
  stopSpamEnabled?: boolean;
  stopAbusiveEnabled?: boolean;
  stopPromotionEnabled?: boolean;
  gifProtection?: boolean;
  linkProtection?: boolean;
  imageProtection?: boolean;
  fileProtection?: boolean;
  customAbusiveWords?: string[];
  abuseWords?: string[];
  // Phase 10 Smart Automation & Advanced Group Management
  automodEnabled?: boolean;
  mediaAction?: 'delete' | 'reason' | 'warn';
  warnEscalation?: Array<{ count: number; action: 'warn' | 'mute' | 'ban' | 'kick'; duration?: number }>;
  securityEnabled?: boolean;
  joinmode?: 'normal' | 'captcha' | 'strict';
  autoAcceptEnabled?: boolean;
  automations?: Array<{ id: string; trigger: string; action: string; parameters?: string; enabled: boolean; createdBy: number; createdAt: string }>;
  rules?: string;
  lastAllTimestamp?: number;
  // Activity-gated Auto Engine & Sticker Cooldown
  lastProactiveConsideredMessageId?: number;
  humanMessagesSinceLastSticker?: number;
  requiredStickerGap?: number;
  stickerActivityMin?: number; // default 10
  stickerActivityMax?: number; // default 20
  responseTypeWeights?: {
    text: number; // default 50
    sticker: number; // default 30
    both: number; // default 20
  };
  autoEngine?: AutoEngineConfig;
  autoResponse?: AutoResponseConfig;
  autoSticker?: AutoStickerConfig;
  stickerPacks?: Record<string, GroupStickerPackConfig>;
  botLeft?: boolean;
  leftAt?: string;
  unavailable?: boolean;
  unavailableAt?: string;
  unavailableReason?: string;
  updatedAt: string;
}

export type AutoEngineMode = 'off' | 'messages_only' | 'stickers_only' | 'messages_and_stickers';
export type AutoEnginePreset = 'very_low' | 'low' | 'normal' | 'high' | 'custom';

export const AUTO_ENGINE_PRESETS: Record<
  AutoEnginePreset,
  {
    messages: { minSeconds: number; maxSeconds: number; cooldownSeconds: number };
    stickers: { minSeconds: number; maxSeconds: number; cooldownSeconds: number };
  }
> = {
  very_low: {
    messages: { minSeconds: 1800, maxSeconds: 3600, cooldownSeconds: 1800 },
    stickers: { minSeconds: 1800, maxSeconds: 3600, cooldownSeconds: 1800 }
  },
  low: {
    messages: { minSeconds: 900, maxSeconds: 1800, cooldownSeconds: 900 },
    stickers: { minSeconds: 1200, maxSeconds: 2400, cooldownSeconds: 1200 }
  },
  normal: {
    messages: { minSeconds: 480, maxSeconds: 900, cooldownSeconds: 480 },
    stickers: { minSeconds: 600, maxSeconds: 1200, cooldownSeconds: 600 }
  },
  high: {
    messages: { minSeconds: 180, maxSeconds: 480, cooldownSeconds: 180 },
    stickers: { minSeconds: 300, maxSeconds: 600, cooldownSeconds: 300 }
  },
  custom: {
    messages: { minSeconds: 120, maxSeconds: 300, cooldownSeconds: 120 },
    stickers: { minSeconds: 120, maxSeconds: 300, cooldownSeconds: 120 }
  }
};

export interface AutoEngineChannelConfig {
  preset?: AutoEnginePreset;
  minSeconds?: number; // Server-side enforced: >= 120s
  maxSeconds?: number;
  cooldownSeconds?: number;
  randomize?: boolean;
  lastSentTimestamp?: number;
  nextScheduledTimestamp?: number;
  nextAllowedAt?: number;
  nextIntervalSeconds?: number;
}

export interface AutoEngineConfig {
  enabled: boolean;
  mode: AutoEngineMode;
  messages?: AutoEngineChannelConfig;
  stickers?: AutoEngineChannelConfig;
  lastMessageTimestamp?: number;
  lastStickerTimestamp?: number;
  lastSentTimestamp?: number;
  humanMessagesSinceLastSticker?: number;
  requiredStickerGap?: number;
  stickerActivityMin?: number;
  stickerActivityMax?: number;
  responseTypeWeights?: {
    text: number;
    sticker: number;
    both: number;
  };
}

export interface AutoResponseConfig {
  enabled: boolean;
  mode: 'every_message' | 'cooldown' | 'random' | 'disabled';
  cooldownSeconds?: number;
  randomize?: boolean;
  minSeconds?: number;
  maxSeconds?: number;
  lastResponseTimestamp?: number;
  nextIntervalSeconds?: number;
  nextAllowedAt?: number;
}

export interface AutoStickerConfig {
  enabled: boolean;
  mode: 'every_message' | 'cooldown' | 'random' | 'disabled';
  cooldownSeconds?: number;
  randomize?: boolean;
  minSeconds?: number;
  maxSeconds?: number;
  lastStickerTimestamp?: number;
  nextIntervalSeconds?: number;
  nextAllowedAt?: number;
}

export interface GroupStickerPackConfig {
  name: string;
  title: string;
  enabled: boolean;
  telegramUrl?: string;
  stickerCount?: number;
  stickers?: Array<{ fileId: string; emoji?: string; category?: string; mood?: string; name?: string }>;
  addedBy?: string | number;
  addedAt?: string;
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

export type ContentType =
  | 'stickers'
  | 'links'
  | 'media'
  | 'photos'
  | 'videos'
  | 'gifs'
  | 'voice'
  | 'audio'
  | 'files'
  | 'all';

export interface ContentPermissionRecord {
  chatId: number;
  userId: number;
  contentType: ContentType;
  grantedBy: number;
  grantedAt: string;
  username?: string;
}

export interface ScheduledPostButton {
  text: string;
  url: string;
}

export type PostButton = ScheduledPostButton;

export type PostContentType = 'text' | 'photo' | 'video' | 'document' | 'sticker' | 'animation';

export interface PostPayload {
  contentType: PostContentType;
  text?: string;
  mediaFileId?: string;
  buttons?: ScheduledPostButton[][];
  pinAfterSend?: boolean;
  replyToLatest?: boolean;
  replyToMessageId?: number;
  autoDeletePrevious?: boolean;
  protectContent?: boolean;
}

export interface SendPostResult {
  ok: boolean;
  messageId?: number;
  chatId: number;
  error?: string;
  pinSuccess?: boolean;
  result?: any;
}

export interface ScheduledMessage {
  id: string;
  chatId: number;
  chatTitle?: string;
  name?: string;
  cron?: string;
  timezone?: string;
  enabled?: boolean;
  adminId?: number;
  adminUsername?: string;
  message: string;
  messageText?: string;
  contentType?: 'text' | 'photo' | 'video' | 'document' | 'sticker' | 'animation';
  mediaFileId?: string;
  intervalMs?: number;
  intervalFormatted?: string;
  scheduleType?: 'one_time' | 'daily' | 'weekly' | 'interval' | 'custom';
  nextRun?: string;
  lastRun?: string;
  lastStatus?: 'success' | 'failure' | 'pending';
  lastError?: string;
  replyToMessageId?: number;
  replyToLatest?: boolean;
  autoDeletePrevious?: boolean;
  pinAfterSend?: boolean;
  inlineKeyboard?: ScheduledPostButton[][];
  lastSentMessageId?: number;
  mentionMode?: 'none' | 'random_member' | 'all_members';
  lastMentionedUserId?: number;
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
  action: 'kick' | 'ban' | 'unban' | 'mute' | 'unmute' | 'tmute' | 'tban' | 'dban' | 'dmute' | 'dkick' | 'sban' | 'smute' | 'skick' | 'demote' | 'promote' | 'permissions' | 'warn' | 'resetwarns' | 'auto_ban' | 'delete_link' | 'delete_sticker' | 'delete_sticker_pack' | 'delete_image' | 'delete_media' | 'free_sticker' | 'unfree_sticker' | 'report' | 'say' | 'clear' | 'schedule_created' | 'schedule_deleted' | 'schedule_sent' | 'setting_change' | 'lock' | 'unlock' | 'flood_action' | 'filter_match' | 'set_slowmode' | 'pin' | 'unpin' | 'auto_accept' | 'automod_toggle' | 'security_toggle' | 'captcha_toggle' | 'antiraid_toggle' | 'joinmode_change' | 'automation_add' | 'automation_remove' | 'automation_toggle' | 'rules_update' | 'all_broadcast' | 'leave_group' | 'send_message' | 'broadcast';
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

export type { CommandContext } from './middleware.js';
