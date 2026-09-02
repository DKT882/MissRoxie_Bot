export type CommandCategory =
  | 'General'
  | 'Moderation'
  | 'Warnings'
  | 'Message Cleaning'
  | 'Media & Stickers'
  | 'Locks & Whitelist'
  | 'Smart Protection'
  | 'Custom Abuse'
  | 'Flood Control'
  | 'Filters'
  | 'Reports'
  | 'Welcome & Rules'
  | 'Pin Management'
  | 'Slow Mode'
  | 'Admin & Permissions'
  | 'Audit & Logs'
  | 'Announcements'
  | 'Scheduler'
  | 'Notes'
  | 'Configuration';

export type CommandScope = 'group' | 'private' | 'admin';

export interface CommandCatalogItem {
  command: string;
  category: CommandCategory;
  description: string;
  syntax: string;
  example: string;
  permission: 'Everyone' | 'Admin' | 'Owner';
  telegramPermission?: string;
  targetType: 'None' | 'User' | 'Message' | 'Duration' | 'Text' | 'Config';
  isPublic: boolean;
  modifiesState: boolean;
  auditLogged: boolean;
  aliases?: string[];
  scopes?: CommandScope[];
}

export const COMMAND_CATALOG: CommandCatalogItem[] = [
  // ==================== GENERAL ====================
  {
    command: '/help',
    category: 'General',
    description: "Show Roxie's complete interactive command help guide.",
    syntax: '/help [command|category]',
    example: '/help ban',
    permission: 'Everyone',
    targetType: 'None',
    isPublic: true,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group', 'private']
  },
  {
    command: '/start',
    category: 'General',
    description: 'Initialize bot conversation, register presence, and receive welcome guide.',
    syntax: '/start',
    example: '/start',
    permission: 'Everyone',
    targetType: 'None',
    isPublic: true,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group', 'private']
  },
  {
    command: '/ping',
    category: 'General',
    description: 'Check bot responsiveness, latency, and operational health.',
    syntax: '/ping',
    example: '/ping',
    permission: 'Everyone',
    targetType: 'None',
    isPublic: true,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group', 'private']
  },
  {
    command: '/status',
    category: 'General',
    description: 'View current bot status, operational health, and group configuration overview.',
    syntax: '/status',
    example: '/status',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group', 'private']
  },
  {
    command: '/settings',
    category: 'General',
    description: 'View group moderation, media, and security settings.',
    syntax: '/settings [category]',
    example: '/settings media',
    permission: 'Everyone',
    targetType: 'None',
    isPublic: true,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group', 'private']
  },
  {
    command: '/live',
    category: 'General',
    description: 'Check live operational status, uptime, and database storage health.',
    syntax: '/live',
    example: '/live',
    permission: 'Everyone',
    targetType: 'None',
    isPublic: true,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group', 'private']
  },
  {
    command: '/clearmemory',
    category: 'General',
    description: 'Clear Roxie AI chatbot conversation history and context for this chat.',
    syntax: '/clearmemory',
    example: '/clearmemory',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'private']
  },
  {
    command: '/roxie',
    category: 'General',
    description: 'Manage Roxie AI chatbot status (on/off/status).',
    syntax: '/roxie <on|off|status>',
    example: '/roxie on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group']
  },
  {
    command: '/roxiemode',
    category: 'General',
    description: 'Set Roxie AI chatbot behavior mode (normal|friendly|auto).',
    syntax: '/roxiemode <normal|friendly|auto>',
    example: '/roxiemode friendly',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group']
  },
  {
    command: '/lustmode',
    category: 'General',
    description: 'Toggle Roxie lust / spicy personality mode with custom sticker support.',
    syntax: '/lustmode <on|off|status>',
    example: '/lustmode on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/lust', '/lustmod'],
    scopes: ['group']
  },
  {
    command: '/mymemory',
    category: 'General',
    description: 'View your stored chatbot memory facts and personalized data for this chat.',
    syntax: '/mymemory',
    example: '/mymemory',
    permission: 'Everyone',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group', 'private']
  },
  {
    command: '/forgetme',
    category: 'General',
    description: 'Delete your stored chatbot memory facts and personalized data for this chat.',
    syntax: '/forgetme',
    example: '/forgetme',
    permission: 'Everyone',
    targetType: 'None',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'private']
  },

  // ==================== MODERATION ====================
  {
    command: '/ban',
    category: 'Moderation',
    description: 'Permanently ban a member from the group.',
    syntax: '/ban @username [reason]',
    example: '/ban @spammer Advertising links',
    permission: 'Admin',
    telegramPermission: 'can_restrict_members',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/unban',
    category: 'Moderation',
    description: 'Unban a previously banned member.',
    syntax: '/unban @username',
    example: '/unban @spammer',
    permission: 'Admin',
    telegramPermission: 'can_restrict_members',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/kick',
    category: 'Moderation',
    description: 'Remove a member from the group.',
    syntax: '/kick @username [reason]',
    example: '/kick @spammer Spam',
    permission: 'Admin',
    telegramPermission: 'can_restrict_members',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/mute',
    category: 'Moderation',
    description: 'Mute a member in the group.',
    syntax: '/mute @username [reason]',
    example: '/mute @spammer',
    permission: 'Admin',
    telegramPermission: 'can_restrict_members',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/unmute',
    category: 'Moderation',
    description: 'Unmute a muted member.',
    syntax: '/unmute @username',
    example: '/unmute @spammer',
    permission: 'Admin',
    telegramPermission: 'can_restrict_members',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/tmute',
    category: 'Moderation',
    description: 'Temporarily mute a member for a specified duration.',
    syntax: '/tmute <duration> @username [reason]',
    example: '/tmute 2h @spammer',
    permission: 'Admin',
    telegramPermission: 'can_restrict_members',
    targetType: 'Duration',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/tban',
    category: 'Moderation',
    description: 'Temporarily ban a member for a specified duration.',
    syntax: '/tban <duration> @username [reason]',
    example: '/tban 1d @spammer',
    permission: 'Admin',
    telegramPermission: 'can_restrict_members',
    targetType: 'Duration',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/dban',
    category: 'Moderation',
    description: 'Delete replied message and ban its sender.',
    syntax: '/dban [reason]',
    example: '/dban Scam message',
    permission: 'Admin',
    telegramPermission: 'can_restrict_members',
    targetType: 'Message',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/dmute',
    category: 'Moderation',
    description: 'Delete replied message and mute its sender.',
    syntax: '/dmute [reason]',
    example: '/dmute Spamming text',
    permission: 'Admin',
    telegramPermission: 'can_restrict_members',
    targetType: 'Message',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/dkick',
    category: 'Moderation',
    description: 'Delete replied message and kick its sender.',
    syntax: '/dkick [reason]',
    example: '/dkick Disruption',
    permission: 'Admin',
    telegramPermission: 'can_restrict_members',
    targetType: 'Message',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/sban',
    category: 'Moderation',
    description: 'Silently ban member and delete the triggering command message.',
    syntax: '/sban @username [reason]',
    example: '/sban @spammer',
    permission: 'Admin',
    telegramPermission: 'can_restrict_members',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/smute',
    category: 'Moderation',
    description: 'Silently mute member and delete the triggering command message.',
    syntax: '/smute @username [reason]',
    example: '/smute @spammer',
    permission: 'Admin',
    telegramPermission: 'can_restrict_members',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/skick',
    category: 'Moderation',
    description: 'Silently kick member and delete the triggering command message.',
    syntax: '/skick @username [reason]',
    example: '/skick @spammer',
    permission: 'Admin',
    telegramPermission: 'can_restrict_members',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },

  // ==================== WARNINGS ====================
  {
    command: '/warn',
    category: 'Warnings',
    description: 'Issue a formal warning to a member.',
    syntax: '/warn @username [reason]',
    example: '/warn @user123 Spamming',
    permission: 'Admin',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/warnings',
    category: 'Warnings',
    description: 'View active warning count and log for a member.',
    syntax: '/warnings @username',
    example: '/warnings @user123',
    permission: 'Admin',
    targetType: 'User',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group', 'admin']
  },
  {
    command: '/resetwarns',
    category: 'Warnings',
    description: 'Clear all active warnings for a member.',
    syntax: '/resetwarns @username',
    example: '/resetwarns @user123',
    permission: 'Admin',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/setwarnlimit',
    category: 'Warnings',
    description: 'Set warning threshold before automatic punitive action.',
    syntax: '/setwarnlimit <count> <ban|mute|kick>',
    example: '/setwarnlimit 3 ban',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/warnsettings',
    category: 'Warnings',
    description: 'Configure warning escalation thresholds, expiry duration, and actions.',
    syntax: '/warnsettings action <mute|ban|kick>',
    example: '/warnsettings action mute',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },

  // ==================== MESSAGE CLEANING ====================
  {
    command: '/del',
    category: 'Message Cleaning',
    description: 'Delete replied message.',
    syntax: '/del (reply to message)',
    example: '/del',
    permission: 'Admin',
    telegramPermission: 'can_delete_messages',
    targetType: 'Message',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/delete'],
    scopes: ['group', 'admin']
  },
  {
    command: '/clear',
    category: 'Message Cleaning',
    description: 'Purge recent messages by count, duration, or replied message.',
    syntax: '/clear [count|duration|@username]',
    example: '/clear 10',
    permission: 'Admin',
    telegramPermission: 'can_delete_messages',
    targetType: 'Duration',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/purge'],
    scopes: ['group', 'admin']
  },

  // ==================== MEDIA & STICKERS ====================
  {
    command: '/media',
    category: 'Media & Stickers',
    description: 'View or configure media protection toggles and action modes.',
    syntax: '/media [status]',
    example: '/media status',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group', 'admin']
  },
  {
    command: '/gif',
    category: 'Media & Stickers',
    description: 'Toggle GIF and animation protection filter (on/off).',
    syntax: '/gif <on|off>',
    example: '/gif off',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/gifs'],
    scopes: ['group', 'admin']
  },
  {
    command: '/image',
    category: 'Media & Stickers',
    description: 'Toggle photo and image protection filter (on/off).',
    syntax: '/image <on|off>',
    example: '/image off',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/images', '/photo', '/photos'],
    scopes: ['group', 'admin']
  },
  {
    command: '/file',
    category: 'Media & Stickers',
    description: 'Toggle document and file protection filter (on/off).',
    syntax: '/file <on|off>',
    example: '/file off',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/video',
    category: 'Media & Stickers',
    description: 'Toggle video and video note protection filter (on/off).',
    syntax: '/video <on|off>',
    example: '/video off',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/videos'],
    scopes: ['group', 'admin']
  },
  {
    command: '/voice',
    category: 'Media & Stickers',
    description: 'Toggle voice note protection filter (on/off).',
    syntax: '/voice <on|off>',
    example: '/voice off',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/audio',
    category: 'Media & Stickers',
    description: 'Toggle audio file and music protection filter (on/off).',
    syntax: '/audio <on|off>',
    example: '/audio off',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/stickers',
    category: 'Media & Stickers',
    description: 'List registered sticker packs and mood summary for this chat.',
    syntax: '/stickers [page]',
    example: '/stickers 1',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    aliases: ['/sticker'],
    scopes: ['group', 'admin']
  },
  {
    command: '/addstickerpack',
    category: 'Media & Stickers',
    description: 'Import entire sticker pack into bot media library by replying to a sticker or by pack name/link.',
    syntax: '/addstickerpack [mood] or <pack_name> [mood]',
    example: '/addstickerpack cute',
    permission: 'Admin',
    targetType: 'Message',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/addbulkstickers',
    category: 'Media & Stickers',
    description: 'Bulk import multiple Telegram sticker packs by links or names.',
    syntax: '/addbulkstickers <pack_link1> <pack_link2> ... [mood]',
    example: '/addbulkstickers https://t.me/addstickers/Animals cute',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/addbulksticker'],
    scopes: ['group', 'admin']
  },
  {
    command: '/addsticker',
    category: 'Media & Stickers',
    description: 'Save an individual sticker into bot media library by replying to it.',
    syntax: '/addsticker [mood]',
    example: '/addsticker cute',
    permission: 'Admin',
    targetType: 'Message',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/addgif',
    category: 'Media & Stickers',
    description: 'Add a GIF/animation to bot media library by replying to it.',
    syntax: '/addgif [mood]',
    example: '/addgif playful',
    permission: 'Admin',
    targetType: 'Message',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/liststickers',
    category: 'Media & Stickers',
    description: 'List stored stickers and GIFs in the media library.',
    syntax: '/liststickers',
    example: '/liststickers',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    aliases: ['/listgifs'],
    scopes: ['group', 'admin']
  },
  {
    command: '/removesticker',
    category: 'Media & Stickers',
    description: 'Remove a media item by file ID or reply.',
    syntax: '/removesticker <file_id>',
    example: '/removesticker CAACAgUAAxkBAAE...',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/removegif'],
    scopes: ['group', 'admin']
  },
  {
    command: '/stickerpackremove',
    category: 'Media & Stickers',
    description: 'Delete entire sticker pack by replying to a sticker or remove from current group.',
    syntax: '/stickerpackremove',
    example: '/stickerpackremove',
    permission: 'Admin',
    targetType: 'Message',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/delstickerpack', '/removestickerpack'],
    scopes: ['group', 'admin']
  },
  {
    command: '/clearstickers',
    category: 'Media & Stickers',
    description: 'Clear stored stickers and GIFs for a mood or all moods.',
    syntax: '/clearstickers [mood]',
    example: '/clearstickers cute',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/cleargifs'],
    scopes: ['group', 'admin']
  },
  {
    command: '/teststicker',
    category: 'Media & Stickers',
    description: 'Test direct Telegram sticker dispatch using a verified sticker file_id.',
    syntax: '/teststicker',
    example: '/teststicker',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/free',
    category: 'Media & Stickers',
    description: 'Exempt member from sticker and media restrictions.',
    syntax: '/free @username',
    example: '/free @trusted_user',
    permission: 'Admin',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/unfree',
    category: 'Media & Stickers',
    description: 'Revoke media exemption from member.',
    syntax: '/unfree @username',
    example: '/unfree @trusted_user',
    permission: 'Admin',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/freelist',
    category: 'Media & Stickers',
    description: 'List all media-exempted members.',
    syntax: '/freelist',
    example: '/freelist',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    aliases: ['/freed'],
    scopes: ['group', 'admin']
  },

  // ==================== LOCKS & WHITELIST ====================
  {
    command: '/lock',
    category: 'Locks & Whitelist',
    description: 'Lock a specific content type (stickers, gifs, links, media, etc.).',
    syntax: '/lock <type>',
    example: '/lock stickers',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/unlock',
    category: 'Locks & Whitelist',
    description: 'Unlock a specific content type.',
    syntax: '/unlock <type>',
    example: '/unlock stickers',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/locks',
    category: 'Locks & Whitelist',
    description: 'View active content locks for this group.',
    syntax: '/locks',
    example: '/locks',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    aliases: ['/locklist'],
    scopes: ['group', 'admin']
  },
  {
    command: '/link',
    category: 'Locks & Whitelist',
    description: 'Toggle general link protection filter (on/off).',
    syntax: '/link <on|off>',
    example: '/link off',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/links'],
    scopes: ['group', 'admin']
  },
  {
    command: '/linkallow',
    category: 'Locks & Whitelist',
    description: 'Whitelist allowed link domain or URL pattern.',
    syntax: '/linkallow <domain>',
    example: '/linkallow github.com',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/linkwhitelist', '/allowlink'],
    scopes: ['group', 'admin']
  },
  {
    command: '/linkunallow',
    category: 'Locks & Whitelist',
    description: 'Remove domain from link whitelist.',
    syntax: '/linkunallow <domain>',
    example: '/linkunallow github.com',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/linkdisallow', '/removelink'],
    scopes: ['group', 'admin']
  },
  {
    command: '/linkallowlist',
    category: 'Locks & Whitelist',
    description: 'List all whitelisted link domains.',
    syntax: '/linkallowlist',
    example: '/linkallowlist',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    aliases: ['/linkslist'],
    scopes: ['group', 'admin']
  },

  // ==================== SMART PROTECTION ====================
  {
    command: '/stopspam',
    category: 'Smart Protection',
    description: 'Toggle smart spam detection and removal.',
    syntax: '/stopspam <on|off>',
    example: '/stopspam on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/stopabusive',
    category: 'Smart Protection',
    description: 'Toggle abusive language filtering.',
    syntax: '/stopabusive <on|off>',
    example: '/stopabusive on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/stoppromotion',
    category: 'Smart Protection',
    description: 'Toggle promotional content and ad filtering.',
    syntax: '/stoppromotion <on|off>',
    example: '/stoppromotion on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/automod',
    category: 'Smart Protection',
    description: 'Toggle smart auto moderation (spam, abusive, promo).',
    syntax: '/automod <on|off|status>',
    example: '/automod on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/security',
    category: 'Smart Protection',
    description: 'Toggle unified security center (CAPTCHA & Anti-Raid).',
    syntax: '/security <on|off|status>',
    example: '/security on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/captcha',
    category: 'Smart Protection',
    description: 'Toggle join CAPTCHA verification for new members.',
    syntax: '/captcha <on|off>',
    example: '/captcha on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/antiraid',
    category: 'Smart Protection',
    description: 'Toggle anti-raid protection to safeguard against automated join floods.',
    syntax: '/antiraid <on|off>',
    example: '/antiraid on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/joinmode',
    category: 'Smart Protection',
    description: 'Set group join mode (normal, captcha, strict).',
    syntax: '/joinmode <normal|captcha|strict>',
    example: '/joinmode strict',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/autoaccept',
    category: 'Smart Protection',
    description: 'Toggle automatic approval for join requests.',
    syntax: '/autoaccept <on|off>',
    example: '/autoaccept on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/automation',
    category: 'Smart Protection',
    description: 'Manage custom automation trigger rules.',
    syntax: '/automation add <trigger> <action>',
    example: '/automation add spam delete',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/chatbot',
    category: 'Smart Protection',
    description: 'Toggle Roxie AI chatbot response integration in this group.',
    syntax: '/chatbot <on|off|status>',
    example: '/chatbot on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/protection',
    category: 'Smart Protection',
    description: 'Manage smart user protection status (on/off/status).',
    syntax: '/protection <on|off|status>',
    example: '/protection on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/roxiereaction',
    category: 'Smart Protection',
    description: 'Configure smart emoji reactions by Roxie (on/off/status/rate).',
    syntax: '/roxiereaction <on|off|status|rate 10-100>',
    example: '/roxiereaction on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/reaction'],
    scopes: ['group', 'admin']
  },

  // ==================== CUSTOM ABUSE ====================
  {
    command: '/addabuse',
    category: 'Custom Abuse',
    description: 'Add custom abusive word to group moderation dictionary.',
    syntax: '/addabuse <word>',
    example: '/addabuse offensiveword',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/removeabuse',
    category: 'Custom Abuse',
    description: 'Remove custom abusive word from group dictionary.',
    syntax: '/removeabuse <word>',
    example: '/removeabuse offensiveword',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/listabuse',
    category: 'Custom Abuse',
    description: 'List all custom abusive words registered for this group.',
    syntax: '/listabuse',
    example: '/listabuse',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group', 'admin']
  },
  {
    command: '/clearabuse',
    category: 'Custom Abuse',
    description: 'Clear all custom abusive words for this group.',
    syntax: '/clearabuse',
    example: '/clearabuse',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },

  // ==================== FLOOD CONTROL ====================
  {
    command: '/flood',
    category: 'Flood Control',
    description: 'Configure flood control message threshold, window, and action.',
    syntax: '/flood <count> <mute|ban|kick> or off',
    example: '/flood 5 mute',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/setflood', '/antiflood'],
    scopes: ['group', 'admin']
  },

  // ==================== FILTERS ====================
  {
    command: '/filter',
    category: 'Filters',
    description: 'Create custom auto-reply keyword filter.',
    syntax: '/filter <keyword> <reply text>',
    example: '/filter rules Read group rules.',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/unfilter',
    category: 'Filters',
    description: 'Remove a custom auto-reply keyword filter.',
    syntax: '/unfilter <keyword>',
    example: '/unfilter rules',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/stop'],
    scopes: ['group', 'admin']
  },
  {
    command: '/filters',
    category: 'Filters',
    description: 'List all active custom keyword filters.',
    syntax: '/filters',
    example: '/filters',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    aliases: ['/filterlist'],
    scopes: ['group', 'admin']
  },

  // ==================== REPORTS ====================
  {
    command: '/report',
    category: 'Reports',
    description: 'Report a message or spammer to group administrators.',
    syntax: '/report [reason]',
    example: '/report spam links',
    permission: 'Everyone',
    targetType: 'Message',
    isPublic: true,
    modifiesState: false,
    auditLogged: true,
    scopes: ['group']
  },

  // ==================== WELCOME & RULES ====================
  {
    command: '/welcome',
    category: 'Welcome & Rules',
    description: 'Toggle welcome messages on or off.',
    syntax: '/welcome <on|off>',
    example: '/welcome on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/setwelcome',
    category: 'Welcome & Rules',
    description: 'Configure custom welcome message template. Supports {first_name}, {username}, {mention}, {chat_title}, {id}.',
    syntax: '/setwelcome <message>',
    example: '/setwelcome Welcome {mention} to {chat_title}!',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/goodbye',
    category: 'Welcome & Rules',
    description: 'Toggle goodbye departure messages on or off.',
    syntax: '/goodbye <on|off>',
    example: '/goodbye on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/setgoodbye',
    category: 'Welcome & Rules',
    description: 'Configure custom goodbye message template. Supports {first_name}, {username}, {mention}, {chat_title}, {id}.',
    syntax: '/setgoodbye <message>',
    example: '/setgoodbye {mention} has left the chat.',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/autodeljoin',
    category: 'Welcome & Rules',
    description: 'Toggle auto-deletion of join/leave system messages after 3-4 seconds.',
    syntax: '/autodeljoin <on|off>',
    example: '/autodeljoin on',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/setrules',
    category: 'Welcome & Rules',
    description: 'Set group rules text.',
    syntax: '/setrules <rules text>',
    example: '/setrules 1. Be respectful to members',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/rules',
    category: 'Welcome & Rules',
    description: 'Display current group rules.',
    syntax: '/rules',
    example: '/rules',
    permission: 'Everyone',
    targetType: 'None',
    isPublic: true,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group']
  },
  {
    command: '/clearrules',
    category: 'Welcome & Rules',
    description: 'Clear group rules text.',
    syntax: '/clearrules',
    example: '/clearrules',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },

  // ==================== PIN MANAGEMENT ====================
  {
    command: '/pin',
    category: 'Pin Management',
    description: 'Pin replied message in chat.',
    syntax: '/pin',
    example: '/pin',
    permission: 'Admin',
    telegramPermission: 'can_pin_messages',
    targetType: 'Message',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/unpin',
    category: 'Pin Management',
    description: 'Unpin replied message in chat.',
    syntax: '/unpin',
    example: '/unpin',
    permission: 'Admin',
    telegramPermission: 'can_pin_messages',
    targetType: 'Message',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/unpinall',
    category: 'Pin Management',
    description: 'Unpin all pinned messages in chat.',
    syntax: '/unpinall',
    example: '/unpinall',
    permission: 'Admin',
    telegramPermission: 'can_pin_messages',
    targetType: 'None',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },

  // ==================== SLOW MODE ====================
  {
    command: '/slowmode',
    category: 'Slow Mode',
    description: 'Set chat slowmode interval between consecutive messages.',
    syntax: '/slowmode <seconds|off>',
    example: '/slowmode 30',
    permission: 'Admin',
    targetType: 'Config',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/slow'],
    scopes: ['group', 'admin']
  },

  // ==================== ADMIN & PERMISSIONS ====================
  {
    command: '/promote',
    category: 'Admin & Permissions',
    description: 'Promote a member to administrator.',
    syntax: '/promote @username',
    example: '/promote @admin2',
    permission: 'Owner',
    telegramPermission: 'can_promote_members',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/demote',
    category: 'Admin & Permissions',
    description: 'Demote an administrator back to regular member.',
    syntax: '/demote @username',
    example: '/demote @admin2',
    permission: 'Owner',
    telegramPermission: 'can_promote_members',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/permissions',
    category: 'Admin & Permissions',
    description: 'Open interactive administrator permission editor.',
    syntax: '/permissions @username',
    example: '/permissions @admin2',
    permission: 'Owner',
    telegramPermission: 'can_promote_members',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/setmod',
    category: 'Admin & Permissions',
    description: 'Assign custom bot moderator role to a member.',
    syntax: '/setmod @username',
    example: '/setmod @helper',
    permission: 'Admin',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/delmod',
    category: 'Admin & Permissions',
    description: 'Revoke custom bot moderator role from a member.',
    syntax: '/delmod @username',
    example: '/delmod @helper',
    permission: 'Admin',
    targetType: 'User',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },

  // ==================== AUDIT & LOGS ====================
  {
    command: '/adminlog',
    category: 'Audit & Logs',
    description: 'View recent moderation audit logs.',
    syntax: '/adminlog [limit]',
    example: '/adminlog 15',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    aliases: ['/modlog', '/logs'],
    scopes: ['group', 'admin']
  },

  // ==================== ANNOUNCEMENTS ====================
  {
    command: '/say',
    category: 'Announcements',
    description: 'Broadcast announcement as bot or reply to user. Preserves formatting, line breaks, and emojis.',
    syntax: '/say <message>',
    example: '/say Welcome everyone!\nHow are you today?',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    aliases: ['/announce'],
    scopes: ['group', 'admin']
  },
  {
    command: '/all',
    category: 'Announcements',
    description: 'Mention all known group members in broadcast. Preserves multiline text and paragraph breaks.',
    syntax: '/all [message]',
    example: '/all\n🔔 Important Notice\nTomorrow at 10 AM',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },

  // ==================== SCHEDULER ====================
  {
    command: '/schedule',
    category: 'Scheduler',
    description: 'Schedule recurring or one-shot announcements, reminders, or media.',
    syntax: '/schedule <interval> [message] (or reply to media with /schedule <interval> [caption])',
    example: '/schedule 10m Meeting starts soon.',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/listschedules',
    category: 'Scheduler',
    description: 'List active scheduled messages and jobs.',
    syntax: '/listschedules',
    example: '/listschedules',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group', 'admin']
  },
  {
    command: '/deleteschedule',
    category: 'Scheduler',
    description: 'Delete scheduled job by ID.',
    syntax: '/deleteschedule <id>',
    example: '/deleteschedule 12',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },

  // ==================== NOTES ====================
  {
    command: '/note',
    category: 'Notes',
    description: 'Save a group note.',
    syntax: '/note <name> <content>',
    example: '/note faq Link to FAQ',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },
  {
    command: '/getnote',
    category: 'Notes',
    description: 'Retrieve a group note.',
    syntax: '/getnote <name> or #name',
    example: '/getnote faq',
    permission: 'Everyone',
    targetType: 'Text',
    isPublic: true,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group']
  },
  {
    command: '/notes',
    category: 'Notes',
    description: 'List all saved group notes.',
    syntax: '/notes',
    example: '/notes',
    permission: 'Everyone',
    targetType: 'None',
    isPublic: true,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group']
  },
  {
    command: '/delnote',
    category: 'Notes',
    description: 'Delete a saved group note.',
    syntax: '/delnote <name>',
    example: '/delnote faq',
    permission: 'Admin',
    targetType: 'Text',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  },

  // ==================== CONFIGURATION ====================
  {
    command: '/exportconfig',
    category: 'Configuration',
    description: 'Export group settings and moderation rules as JSON.',
    syntax: '/exportconfig',
    example: '/exportconfig',
    permission: 'Admin',
    targetType: 'None',
    isPublic: false,
    modifiesState: false,
    auditLogged: false,
    scopes: ['group', 'admin']
  },
  {
    command: '/importconfig',
    category: 'Configuration',
    description: 'Import group settings and moderation rules from attached JSON document.',
    syntax: '/importconfig (reply to json)',
    example: '/importconfig',
    permission: 'Owner',
    targetType: 'Message',
    isPublic: false,
    modifiesState: true,
    auditLogged: true,
    scopes: ['group', 'admin']
  }
];

