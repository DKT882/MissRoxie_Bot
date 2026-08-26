import { ADMIN_COMMANDS } from './commands.js';

export interface CommandCatalogItem {
  command: string;
  category: 'General' | 'Moderation' | 'Warnings' | 'Message Cleaning' | 'Links' | 'Media' | 'Locks' | 'Flood / Anti-Spam' | 'Filters' | 'Reports' | 'Welcome / Goodbye' | 'Pin Management' | 'Slow Mode' | 'Admin Permissions' | 'Audit' | 'Announcements' | 'Scheduler' | 'Notes' | 'Configuration' | 'Smart Protection' | 'Custom Abuse';
  description: string;
  syntax: string;
  example: string;
  permission: 'Everyone' | 'Admin' | 'Owner';
  telegramPermission?: string;
  targetType: 'None' | 'User' | 'Message' | 'Duration' | 'Text' | 'Config';
  isPublic: boolean;
  modifiesState: boolean;
  auditLogged: boolean;
}

export const COMMAND_CATALOG: CommandCatalogItem[] = [
  // General
  { command: '/help', category: 'General', description: "Show Roxie's command help.", syntax: '/help', example: '/help', permission: 'Everyone', targetType: 'None', isPublic: true, modifiesState: false, auditLogged: false },
  { command: '/start', category: 'General', description: 'Initialize bot conversation and welcome.', syntax: '/start', example: '/start', permission: 'Everyone', targetType: 'None', isPublic: true, modifiesState: false, auditLogged: false },
  { command: '/ping', category: 'General', description: 'Check bot responsiveness.', syntax: '/ping', example: '/ping', permission: 'Everyone', targetType: 'None', isPublic: true, modifiesState: false, auditLogged: false },
  { command: '/status', category: 'General', description: 'View bot status and group configuration.', syntax: '/status', example: '/status', permission: 'Admin', targetType: 'None', isPublic: false, modifiesState: false, auditLogged: false },
  { command: '/settings', category: 'General', description: 'View current group security settings.', syntax: '/settings', example: '/settings', permission: 'Admin', targetType: 'None', isPublic: false, modifiesState: false, auditLogged: false },
  { command: '/live', category: 'General', description: 'Check live operational status.', syntax: '/live', example: '/live', permission: 'Everyone', targetType: 'None', isPublic: true, modifiesState: false, auditLogged: false },

  // Moderation
  { command: '/ban', category: 'Moderation', description: 'Permanently ban a member from the group.', syntax: '/ban @username [reason]', example: '/ban @spammer Advertising links', permission: 'Admin', telegramPermission: 'can_restrict_members', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/unban', category: 'Moderation', description: 'Unban a previously banned member.', syntax: '/unban @username', example: '/unban @spammer', permission: 'Admin', telegramPermission: 'can_restrict_members', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/kick', category: 'Moderation', description: 'Remove a member from the group.', syntax: '/kick @username [reason]', example: '/kick @spammer Spam', permission: 'Admin', telegramPermission: 'can_restrict_members', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/mute', category: 'Moderation', description: 'Mute a member in the group.', syntax: '/mute @username [reason]', example: '/mute @spammer', permission: 'Admin', telegramPermission: 'can_restrict_members', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/unmute', category: 'Moderation', description: 'Unmute a muted member.', syntax: '/unmute @username', example: '/unmute @spammer', permission: 'Admin', telegramPermission: 'can_restrict_members', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/tmute', category: 'Moderation', description: 'Temporarily mute a member.', syntax: '/tmute <duration> @username [reason]', example: '/tmute 2h @spammer', permission: 'Admin', telegramPermission: 'can_restrict_members', targetType: 'Duration', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/tban', category: 'Moderation', description: 'Temporarily ban a member.', syntax: '/tban <duration> @username [reason]', example: '/tban 1d @spammer', permission: 'Admin', telegramPermission: 'can_restrict_members', targetType: 'Duration', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/dban', category: 'Moderation', description: 'Delete replied message and ban sender.', syntax: '/dban [reason]', example: '/dban Scam', permission: 'Admin', telegramPermission: 'can_restrict_members', targetType: 'Message', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/dmute', category: 'Moderation', description: 'Delete replied message and mute sender.', syntax: '/dmute [reason]', example: '/dmute Spam', permission: 'Admin', telegramPermission: 'can_restrict_members', targetType: 'Message', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/dkick', category: 'Moderation', description: 'Delete replied message and kick sender.', syntax: '/dkick [reason]', example: '/dkick', permission: 'Admin', telegramPermission: 'can_restrict_members', targetType: 'Message', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/sban', category: 'Moderation', description: 'Silently ban user and delete command.', syntax: '/sban @username [reason]', example: '/sban @spammer', permission: 'Admin', telegramPermission: 'can_restrict_members', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/smute', category: 'Moderation', description: 'Silently mute user and delete command.', syntax: '/smute @username [reason]', example: '/smute @spammer', permission: 'Admin', telegramPermission: 'can_restrict_members', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/skick', category: 'Moderation', description: 'Silently kick user and delete command.', syntax: '/skick @username [reason]', example: '/skick @spammer', permission: 'Admin', telegramPermission: 'can_restrict_members', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },

  // Warnings
  { command: '/warn', category: 'Warnings', description: 'Issue a warning to a member.', syntax: '/warn @username [reason]', example: '/warn @user123 Spamming', permission: 'Admin', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/warnings', category: 'Warnings', description: 'View warnings for a member.', syntax: '/warnings @username', example: '/warnings @user123', permission: 'Admin', targetType: 'User', isPublic: false, modifiesState: false, auditLogged: false },
  { command: '/resetwarns', category: 'Warnings', description: 'Clear all warnings for a member.', syntax: '/resetwarns @username', example: '/resetwarns @user123', permission: 'Admin', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/setwarnlimit', category: 'Warnings', description: 'Set warning threshold before auto-action.', syntax: '/setwarnlimit <count> <ban|mute|kick>', example: '/setwarnlimit 3 ban', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },

  // Message Cleaning
  { command: '/del', category: 'Message Cleaning', description: 'Delete replied message.', syntax: '/del (reply to message)', example: '/del', permission: 'Admin', telegramPermission: 'can_delete_messages', targetType: 'Message', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/clear', category: 'Message Cleaning', description: 'Purge recent messages or duration.', syntax: '/clear [count|duration|@username]', example: '/clear 10', permission: 'Admin', telegramPermission: 'can_delete_messages', targetType: 'Duration', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/purge', category: 'Message Cleaning', description: 'Purge messages from replied message onwards.', syntax: '/purge (reply to start)', example: '/purge', permission: 'Admin', telegramPermission: 'can_delete_messages', targetType: 'Message', isPublic: false, modifiesState: true, auditLogged: true },

  // Welcome / Goodbye
  { command: '/welcome', category: 'Welcome / Goodbye', description: 'Toggle welcome messages on or off.', syntax: '/welcome <on|off>', example: '/welcome on', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/setwelcome', category: 'Welcome / Goodbye', description: 'Configure custom welcome message template. Supports {first_name}, {username}, {mention}, {chat_title}, {id}.', syntax: '/setwelcome <message>', example: '/setwelcome Welcome {mention} to {chat_title}!', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/goodbye', category: 'Welcome / Goodbye', description: 'Toggle goodbye messages on or off.', syntax: '/goodbye <on|off>', example: '/goodbye on', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/setgoodbye', category: 'Welcome / Goodbye', description: 'Configure custom goodbye message template. Supports {first_name}, {username}, {mention}, {chat_title}, {id}.', syntax: '/setgoodbye <message>', example: '/setgoodbye {mention} has left the chat.', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/autodeljoin', category: 'Welcome / Goodbye', description: 'Toggle auto-deletion of join/leave system messages after 3-4 seconds.', syntax: '/autodeljoin <on|off>', example: '/autodeljoin on', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },

  // Pin Management
  { command: '/pin', category: 'Pin Management', description: 'Pin replied message in chat.', syntax: '/pin', example: '/pin', permission: 'Admin', telegramPermission: 'can_pin_messages', targetType: 'Message', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/unpin', category: 'Pin Management', description: 'Unpin replied message.', syntax: '/unpin', example: '/unpin', permission: 'Admin', telegramPermission: 'can_pin_messages', targetType: 'Message', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/unpinall', category: 'Pin Management', description: 'Unpin all pinned messages in chat.', syntax: '/unpinall', example: '/unpinall', permission: 'Admin', telegramPermission: 'can_pin_messages', targetType: 'None', isPublic: false, modifiesState: true, auditLogged: true },

  // Slow Mode
  { command: '/slowmode', category: 'Slow Mode', description: 'Set chat slowmode interval between messages.', syntax: '/slowmode <seconds|off>', example: '/slowmode 30', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },

  // Media & Media Exemptions
  { command: '/gif', category: 'Media', description: 'Toggle GIF protection filter (on/off).', syntax: '/gif <on|off>', example: '/gif off', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/link', category: 'Media', description: 'Toggle link protection filter (on/off).', syntax: '/link <on|off>', example: '/link off', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/image', category: 'Media', description: 'Toggle image/photo protection filter (on/off).', syntax: '/image <on|off>', example: '/image off', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/file', category: 'Media', description: 'Toggle file protection filter (on/off).', syntax: '/file <on|off>', example: '/file off', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/sticker', category: 'Media', description: 'Toggle sticker protection filter (on/off).', syntax: '/sticker <on|off>', example: '/sticker off', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/free', category: 'Media', description: 'Exempt member from sticker/media restrictions.', syntax: '/free @username', example: '/free @trusted_user', permission: 'Admin', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/unfree', category: 'Media', description: 'Revoke media exemption from member.', syntax: '/unfree @username', example: '/unfree @trusted_user', permission: 'Admin', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/freelist', category: 'Media', description: 'List all media-exempted members.', syntax: '/freelist', example: '/freelist', permission: 'Admin', targetType: 'None', isPublic: false, modifiesState: false, auditLogged: false },

  // Links Whitelist
  { command: '/linkallow', category: 'Links', description: 'Whitelist allowed link domain or URL.', syntax: '/linkallow <domain>', example: '/linkallow github.com', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/linkunallow', category: 'Links', description: 'Remove domain from link whitelist.', syntax: '/linkunallow <domain>', example: '/linkunallow github.com', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/linkallowlist', category: 'Links', description: 'List all whitelisted link domains.', syntax: '/linkallowlist', example: '/linkallowlist', permission: 'Admin', targetType: 'None', isPublic: false, modifiesState: false, auditLogged: false },

  // Locks
  { command: '/lock', category: 'Locks', description: 'Lock a specific content type.', syntax: '/lock <type>', example: '/lock stickers', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/unlock', category: 'Locks', description: 'Unlock a specific content type.', syntax: '/unlock <type>', example: '/unlock stickers', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/locks', category: 'Locks', description: 'View active content locks.', syntax: '/locks', example: '/locks', permission: 'Admin', targetType: 'None', isPublic: false, modifiesState: false, auditLogged: false },

  // Smart Protection
  { command: '/stopspam', category: 'Smart Protection', description: 'Toggle smart spam detection and removal.', syntax: '/stopspam <on|off>', example: '/stopspam on', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/stopabusive', category: 'Smart Protection', description: 'Toggle abusive language filtering.', syntax: '/stopabusive <on|off>', example: '/stopabusive on', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/stoppromotion', category: 'Smart Protection', description: 'Toggle promotional content and ad filtering.', syntax: '/stoppromotion <on|off>', example: '/stoppromotion on', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },

  // Custom Abuse
  { command: '/addabuse', category: 'Custom Abuse', description: 'Add custom abusive word to group dictionary.', syntax: '/addabuse <word>', example: '/addabuse idiocy', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/removeabuse', category: 'Custom Abuse', description: 'Remove custom abusive word from group dictionary.', syntax: '/removeabuse <word>', example: '/removeabuse idiocy', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/listabuse', category: 'Custom Abuse', description: 'List all custom abusive words for group.', syntax: '/listabuse', example: '/listabuse', permission: 'Admin', targetType: 'None', isPublic: false, modifiesState: false, auditLogged: false },
  { command: '/clearabuse', category: 'Custom Abuse', description: 'Clear all custom abusive words for group.', syntax: '/clearabuse', example: '/clearabuse', permission: 'Admin', targetType: 'None', isPublic: false, modifiesState: true, auditLogged: true },

  // Flood / Anti-Spam
  { command: '/flood', category: 'Flood / Anti-Spam', description: 'Configure flood control threshold and action.', syntax: '/flood <count> <mute|ban|kick> or off', example: '/flood 5 mute', permission: 'Admin', targetType: 'Config', isPublic: false, modifiesState: true, auditLogged: true },

  // Filters
  { command: '/filter', category: 'Filters', description: 'Create custom auto-reply filter.', syntax: '/filter <keyword> <reply text>', example: '/filter rules Read group rules.', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/unfilter', category: 'Filters', description: 'Remove a custom filter.', syntax: '/unfilter <keyword>', example: '/unfilter rules', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/filters', category: 'Filters', description: 'List all custom filters.', syntax: '/filters', example: '/filters', permission: 'Admin', targetType: 'None', isPublic: false, modifiesState: false, auditLogged: false },

  // Reports
  { command: '/report', category: 'Reports', description: 'Report a suspicious message to admins.', syntax: '/report [reason]', example: '/report scam links', permission: 'Everyone', targetType: 'Message', isPublic: true, modifiesState: false, auditLogged: true },

  // Admin Permissions
  { command: '/promote', category: 'Admin Permissions', description: 'Promote a member to administrator.', syntax: '/promote @username', example: '/promote @admin2', permission: 'Owner', telegramPermission: 'can_promote_members', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/demote', category: 'Admin Permissions', description: 'Demote an administrator.', syntax: '/demote @username', example: '/demote @admin2', permission: 'Owner', telegramPermission: 'can_promote_members', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/permissions', category: 'Admin Permissions', description: 'Open interactive admin permission editor.', syntax: '/permissions @username', example: '/permissions @admin2', permission: 'Owner', telegramPermission: 'can_promote_members', targetType: 'User', isPublic: false, modifiesState: true, auditLogged: true },

  // Audit
  { command: '/adminlog', category: 'Audit', description: 'View recent moderation audit logs.', syntax: '/adminlog [limit]', example: '/adminlog 15', permission: 'Admin', targetType: 'None', isPublic: false, modifiesState: false, auditLogged: false },

  // Announcements
  { command: '/say', category: 'Announcements', description: 'Broadcast announcement as bot or reply to user.', syntax: '/say <message>', example: '/say Welcome everyone!', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/all', category: 'Announcements', description: 'Mention all known group members in broadcast.', syntax: '/all [message]', example: '/all Meeting starts at 6 PM', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },

  // Scheduler
  { command: '/schedule', category: 'Scheduler', description: 'Schedule a recurring/one-shot message.', syntax: '/schedule <interval> <message>', example: '/schedule 2h Meeting time!', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/listschedules', category: 'Scheduler', description: 'List active scheduled messages.', syntax: '/listschedules', example: '/listschedules', permission: 'Admin', targetType: 'None', isPublic: false, modifiesState: false, auditLogged: false },
  { command: '/deleteschedule', category: 'Scheduler', description: 'Delete scheduled job by ID.', syntax: '/deleteschedule <id>', example: '/deleteschedule 12', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },

  // Notes
  { command: '/note', category: 'Notes', description: 'Save a group note.', syntax: '/note <name> <content>', example: '/note faq Link to FAQ', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },
  { command: '/getnote', category: 'Notes', description: 'Retrieve a group note.', syntax: '/getnote <name> or #name', example: '/getnote faq', permission: 'Everyone', targetType: 'Text', isPublic: true, modifiesState: false, auditLogged: false },
  { command: '/notes', category: 'Notes', description: 'List all group notes.', syntax: '/notes', example: '/notes', permission: 'Everyone', targetType: 'None', isPublic: true, modifiesState: false, auditLogged: false },
  { command: '/delnote', category: 'Notes', description: 'Delete a group note.', syntax: '/delnote <name>', example: '/delnote faq', permission: 'Admin', targetType: 'Text', isPublic: false, modifiesState: true, auditLogged: true },

  // Configuration
  { command: '/exportconfig', category: 'Configuration', description: 'Export group settings as JSON.', syntax: '/exportconfig', example: '/exportconfig', permission: 'Admin', targetType: 'None', isPublic: false, modifiesState: false, auditLogged: false },
  { command: '/importconfig', category: 'Configuration', description: 'Import group settings from JSON.', syntax: '/importconfig (reply to json)', example: '/importconfig', permission: 'Owner', targetType: 'Message', isPublic: false, modifiesState: true, auditLogged: true }
];
