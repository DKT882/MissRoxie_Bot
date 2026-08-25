/**
 * Centralized Telegram API Error Mapper.
 * Maps raw Telegram error codes and descriptions into clean, friendly user-facing messages.
 * Never exposes raw Telegram API errors to group chats.
 */

export function mapTelegramError(
  action: 'kick' | 'ban' | 'unban' | 'mute' | 'unmute' | 'tmute' | 'tban' | 'dban' | 'dmute' | 'dkick' | 'sban' | 'smute' | 'skick' | 'demote' | 'warn' | 'restrict' | 'delete' | 'promote' | 'permissions' | 'general',
  rawDescription?: string,
  errorCode?: number
): string {
  if (!rawDescription) {
    return `⚠️ Could not complete ${action} due to an unexpected Telegram error.`;
  }

  const desc = rawDescription.toUpperCase();

  // 1. Demotion / Promotion / Permission editing specific restrictions
  if (action === 'permissions' && (desc.includes('CANNOT_EDIT') || desc.includes('CANNOT_EDIT_THIS_USER') || desc.includes('USER_ADMIN_INVALID') || desc.includes('RIGHT_FORBIDDEN') || desc.includes('NOT_ENOUGH_RIGHTS'))) {
    return '❌ Telegram does not allow Roxie to modify this administrator.';
  }
  if (action === 'demote' && (desc.includes('DEMOTE') || desc.includes('USER_ADMIN_INVALID') || desc.includes('CANNOT_RESTRICT_ADMIN') || (desc.includes('NOT_ENOUGH_RIGHTS') && !desc.includes('CHAT_ADMIN_REQUIRED')))) {
    return '⚠️ The bot cannot demote this administrator because they were appointed by the group owner or another administrator.';
  }
  if (action === 'promote' && (desc.includes('CANNOT_PROMOTE') || desc.includes('RIGHT_FORBIDDEN') || desc.includes('ADMIN_RANK_INVALID') || desc.includes('NOT_ENOUGH_RIGHTS_TO_PROMOTE'))) {
    return '⚠️ Telegram rejected the promotion. The bot may lack sufficient administrative rights to promote this member.';
  }

  // 2. Missing bot admin permissions in the group
  if (
    desc.includes('CHAT_ADMIN_REQUIRED') ||
    desc.includes('NOT_ENOUGH_RIGHTS') ||
    desc.includes('NOT ENOUGH RIGHTS') ||
    desc.includes('NEED ADMIN RIGHTS') ||
    desc.includes('NEED_ADMIN_RIGHTS') ||
    desc.includes('BOT_CHATS_DISABLED')
  ) {
    if (action === 'demote' || action === 'promote' || action === 'permissions') {
      return '❌ The bot requires the "Add New Admins" administrator permission to modify admin rights.';
    }
    if (action === 'delete') {
      return '❌ The bot requires the "Delete Messages" permission to remove messages.';
    }
    return '❌ The bot lacks administrative permissions in this group. Please ensure the bot is an administrator with "Ban Users" privileges.';
  }

  // 2. User ID Invalid or Peer Invalid
  if (desc.includes('USER_ID_INVALID') || desc.includes('PEER_ID_INVALID') || desc.includes('USER_NOT_FOUND')) {
    return `⚠️ Invalid Telegram user ID. Please reply directly to the user's message and use /${action}`;
  }

  // 3. User is not in the group
  if (desc.includes('USER_NOT_PARTICIPANT') || desc.includes('PARTICIPANT_ID_INVALID')) {
    return '⚠️ That user is not currently a participant in this group.';
  }

  // 4. Cannot restrict/demote administrator (Telegram hierarchy rule)
  if (
    desc.includes('CANNOT_RESTRICT_ADMIN') ||
    desc.includes('NOT_ENOUGH_RIGHTS_TO_RESTRICT') ||
    desc.includes('ADMINISTRATOR') ||
    desc.includes('CAN\'T RESTRICT') ||
    desc.includes('CANNOT RESTRICT')
  ) {
    if (action === 'demote') {
      return '⚠️ The bot cannot demote this administrator because they were appointed by the group owner or another administrator.';
    }
    return '⚠️ Telegram does not allow restricting this administrator. Administrators cannot be restricted or banned by the bot.';
  }

  // 5. Rights already in state / not modified
  if (desc.includes('RIGHTS_NOT_MODIFIED') || desc.includes('CHAT_NOT_MODIFIED') || desc.includes('USER_ADMIN_INVALID')) {
    if (action === 'demote') {
      return '⚠️ That user is not currently an administrator or their rights are already revoked.';
    }
    if (action === 'unban') {
      return 'ℹ️ That user is already unbanned or not restricted.';
    }
    return 'ℹ️ The requested permission state is already in effect.';
  }

  // 6. Bot is not a member of chat
  if (desc.includes('BOT_NOT_A_MEMBER') || desc.includes('CHAT_WRITE_FORBIDDEN')) {
    return '❌ The bot is not a member of this chat or has been muted.';
  }

  // 7. Message invalid or expired
  if (desc.includes('MESSAGE_ID_INVALID') || desc.includes('MESSAGE_TO_DELETE_NOT_FOUND')) {
    return '⚠️ The referenced message could not be found or has already been deleted.';
  }

  // 8. User deactivated / deleted account
  if (desc.includes('USER_DEACTIVATED') || desc.includes('USER_DELETED')) {
    return '⚠️ That Telegram account has been deleted or deactivated.';
  }

  // 9. Bot targeting another bot or itself
  if (desc.includes('USER_IS_BOT') || desc.includes('BOT_METHOD_INVALID')) {
    return '⚠️ Telegram does not support this moderation action on bots.';
  }

  // 10. Rate limiting / Flood control
  if (desc.includes('FLOOD_WAIT') || desc.includes('TOO_MANY_REQUESTS')) {
    return '⏳ Telegram rate limit reached. Please wait a few seconds before trying again.';
  }

  // Default fallback without leaking raw technical traces
  return `⚠️ Moderation action failed: ${rawDescription}`;
}