export function getCatalogItem(cmd: string): CommandCatalogItem | undefined {
  const normalized = (cmd.startsWith('/') ? cmd : `/${cmd}`).toLowerCase().split('@')[0];
  for (const item of COMMAND_CATALOG) {
    if (item.command.toLowerCase() === normalized) return item;
    if (item.aliases?.some(a => a.toLowerCase() === normalized)) return item;
  }
  return undefined;
}

export function getCatalogByCategory(category: string): CommandCatalogItem[] {
  return COMMAND_CATALOG.filter(item => item.category.toLowerCase() === category.toLowerCase());
}

export function getPublicCatalog(): CommandCatalogItem[] {
  return COMMAND_CATALOG.filter(item => item.permission === 'Everyone' || item.isPublic);
}

export function getAdminCatalog(): CommandCatalogItem[] {
  return COMMAND_CATALOG.filter(item => item.permission === 'Admin' || item.permission === 'Owner' || !item.isPublic);
}

export function getCommandsForTelegramScope(
  scope: 'all_chat_administrators' | 'all_group_chats' | 'all_private_chats' | 'default'
): Array<{ command: string; description: string }> {
  let filtered: CommandCatalogItem[] = [];

  switch (scope) {
    case 'all_chat_administrators':
      // Admin scope: All commands applicable in group or admin context (all group admin tools, moderation, config, settings)
      filtered = COMMAND_CATALOG.filter(item => {
        const scopes = item.scopes || ['group'];
        return scopes.includes('admin') || scopes.includes('group');
      });
      break;
    case 'all_group_chats':
      // Group scope: All commands valid in group for general members
      filtered = COMMAND_CATALOG.filter(item => {
        const scopes = item.scopes || ['group'];
        return scopes.includes('group') && item.permission === 'Everyone';
      });
      break;
    case 'all_private_chats':
      // Private scope: All commands valid in private chat
      filtered = COMMAND_CATALOG.filter(item => {
        const scopes = item.scopes || ['group'];
        return scopes.includes('private');
      });
      break;
    case 'default':
    default:
      // Default scope: General public commands
      filtered = COMMAND_CATALOG.filter(item => item.permission === 'Everyone');
      break;
  }

  // Official Telegram Bot API constraint: at most 100 commands per scope
  const TELEGRAM_MAX_COMMANDS_PER_SCOPE = 100;
  const seen = new Set<string>();
  const result: Array<{ command: string; description: string }> = [];

  for (const item of filtered) {
    const rawCmd = item.command.replace(/^\//, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32);
    if (rawCmd && !seen.has(rawCmd)) {
      seen.add(rawCmd);
      result.push({
        command: rawCmd,
        description: (item.description || 'Command').slice(0, 256)
      });
    }
    if (result.length >= TELEGRAM_MAX_COMMANDS_PER_SCOPE) {
      break;
    }
  }

  return result;
}

