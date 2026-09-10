import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShieldCheck, 
  AlertCircle, 
  RefreshCw, 
  Bot, 
  Terminal, 
  Settings, 
  ListChecks, 
  Lock, 
  Activity, 
  Shield, 
  Ban, 
  UserX, 
  AlertTriangle, 
  Smile, 
  Calendar, 
  Flag, 
  Volume2, 
  Search, 
  Download, 
  CheckCircle2, 
  ChevronRight, 
  Users, 
  Layers,
  Database,
  Sliders,
  X,
  MessageSquare,
  Send,
  Radio,
  Sun,
  Moon,
  LogOut,
  Check,
  ArrowLeft,
  Heart,
  FileText,
  Sparkles,
  Plus,
  Trash2,
  Eye,
  Clock,
  SlidersHorizontal,
  ExternalLink,
  Reply,
  Loader2,
  Globe,
  Flame,
  Zap,
  UserCheck,
  UserMinus,
  Settings2,
  Upload,
  Copy,
  FileCode
} from 'lucide-react';

const LIVE_TESTS = [
  { id: 'LIVE-01', title: 'Bot responds to /ping' },
  { id: 'LIVE-02', title: '/help works' },
  { id: 'LIVE-03', title: 'Normal member cannot execute /ban' },
  { id: 'LIVE-04', title: 'Admin can execute /ban' },
  { id: 'LIVE-05', title: 'Admin can execute /kick' },
  { id: 'LIVE-06', title: 'Admin can execute /mute' },
  { id: 'LIVE-07', title: 'Admin can execute /warn' },
  { id: 'LIVE-08', title: '/warnings works' },
  { id: 'LIVE-09', title: '/clear works' },
  { id: 'LIVE-10', title: '/del works' },
  { id: 'LIVE-11', title: '/report works for normal member' },
  { id: 'LIVE-12', title: '/report reaches admins' },
  { id: 'LIVE-13', title: '/links off deletes links' },
  { id: 'LIVE-14', title: '/stickers off deletes stickers' },
  { id: 'LIVE-15', title: '/free bypass works' },
  { id: 'LIVE-16', title: '/lock polls works' },
  { id: 'LIVE-17', title: '/unlock polls works' },
  { id: 'LIVE-18', title: '/flood works' },
  { id: 'LIVE-19', title: '/filter works' },
  { id: 'LIVE-20', title: '/welcome works' },
  { id: 'LIVE-21', title: '/goodbye works' },
  { id: 'LIVE-22', title: '/pin works' },
  { id: 'LIVE-23', title: '/slowmode works' },
  { id: 'LIVE-24', title: '/promote works' },
  { id: 'LIVE-25', title: '/demote works' },
  { id: 'LIVE-26', title: '/permissions UI works' },
  { id: 'LIVE-27', title: 'Anonymous admin works' },
  { id: 'LIVE-28', title: 'Owner cannot be moderated' },
  { id: 'LIVE-29', title: 'Admin cannot moderate another admin' },
  { id: 'LIVE-30', title: 'Self-target protection works' },
  { id: 'LIVE-31', title: 'Bot-target protection works' },
  { id: 'LIVE-32', title: 'Anti-raid triggers correctly' },
  { id: 'LIVE-33', title: 'CAPTCHA appears for new member' },
  { id: 'LIVE-34', title: 'CAPTCHA verification succeeds' },
  { id: 'LIVE-35', title: 'CAPTCHA failure/expiry works' },
  { id: 'LIVE-36', title: '#note shortcut works' },
  { id: 'LIVE-37', title: '/note works' },
  { id: 'LIVE-38', title: '/getnote works' },
  { id: 'LIVE-39', title: '/delnote works' },
  { id: 'LIVE-40', title: '/exportconfig works' },
  { id: 'LIVE-41', title: '/importconfig works' },
  { id: 'LIVE-42', title: 'Scheduled message executes' },
  { id: 'LIVE-43', title: 'Scheduler survives restart' },
  { id: 'LIVE-44', title: 'Multi-group isolation works' },
  { id: 'LIVE-45', title: 'Rate limiter works for normal member' },
  { id: 'LIVE-46', title: 'Admin bypasses rate limiter' },
];

interface ModerationLog {
  id: string;
  chatId: number;
  chatTitle?: string;
  targetUserId?: number;
  targetUsername?: string;
  adminUserId?: number;
  adminUsername?: string;
  action: string;
  reason?: string;
  details?: string;
  timestamp: string;
}

interface GroupInfo {
  chatId: number;
  chatTitle: string;
  chatType: string;
  username?: string;
  memberCount: number;
  status: string;
  botRole?: string;
  protectionStatus?: boolean;
  lustMode?: boolean;
  botLeft?: boolean;
  unavailable?: boolean;
  unavailableReason?: string;
  stats: {
    bans: number;
    kicks: number;
    mutes: number;
    reports: number;
    schedules: number;
  };
  settings: any;
}

interface CommandItem {
  command: string;
  category: string;
  description: string;
  syntax: string;
  example: string;
  permission: string;
  telegramPermission?: string;
  targetType: string;
  isPublic: boolean;
  modifiesState: boolean;
  auditLogged: boolean;
}

interface PrivateChatSummary {
  chatId: number | string;
  userId: number;
  username?: string;
  name?: string;
  language?: string;
  lastUpdated: number;
  messageCount: number;
  lastMessage?: string;
}

function StickerPreview({
  mediaFileId,
  content,
  isDark = true
}: {
  mediaFileId?: string;
  content?: string;
  isDark?: boolean;
}) {
  const [loadError, setLoadError] = useState(false);
  const isVideo = content?.includes('[Video]');

  if (!mediaFileId || loadError) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${isDark ? 'bg-pink-500/10 text-pink-300 border-pink-500/20' : 'bg-pink-500/10 text-pink-400 border border-pink-500/20'} text-xs font-medium`}>
        <span>{content || '🎨 Sticker'}</span>
      </div>
    );
  }

  const fileUrl = `/api/telegram/file/${encodeURIComponent(mediaFileId)}`;

  return (
    <div className="flex flex-col items-start gap-1 pt-0.5">
      <div className="relative group/sticker rounded-xl overflow-hidden bg-black/5 p-1 border border-white/5">
        {isVideo ? (
          <video
            src={fileUrl}
            autoPlay
            loop
            muted
            playsInline
            onError={() => setLoadError(true)}
            className="w-24 h-24 max-w-[120px] max-h-[120px] object-contain rounded-lg transition-transform duration-200 hover:scale-105"
          />
        ) : (
          <img
            src={fileUrl}
            alt={content || 'Sticker'}
            onError={() => setLoadError(true)}
            loading="lazy"
            className="w-24 h-24 max-w-[120px] max-h-[120px] object-contain rounded-lg transition-transform duration-200 hover:scale-105"
          />
        )}
      </div>
      {content && (
        <span className="text-[10px] text-pink-400/80 font-mono tracking-wide px-1">
          {content.replace('🎨 Sticker', '🎨').trim()}
        </span>
      )}
    </div>
  );
}

export default function App() {
  // Theme state: dark vs light
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('roxie_theme') as 'dark' | 'light') || 'dark';
    } catch {
      return 'dark';
    }
  });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('roxie_theme', next);
    } catch {}
  };

  const isDark = theme === 'dark';

  // Navigation
  const [activeNav, setActiveNav] = useState<string>('overview');
  const [selectedChatId, setSelectedChatId] = useState<number | 'all'>('all');
  const [activeGroupDetailId, setActiveGroupDetailId] = useState<number | null>(null);
  const [groupDetailTab, setGroupDetailTab] = useState<
    | 'overview'
    | 'general'
    | 'moderation'
    | 'content_protection'
    | 'ai_conversation'
    | 'lust_mode'
    | 'stickers'
    | 'auto_response'
    | 'auto_sticker'
    | 'slowmode'
    | 'abuse_words'
    | 'members'
    | 'moderators'
    | 'telegram_permissions'
    | 'commands'
    | 'messages'
    | 'activity'
    | 'danger_zone'
    | 'backup'
    | 'settings'
    | 'permissions'
    | 'schedules'
  >('overview');

  // Scheduled Messages & Rules State
  const [schedulesList, setSchedulesList] = useState<any[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState<boolean>(false);
  const [schedulesFilterChatId, setSchedulesFilterChatId] = useState<number | 'all'>('all');
  const [showCreateScheduleModal, setShowCreateScheduleModal] = useState<boolean>(false);
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [newScheduleForm, setNewScheduleForm] = useState<{
    chatId: number | string;
    name: string;
    message: string;
    scheduleType: 'one_time' | 'daily' | 'weekly' | 'interval' | 'custom';
    intervalStr: string;
    nextRunDate: string;
    nextRunTime: string;
    timezone: string;
    contentType: string;
    mediaFileId: string;
    replyToMessageId: string;
    enabled: boolean;
  }>({
    chatId: '',
    name: '',
    message: '',
    scheduleType: 'interval',
    intervalStr: '1h',
    nextRunDate: new Date().toISOString().split('T')[0],
    nextRunTime: '12:00',
    timezone: 'UTC',
    contentType: 'text',
    mediaFileId: '',
    replyToMessageId: '',
    enabled: true
  });

  // Group Automations State
  const [groupAutomationsList, setGroupAutomationsList] = useState<any[]>([]);
  const [automationsLoading, setAutomationsLoading] = useState<boolean>(false);
  const [showCreateAutomationModal, setShowCreateAutomationModal] = useState<boolean>(false);
  const [newAutomationForm, setNewAutomationForm] = useState<{
    trigger: string;
    action: string;
    parameters: string;
    enabled: boolean;
  }>({
    trigger: 'spam_detected',
    action: 'delete_message',
    parameters: '',
    enabled: true
  });

  // Global Settings state
  const [globalSettings, setGlobalSettings] = useState<any>({
    botEnabled: true,
    aiConversationEnabled: true,
    globalModerationEnabled: true,
    globalStickersEnabled: true,
    globalAutoResponseEnabled: true,
    globalAutoStickerEnabled: true,
    globalLustModeAvailable: true,
    globalLoggingEnabled: true,
    maintenanceMode: false
  });
  const [savingGlobal, setSavingGlobal] = useState<boolean>(false);

  // Backup & Restore states
  const [backupEditorJson, setBackupEditorJson] = useState<string>('');
  const [backupEditorError, setBackupEditorError] = useState<string | null>(null);
  const [backupEditorSuccess, setBackupEditorSuccess] = useState<string | null>(null);
  const [backupImportJson, setBackupImportJson] = useState<string>('');
  const [backupImportSelectedSections, setBackupImportSelectedSections] = useState<string[]>([
    'settings', 'welcome', 'moderation', 'contentProtection', 'abuseWords',
    'stickers', 'lustMode', 'autoResponse', 'autoSticker', 'slowmode',
    'personality', 'schedules', 'notes'
  ]);
  const [backupOverrideChatId, setBackupOverrideChatId] = useState<boolean>(false);
  const [backupDiffPreview, setBackupDiffPreview] = useState<any | null>(null);
  const [backupHistoryList, setBackupHistoryList] = useState<any[]>([]);
  const [backupNotification, setBackupNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [backupLoading, setBackupLoading] = useState<boolean>(false);
  const [copiedJsonToast, setCopiedJsonToast] = useState<boolean>(false);
  const [botBackupJson, setBotBackupJson] = useState<string>('');
  const [botBackupNotification, setBotBackupNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [botBackupLoading, setBotBackupLoading] = useState<boolean>(false);

  // Group Full Management States
  const [groupAbuseWords, setGroupAbuseWords] = useState<string[]>([]);
  const [newAbuseWordInput, setNewAbuseWordInput] = useState<string>('');
  const [abuseSearch, setAbuseSearch] = useState<string>('');
  const [debouncedAbuseSearch, setDebouncedAbuseSearch] = useState<string>('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAbuseSearch(abuseSearch), 400);
    return () => clearTimeout(t);
  }, [abuseSearch]);

  const [groupMembersList, setGroupMembersList] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState<string>('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedMemberSearch(memberSearch), 400);
    return () => clearTimeout(t);
  }, [memberSearch]);
  const [groupLustUsers, setGroupLustUsers] = useState<any[]>([]);
  const [slowmodeInput, setSlowmodeInput] = useState<number>(0);
  const [slowmodeFeedback, setSlowmodeFeedback] = useState<string | null>(null);
  const [applyingSlowmode, setApplyingSlowmode] = useState<boolean>(false);
  const [memberActionLoading, setMemberActionLoading] = useState<Record<string, boolean>>({});
  const [memberActionFeedback, setMemberActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [dangerConfirmInput, setDangerConfirmInput] = useState<string>('');
  const [dangerModal, setDangerModal] = useState<'reset_settings' | 'clear_memory' | 'clear_stickers' | 'clear_abuse' | null>(null);
  const [executingDangerAction, setExecutingDangerAction] = useState<boolean>(false);

  // Core Data states
  const [overview, setOverview] = useState<any | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [groupDetails, setGroupDetails] = useState<any | null>(null);
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [privateChats, setPrivateChats] = useState<PrivateChatSummary[]>([]);
  const [activePrivateChatId, setActivePrivateChatId] = useState<number | string | null>(null);
  const [privateChatMessages, setPrivateChatMessages] = useState<any[]>([]);
  const [privateReplyText, setPrivateReplyText] = useState<string>('');
  const [sendingPrivateReply, setSendingPrivateReply] = useState<boolean>(false);

  // Group moderators & permissions & stickers
  const [groupModerators, setGroupModerators] = useState<any | null>(null);
  const [groupPermissionsData, setGroupPermissionsData] = useState<any | null>(null);
  const [groupStickersData, setGroupStickersData] = useState<any | null>(null);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Sticker Pack Management Modals
  const [showAddPackModal, setShowAddPackModal] = useState<boolean>(false);
  const [newPackInput, setNewPackInput] = useState<string>('');
  const [addingPack, setAddingPack] = useState<boolean>(false);
  const [addPackError, setAddPackError] = useState<string | null>(null);
  const [previewPack, setPreviewPack] = useState<any | null>(null);
  const [removePackModal, setRemovePackModal] = useState<any | null>(null);
  const [removingPack, setRemovingPack] = useState<boolean>(false);

  // Send Message Modal / Action
  const [sendTargetType, setSendTargetType] = useState<'group' | 'private'>('group');
  const [sendTargetId, setSendTargetId] = useState<string>('');
  const [sendMessageContent, setSendMessageContent] = useState<string>('');
  const [sendingMessage, setSendingMessage] = useState<boolean>(false);
  const [sendResult, setSendResult] = useState<any | null>(null);

  // Group Messages Direct Composer & Reply-to-User State
  const [groupComposerText, setGroupComposerText] = useState<string>('');
  const [groupReplyTarget, setGroupReplyTarget] = useState<any | null>(null);
  const [sendingGroupMessage, setSendingGroupMessage] = useState<boolean>(false);
  const [groupMessageFeedback, setGroupMessageFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Broadcast Action
  const [broadcastSelectedGroups, setBroadcastSelectedGroups] = useState<number[]>([]);
  const [broadcastContent, setBroadcastContent] = useState<string>('');
  const [broadcasting, setBroadcasting] = useState<boolean>(false);
  const [broadcastResult, setBroadcastResult] = useState<any | null>(null);
  const [showBroadcastConfirm, setShowBroadcastConfirm] = useState<boolean>(false);

  // Leave Group Modal
  const [leaveModalGroup, setLeaveModalGroup] = useState<GroupInfo | null>(null);
  const [leaveConfirmInput, setLeaveConfirmInput] = useState<string>('');
  const [leavingGroup, setLeavingGroup] = useState<boolean>(false);

  // Search & Filters (Debounced 400ms)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [dateFilter, setDateFilter] = useState<string>('24h');
  const [logFilterType, setLogFilterType] = useState<string>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<ModerationLog | null>(null);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<any | null>(null);
  const [healthData, setHealthData] = useState<any | null>(null);
  
  // Stickers View Filter
  const [stickerTab, setStickerTab] = useState<'all' | 'custom' | 'lust' | 'default'>('all');
  const [globalStickersData, setGlobalStickersData] = useState<any | null>(null);

  // Autosave Debounce & Batching Engine (1500ms)
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
  const pendingSettingsBatchRef = useRef<Record<string, any>>({});
  const settingsDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const settingsSaveStatusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSettingsSentTimestampRef = useRef<number>(0);

  // Enterprise Operator Authentication State
  const [session, setSession] = useState<{ sessionId: string; username: string; role: string; expiresAt?: number } | null>(null);
  const [operator, setOperator] = useState<{ id?: string; username: string; name?: string; role: string } | null>(null);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState<boolean>(false);

  useEffect(() => {
    const savedSessionId = localStorage.getItem('roxie_session_id');
    if (savedSessionId) {
      fetch('/api/auth/session', {
        headers: {
          'x-session-id': savedSessionId,
          'Authorization': `Bearer ${savedSessionId}`
        }
      })
        .then(res => {
          if (res.ok) return res.json();
          localStorage.removeItem('roxie_session_id');
          return null;
        })
        .then(data => {
          if (data?.session) {
            setSession(data.session);
            setOperator({ username: data.session.username, role: data.session.role });
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword) {
      setLoginError('Username and password are required');
      return;
    }
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword })
      });
      const data = await res.json();
      if (res.ok && data.session) {
        localStorage.setItem('roxie_session_id', data.session.sessionId);
        setSession(data.session);
        setOperator(data.operator || { username: data.session.username, role: data.session.role });
        setShowLoginModal(false);
        setLoginPassword('');
        fetchData();
      } else {
        setLoginError(data.error || 'Invalid credentials');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login request failed');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleAdminLogout = async () => {
    const savedSessionId = localStorage.getItem('roxie_session_id') || session?.sessionId;
    if (savedSessionId) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': savedSessionId,
          'Authorization': `Bearer ${savedSessionId}`
        },
        body: JSON.stringify({ sessionId: savedSessionId })
      }).catch(() => {});
    }
    localStorage.removeItem('roxie_session_id');
    setSession(null);
    setOperator(null);
  };

  // In-flight GET request deduplication cache
  const inFlightGetMap = useRef<Map<string, Promise<any>>>(new Map());

  const deduplicatedFetch = async (url: string, options?: RequestInit): Promise<Response> => {
    const sessionToken = localStorage.getItem('roxie_session_id') || session?.sessionId;
    const authHeaders: Record<string, string> = {};
    if (sessionToken) {
      authHeaders['x-session-id'] = sessionToken;
      authHeaders['Authorization'] = `Bearer ${sessionToken}`;
    }
    const mergedOptions: RequestInit = {
      ...options,
      headers: {
        ...authHeaders,
        ...(options?.headers || {})
      }
    };
    if (mergedOptions && mergedOptions.method && mergedOptions.method !== 'GET') {
      return fetch(url, mergedOptions);
    }
    if (inFlightGetMap.current.has(url)) {
      return inFlightGetMap.current.get(url)!;
    }
    const promise = (async () => {
      try {
        return await fetch(url, mergedOptions);
      } finally {
        inFlightGetMap.current.delete(url);
      }
    })();
    inFlightGetMap.current.set(url, promise);
    return promise;
  };

  // Live checklist
  const [liveTestStatus, setLiveTestStatus] = useState<Record<string, 'NOT TESTED' | 'PASS' | 'FAIL'>>(() => {
    try {
      const saved = localStorage.getItem('roxie_live_test_status');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const updateTestStatus = (testId: string, status: 'NOT TESTED' | 'PASS' | 'FAIL') => {
    const updated = { ...liveTestStatus, [testId]: status };
    setLiveTestStatus(updated);
    try {
      localStorage.setItem('roxie_live_test_status', JSON.stringify(updated));
    } catch {}
  };

  // Primary Data Fetcher (Optimized with in-flight deduplication)
  const fetchData = async () => {
    try {
      const [overviewRes, groupsRes, cmdsRes, statusRes, healthRes, dmsRes, stickersRes, schedulesRes] = await Promise.all([
        deduplicatedFetch('/api/dashboard/overview'),
        deduplicatedFetch('/api/dashboard/groups'),
        deduplicatedFetch('/api/commands'),
        deduplicatedFetch('/api/telegram/status'),
        deduplicatedFetch('/api/health'),
        deduplicatedFetch('/api/dashboard/private-chats'),
        deduplicatedFetch('/api/dashboard/stickers'),
        deduplicatedFetch('/api/dashboard/schedules')
      ]);

      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (groupsRes.ok) setGroups(await groupsRes.json());
      if (cmdsRes.ok) setCommands(await cmdsRes.json());
      if (statusRes.ok) setTelegramStatus(await statusRes.json());
      if (healthRes.ok) setHealthData(await healthRes.json());
      if (dmsRes.ok) setPrivateChats(await dmsRes.json());
      if (stickersRes.ok) setGlobalStickersData(await stickersRes.json());
      if (schedulesRes.ok) {
        const sData = await schedulesRes.json();
        setSchedulesList(sData.schedules || []);
      }

      // Fetch global settings
      try {
        const gRes = await deduplicatedFetch('/api/dashboard/control-center/global');
        if (gRes.ok) setGlobalSettings(await gRes.json());
      } catch {}

      // Fetch group details if a group is open or selected
      const targetDetailId = activeGroupDetailId || (selectedChatId !== 'all' ? selectedChatId : null);
      if (targetDetailId) {
        // Fetch all group sub-resources with Promise.allSettled so no single slow or failing sub-resource blocks the others
        const [detailResult, modsResult, permsResult, groupStickersResult, abuseResult, membersResult, lustUsersResult, historyResult, autoResult] = await Promise.allSettled([
          deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}`),
          deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/moderators`),
          deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/permissions`),
          deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/stickers`),
          deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/abuse-words`),
          deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/members`),
          deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/lust/users`),
          deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/backup/history`),
          deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/automations`)
        ]);

        if (autoResult.status === 'fulfilled' && autoResult.value.ok) {
          try {
            const aData = await autoResult.value.json();
            setGroupAutomationsList(aData.automations || []);
          } catch {}
        }

        if (detailResult.status === 'fulfilled' && detailResult.value.ok) {
          try {
            const dData = await detailResult.value.json();
            setGroupDetails(dData);
            if (dData.settings?.slowModeSeconds !== undefined) {
              setSlowmodeInput(dData.settings.slowModeSeconds);
            }
          } catch {}
        } else {
          // If the group detail endpoint returned an error or is missing, synthesize a safe default object from existing groups
          const matchedGroup = groups.find(g => g.chatId === targetDetailId);
          setGroupDetails(prev => prev && prev.chatId === targetDetailId ? prev : {
            chatId: targetDetailId,
            chatTitle: matchedGroup?.chatTitle || `Group ${targetDetailId}`,
            settings: matchedGroup?.settings || {},
            locks: {},
            filters: {},
            linksWhitelist: [],
            bans: [],
            kicks: [],
            mutes: [],
            reports: [],
            schedules: [],
            notes: [],
            approvedUsers: [],
            freedUsers: [],
            storedMessages: [],
            logs: [],
            status: matchedGroup?.status || 'Active',
            botRole: matchedGroup?.botRole || 'Administrator'
          });
        }

        if (modsResult.status === 'fulfilled' && modsResult.value.ok) {
          try {
            setGroupModerators(await modsResult.value.json());
          } catch {}
        }
        if (permsResult.status === 'fulfilled' && permsResult.value.ok) {
          try {
            setGroupPermissionsData(await permsResult.value.json());
          } catch {}
        }
        if (groupStickersResult.status === 'fulfilled' && groupStickersResult.value.ok) {
          try {
            setGroupStickersData(await groupStickersResult.value.json());
          } catch {}
        }
        if (abuseResult.status === 'fulfilled' && abuseResult.value.ok) {
          try {
            const aData = await abuseResult.value.json();
            setGroupAbuseWords(aData.words || []);
          } catch {}
        }
        if (membersResult.status === 'fulfilled' && membersResult.value.ok) {
          try {
            setGroupMembersList(await membersResult.value.json());
          } catch {}
        }
        if (lustUsersResult.status === 'fulfilled' && lustUsersResult.value.ok) {
          try {
            setGroupLustUsers(await lustUsersResult.value.json());
          } catch {}
        }
        if (historyResult.status === 'fulfilled' && historyResult.value.ok) {
          try {
            setBackupHistoryList(await historyResult.value.json());
          } catch {}
        }
      } else {
        setGroupDetails(null);
        setGroupModerators(null);
        setGroupPermissionsData(null);
        setGroupStickersData(null);
        setGroupAbuseWords([]);
        setGroupMembersList([]);
        setGroupLustUsers([]);
        setBackupHistoryList([]);
      }

      // Fetch active private chat conversation
      if (activePrivateChatId) {
        const pRes = await deduplicatedFetch(`/api/dashboard/private-chats/${activePrivateChatId}/messages`);
        if (pRes.ok) {
          const pData = await pRes.json();
          setPrivateChatMessages(pData.messages || []);
        }
      }
    } catch (err) {
      console.warn('Dashboard fetch error:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => {
      clearInterval(interval);
      if (settingsDebounceTimerRef.current) {
        clearTimeout(settingsDebounceTimerRef.current);
      }
    };
  }, [selectedChatId, activeGroupDetailId, activePrivateChatId]);

  // Handle connection test
  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const res = await fetch('/api/telegram/test-connection', { method: 'POST' });
      const data = await res.json();
      setTestResult(data);
      fetchData();
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestingConnection(false);
    }
  };

  // Export logs
  const exportData = (format: 'json' | 'csv') => {
    const logs = selectedChatId === 'all' 
      ? overview?.recentLogs || [] 
      : groupDetails?.logs || [];

    if (format === 'json') {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
      const dlAnchor = document.createElement('a');
      dlAnchor.setAttribute("href", dataStr);
      dlAnchor.setAttribute("download", `roxie_control_center_logs_${selectedChatId}.json`);
      dlAnchor.click();
    } else {
      let csv = "ID,Timestamp,Group,Action,Actor,Target,Reason\n";
      logs.forEach((l: any) => {
        csv += `"${l.id}","${l.timestamp}","${l.chatTitle || l.chatId}","${l.action}","${l.adminUsername || l.adminUserId || ''}","${l.targetUsername || l.targetUserId || ''}","${(l.reason || '').replace(/"/g, '""')}"\n`;
      });
      const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      const dlAnchor = document.createElement('a');
      dlAnchor.setAttribute("href", dataStr);
      dlAnchor.setAttribute("download", `roxie_control_center_logs_${selectedChatId}.csv`);
      dlAnchor.click();
    }
  };

  // Add Sticker Pack
  const handleAddStickerPack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupDetailId || !newPackInput.trim()) return;
    setAddingPack(true);
    setAddPackError(null);
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/stickers/packs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packNameOrUrl: newPackInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewPackInput('');
        setShowAddPackModal(false);
        fetchData();
      } else {
        setAddPackError(data.error || 'Failed to add sticker pack from Telegram');
      }
    } catch (err: any) {
      setAddPackError(err.message);
    } finally {
      setAddingPack(false);
    }
  };

  // Toggle Sticker Pack State
  const handleToggleStickerPack = async (packName: string, enabled: boolean) => {
    if (!activeGroupDetailId) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/stickers/packs/${packName}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Remove Sticker Pack from Group Configuration
  const handleRemoveStickerPack = async () => {
    if (!activeGroupDetailId || !removePackModal) return;
    setRemovingPack(true);
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/stickers/packs/${removePackModal.name}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setRemovePackModal(null);
        fetchData();
      } else {
        const data = await res.json();
        alert(`❌ Failed to remove pack: ${data.error}`);
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setRemovingPack(false);
    }
  };

  // Leave Group Execution
  const handleLeaveGroup = async () => {
    if (!leaveModalGroup || leaveConfirmInput !== 'LEAVE') return;
    setLeavingGroup(true);
    try {
      const res = await fetch(`/api/dashboard/groups/${leaveModalGroup.chatId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'LEAVE' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ ${data.message}`);
        setLeaveModalGroup(null);
        setLeaveConfirmInput('');
        if (activeGroupDetailId === leaveModalGroup.chatId) {
          setActiveGroupDetailId(null);
        }
        fetchData();
      } else {
        alert(`❌ Failed to leave: ${data.error || 'Telegram rejected leave request'}`);
        setLeaveModalGroup(null);
        setLeaveConfirmInput('');
        fetchData();
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setLeavingGroup(false);
    }
  };

  // Global Settings Fetch & Update
  const updateGlobalSetting = async (key: string, value: boolean) => {
    setSavingGlobal(true);
    try {
      const res = await fetch('/api/dashboard/control-center/global', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      if (res.ok) {
        const data = await res.json();
        setGlobalSettings(data);
      }
    } catch (err: any) {
      alert(`Error updating global setting: ${err.message}`);
    } finally {
      setSavingGlobal(false);
    }
  };

  // Abuse Words
  const handleAddAbuseWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupDetailId || !newAbuseWordInput.trim()) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/abuse-words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: newAbuseWordInput.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setGroupAbuseWords(data.words || []);
        setNewAbuseWordInput('');
      } else {
        alert(data.error || 'Failed to add abuse word');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemoveAbuseWord = async (word: string) => {
    if (!activeGroupDetailId) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/abuse-words/${encodeURIComponent(word)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok) {
        setGroupAbuseWords(data.words || []);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleClearAbuseWords = async () => {
    if (!activeGroupDetailId) return;
    if (!confirm('Clear all custom abuse words for this group?')) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/abuse-words`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setGroupAbuseWords([]);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Slowmode
  const handleApplySlowmode = async (seconds: number) => {
    if (!activeGroupDetailId) return;
    setApplyingSlowmode(true);
    setSlowmodeFeedback(null);
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/slowmode`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds })
      });
      const data = await res.json();
      if (res.ok) {
        setSlowmodeInput(seconds);
        const tgNotice = data.telegramResult?.ok ? 'Applied to Telegram.' : (data.telegramResult?.description ? `(Telegram: ${data.telegramResult.description})` : '');
        setSlowmodeFeedback(`✓ Slowmode set to ${seconds}s. ${tgNotice}`);
        fetchData();
      } else {
        setSlowmodeFeedback(`✕ ${data.error || 'Failed to set slowmode'}`);
      }
    } catch (err: any) {
      setSlowmodeFeedback(`✕ ${err.message}`);
    } finally {
      setApplyingSlowmode(false);
    }
  };

  // Members Moderation Actions
  const handleMemberAction = async (action: 'ban' | 'unban' | 'restrict' | 'promote' | 'demote', userId: number) => {
    if (!activeGroupDetailId) return;
    const actionKey = `${action}_${userId}`;
    setMemberActionLoading(prev => ({ ...prev, [actionKey]: true }));
    setMemberActionFeedback(null);
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/members/${userId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMemberActionFeedback({ type: 'success', message: `✓ Successfully executed ${action} on user ${userId}` });
        fetchData();
      } else {
        setMemberActionFeedback({ type: 'error', message: `✕ Telegram error: ${data.description || data.error || 'Action failed'}` });
      }
    } catch (err: any) {
      setMemberActionFeedback({ type: 'error', message: `✕ Network error: ${err.message}` });
    } finally {
      setMemberActionLoading(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  // Lust Mode Group & Users Reset
  const handleResetGroupLust = async () => {
    if (!activeGroupDetailId) return;
    if (!confirm('Reset group lust state to Level 0?')) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/lust/reset-group`, { method: 'POST' });
      if (res.ok) {
        alert('✓ Group lust level reset to 0');
        fetchData();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResetUserLustLevels = async () => {
    if (!activeGroupDetailId) return;
    if (!confirm('Reset all user lust levels in this group to Level 0?')) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/lust/reset-users`, { method: 'POST' });
      if (res.ok) {
        alert('✓ All user lust levels reset to 0');
        fetchData();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Danger Zone Actions
  const handleExecuteDangerAction = async () => {
    if (!activeGroupDetailId || !dangerModal) return;
    if (dangerConfirmInput !== 'CONFIRM') {
      alert('Please type CONFIRM exactly to proceed.');
      return;
    }
    setExecutingDangerAction(true);
    try {
      let endpoint = '';
      if (dangerModal === 'reset_settings') endpoint = `/api/dashboard/groups/${activeGroupDetailId}/reset`;
      if (dangerModal === 'clear_memory') endpoint = `/api/dashboard/groups/${activeGroupDetailId}/clear-memory`;
      if (dangerModal === 'clear_stickers') endpoint = `/api/dashboard/groups/${activeGroupDetailId}/clear-stickers`;
      if (dangerModal === 'clear_abuse') endpoint = `/api/dashboard/groups/${activeGroupDetailId}/abuse-words`;

      const res = await fetch(endpoint, { method: dangerModal === 'clear_abuse' ? 'DELETE' : 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(`✓ Operation executed successfully.`);
        setDangerModal(null);
        setDangerConfirmInput('');
        fetchData();
      } else {
        alert(`✕ Failed: ${data.error || 'Error'}`);
      }
    } catch (err: any) {
      alert(`✕ Error: ${err.message}`);
    } finally {
      setExecutingDangerAction(false);
    }
  };

  // --- Backup & Restore Handlers ---
  const handleDownloadGroupJson = async () => {
    if (!activeGroupDetailId) return;
    try {
      setBackupLoading(true);
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/export-json`);
      if (!res.ok) throw new Error('Failed to export JSON');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roxie_group_${Math.abs(Number(activeGroupDetailId))}_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupNotification({ type: 'success', message: 'Lossless JSON configuration backup downloaded!' });
    } catch (e: any) {
      setBackupNotification({ type: 'error', message: e.message || 'Download failed' });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleDownloadGroupCsv = async () => {
    if (!activeGroupDetailId) return;
    try {
      setBackupLoading(true);
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/export-csv`);
      if (!res.ok) throw new Error('Failed to export CSV');
      const csvText = await res.text();
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roxie_group_${Math.abs(Number(activeGroupDetailId))}_report_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupNotification({ type: 'success', message: 'Human-readable CSV report downloaded!' });
    } catch (e: any) {
      setBackupNotification({ type: 'error', message: e.message || 'CSV download failed' });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleCopyGroupJson = async () => {
    if (!activeGroupDetailId) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/export-json`);
      if (!res.ok) throw new Error('Failed to fetch JSON');
      const data = await res.json();
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedJsonToast(true);
      setTimeout(() => setCopiedJsonToast(false), 3000);
      setBackupNotification({ type: 'success', message: 'Configuration JSON copied to clipboard!' });
    } catch (e: any) {
      setBackupNotification({ type: 'error', message: 'Failed to copy to clipboard' });
    }
  };

  const handleLoadGroupJsonIntoEditor = async () => {
    if (!activeGroupDetailId) return;
    try {
      setBackupLoading(true);
      setBackupEditorError(null);
      setBackupEditorSuccess(null);
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/export-json`);
      if (!res.ok) throw new Error('Failed to load JSON');
      const data = await res.json();
      setBackupEditorJson(JSON.stringify(data, null, 2));
      setBackupEditorSuccess('Loaded latest group configuration into editor');
    } catch (e: any) {
      setBackupEditorError(e.message || 'Failed to load configuration');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleValidateEditorJson = () => {
    setBackupEditorError(null);
    setBackupEditorSuccess(null);
    if (!backupEditorJson.trim()) {
      setBackupEditorError('Editor is empty. Click "Load Group JSON" to populate.');
      return false;
    }
    try {
      const parsed = JSON.parse(backupEditorJson);
      if (typeof parsed !== 'object' || parsed === null) {
        setBackupEditorError('Root value must be a JSON object');
        return false;
      }
      setBackupEditorSuccess('✅ JSON is completely valid syntax!');
      return true;
    } catch (e: any) {
      setBackupEditorError(`Syntax Error: ${e.message}`);
      return false;
    }
  };

  const handleFormatEditorJson = () => {
    try {
      const parsed = JSON.parse(backupEditorJson);
      setBackupEditorJson(JSON.stringify(parsed, null, 2));
      setBackupEditorError(null);
      setBackupEditorSuccess('Formatted JSON successfully');
    } catch (e: any) {
      setBackupEditorError(`Cannot format: ${e.message}`);
    }
  };

  const handlePreviewImport = async (jsonString: string) => {
    if (!activeGroupDetailId) return;
    try {
      setBackupLoading(true);
      setBackupNotification(null);
      const parsed = JSON.parse(jsonString);
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          config: parsed,
          selectedSections: backupImportSelectedSections
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview generation failed');
      setBackupDiffPreview(data);
    } catch (e: any) {
      setBackupNotification({ type: 'error', message: `Preview failed: ${e.message}` });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleApplyImport = async (jsonString: string) => {
    if (!activeGroupDetailId) return;
    try {
      setBackupLoading(true);
      setBackupNotification(null);
      const parsed = JSON.parse(jsonString);
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          config: parsed,
          selectedSections: backupImportSelectedSections,
          overrideChatId: backupOverrideChatId
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Import failed');
      setBackupNotification({ type: 'success', message: data.message || 'Configuration restored successfully!' });
      setBackupDiffPreview(null);
      fetchData();
    } catch (e: any) {
      setBackupNotification({ type: 'error', message: e.message || 'Import failed' });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreSafetySnapshot = async (filename: string) => {
    if (!activeGroupDetailId) return;
    if (!confirm(`Restore safety backup snapshot "${filename}"? This will restore the group configuration.`)) return;
    try {
      setBackupLoading(true);
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/restore-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filename })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to restore snapshot');
      setBackupNotification({ type: 'success', message: data.message || 'Safety backup snapshot restored!' });
      fetchData();
    } catch (e: any) {
      setBackupNotification({ type: 'error', message: e.message });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleExportAllBotBackup = async () => {
    try {
      setBotBackupLoading(true);
      setBotBackupNotification(null);
      const res = await fetch('/api/dashboard/backup/export-all');
      if (!res.ok) throw new Error('Failed to export bot backup');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roxie_full_bot_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBotBackupNotification({ type: 'success', message: `Full bot backup with ${data.totalGroups || 0} groups exported!` });
    } catch (e: any) {
      setBotBackupNotification({ type: 'error', message: e.message || 'Export failed' });
    } finally {
      setBotBackupLoading(false);
    }
  };

  const handleRestoreAllBotBackup = async () => {
    if (!botBackupJson.trim()) {
      setBotBackupNotification({ type: 'error', message: 'Please paste or upload full bot backup JSON' });
      return;
    }
    if (!confirm('Restore full bot backup? This will restore configurations for all groups contained in the backup file.')) return;
    try {
      setBotBackupLoading(true);
      setBotBackupNotification(null);
      const parsed = JSON.parse(botBackupJson);
      const res = await fetch('/api/dashboard/backup/restore-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ payload: parsed })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Full bot restore failed');
      setBotBackupNotification({ type: 'success', message: data.message || 'Bot backup restored successfully!' });
      fetchData();
    } catch (e: any) {
      setBotBackupNotification({ type: 'error', message: e.message || 'Restore failed' });
    } finally {
      setBotBackupLoading(false);
    }
  };

  // Send Message Execution (In-Flight Lock + Idempotency Key)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendTargetId || !sendMessageContent.trim() || sendingMessage) return;
    setSendingMessage(true);
    setSendResult(null);
    try {
      const clientRequestId = `send_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const res = await fetch('/api/dashboard/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: sendTargetType,
          targetId: sendTargetId,
          message: sendMessageContent.trim(),
          clientRequestId
        })
      });
      const data = await res.json();
      setSendResult({ ok: res.ok, data });
      if (res.ok) {
        setSendMessageContent('');
        fetchData();
      }
    } catch (err: any) {
      setSendResult({ ok: false, data: { error: err.message } });
    } finally {
      setSendingMessage(false);
    }
  };

  // Send Private Reply (In-Flight Lock + Idempotency Key)
  const handleSendPrivateReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePrivateChatId || !privateReplyText.trim() || sendingPrivateReply) return;
    setSendingPrivateReply(true);
    try {
      const clientRequestId = `priv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const res = await fetch('/api/dashboard/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'private',
          targetId: activePrivateChatId,
          message: privateReplyText.trim(),
          clientRequestId
        })
      });
      if (res.ok) {
        setPrivateReplyText('');
        fetchData();
      } else {
        const err = await res.json();
        alert(`❌ Send failed: ${err.error}`);
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setSendingPrivateReply(false);
    }
  };

  // Group Messages Direct Composer & Reply-to-User Execution
  const handleSelectReplyTarget = (msg: any) => {
    if (!msg.messageId) {
      alert('Reply unavailable — Telegram message ID was not recorded for this message.');
      return;
    }
    setGroupReplyTarget(msg);
    setGroupMessageFeedback(null);
    const composerElem = document.getElementById('group-message-composer');
    if (composerElem) {
      composerElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const textarea = composerElem.querySelector('textarea');
      if (textarea) textarea.focus();
    }
  };

  const handleSendGroupMessage = async () => {
    if (!activeGroupDetailId || !groupComposerText.trim() || sendingGroupMessage) return;
    setSendingGroupMessage(true);
    setGroupMessageFeedback(null);
    try {
      const clientRequestId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const payload: any = {
        targetType: 'group',
        targetId: activeGroupDetailId,
        chatId: activeGroupDetailId,
        message: groupComposerText.trim(),
        text: groupComposerText.trim(),
        clientRequestId
      };
      if (groupReplyTarget?.messageId) {
        payload.replyToMessageId = groupReplyTarget.messageId;
      }

      const res = await fetch('/api/dashboard/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setGroupMessageFeedback({
          type: 'success',
          message: groupReplyTarget ? '✓ Reply sent as Roxie' : '✓ Message sent as Roxie'
        });
        setGroupComposerText('');
        setGroupReplyTarget(null);
        await fetchData();
        setTimeout(() => setGroupMessageFeedback(null), 4000);
      } else {
        setGroupMessageFeedback({
          type: 'error',
          message: data.error || '✕ Failed to send message'
        });
      }
    } catch (err: any) {
      setGroupMessageFeedback({
        type: 'error',
        message: `✕ Error: ${err.message}`
      });
    } finally {
      setSendingGroupMessage(false);
    }
  };

  // Broadcast Execution (In-Flight Lock + Unique Broadcast ID)
  const handleBroadcast = async () => {
    if (broadcastSelectedGroups.length === 0 || !broadcastContent.trim() || broadcasting) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    setShowBroadcastConfirm(false);
    try {
      const broadcastId = `bcast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const res = await fetch('/api/dashboard/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broadcastId,
          groupIds: broadcastSelectedGroups,
          message: broadcastContent.trim()
        })
      });
      const data = await res.json();
      setBroadcastResult(data);
      if (res.ok) {
        setBroadcastContent('');
        fetchData();
      }
    } catch (err: any) {
      setBroadcastResult({ error: err.message });
    } finally {
      setBroadcasting(false);
    }
  };

  // Schedule and Automation Action Handlers
  const handleSaveSchedule = async () => {
    if (!newScheduleForm.chatId || !newScheduleForm.message.trim()) return;
    setSchedulesLoading(true);
    try {
      const payload: any = {
        chatId: Number(newScheduleForm.chatId),
        name: newScheduleForm.name.trim() || newScheduleForm.message.trim().slice(0, 30),
        message: newScheduleForm.message.trim(),
        messageText: newScheduleForm.message.trim(),
        scheduleType: newScheduleForm.scheduleType,
        timezone: newScheduleForm.timezone || 'UTC',
        contentType: newScheduleForm.contentType || 'text',
        mediaFileId: newScheduleForm.mediaFileId.trim() || undefined,
        replyToMessageId: newScheduleForm.replyToMessageId ? Number(newScheduleForm.replyToMessageId) : undefined,
        enabled: newScheduleForm.enabled
      };

      if (newScheduleForm.scheduleType === 'interval') {
        payload.intervalFormatted = newScheduleForm.intervalStr || '1h';
        const rawStr = (newScheduleForm.intervalStr || '1h').toLowerCase().trim();
        const num = parseFloat(rawStr) || 1;
        if (rawStr.endsWith('m')) payload.intervalMs = num * 60 * 1000;
        else if (rawStr.endsWith('d')) payload.intervalMs = num * 24 * 60 * 60 * 1000;
        else payload.intervalMs = num * 60 * 60 * 1000;
        payload.nextRun = new Date(Date.now() + payload.intervalMs).toISOString();
      } else {
        const dateStr = `${newScheduleForm.nextRunDate}T${newScheduleForm.nextRunTime || '12:00'}:00`;
        const parsedDate = new Date(dateStr);
        payload.nextRun = isNaN(parsedDate.getTime()) ? new Date(Date.now() + 3600000).toISOString() : parsedDate.toISOString();
      }

      const method = editingSchedule ? 'PUT' : 'POST';
      const endpoint = editingSchedule ? `/api/dashboard/schedules/${editingSchedule.id}` : '/api/dashboard/schedules';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowCreateScheduleModal(false);
        setEditingSchedule(null);
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to save schedule:', err);
    } finally {
      setSchedulesLoading(false);
    }
  };

  const handleToggleSchedule = async (id: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/dashboard/schedules/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to toggle schedule:', err);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scheduled message?')) return;
    try {
      const res = await fetch(`/api/dashboard/schedules/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to delete schedule:', err);
    }
  };

  const handleSaveAutomation = async () => {
    const targetChatId = activeGroupDetailId || (schedulesFilterChatId !== 'all' ? schedulesFilterChatId : null);
    if (!targetChatId) return;
    setAutomationsLoading(true);
    try {
      const res = await fetch(`/api/dashboard/groups/${targetChatId}/automations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger: newAutomationForm.trigger,
          action: newAutomationForm.action,
          parameters: newAutomationForm.parameters.trim() || undefined,
          enabled: newAutomationForm.enabled
        })
      });
      if (res.ok) {
        setShowCreateAutomationModal(false);
        setNewAutomationForm({ trigger: 'spam_detected', action: 'delete_message', parameters: '', enabled: true });
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to save automation:', err);
    } finally {
      setAutomationsLoading(false);
    }
  };

  const handleDeleteAutomation = async (chatId: number, autoId: string) => {
    if (!confirm('Are you sure you want to delete this automation rule?')) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${chatId}/automations/${autoId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to delete automation:', err);
    }
  };

  const handleToggleAutomation = async (chatId: number, autoId: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/dashboard/groups/${chatId}/automations/${autoId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to toggle automation:', err);
    }
  };

  const fetchAutomations = async (targetChatId: number) => {
    if (!targetChatId) return;
    setAutomationsLoading(true);
    try {
      const res = await deduplicatedFetch(`/api/dashboard/groups/${targetChatId}/automations`);
      if (res.ok) {
        const data = await res.json();
        setGroupAutomationsList(data.automations || []);
      }
    } catch (err) {
      console.error('Failed to fetch automations:', err);
    } finally {
      setAutomationsLoading(false);
    }
  };

  // Flush Pending Debounced Settings Batch to Backend (Single Combined PATCH)
  const flushPendingSettings = async () => {
    if (!activeGroupDetailId) return;
    if (settingsDebounceTimerRef.current) {
      clearTimeout(settingsDebounceTimerRef.current);
      settingsDebounceTimerRef.current = null;
    }

    const payload = { ...pendingSettingsBatchRef.current };
    if (Object.keys(payload).length === 0) return;

    pendingSettingsBatchRef.current = {};
    const clientTimestamp = Date.now();
    lastSettingsSentTimestampRef.current = clientTimestamp;
    payload._clientTimestamp = clientTimestamp;

    setSavingSettings(true);
    setSettingsSaveStatus('saving');
    setSettingsSaveError(null);

    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        if (clientTimestamp >= lastSettingsSentTimestampRef.current) {
          setSettingsSaveStatus('saved');
          if (settingsSaveStatusTimerRef.current) clearTimeout(settingsSaveStatusTimerRef.current);
          settingsSaveStatusTimerRef.current = setTimeout(() => {
            setSettingsSaveStatus('idle');
          }, 2500);
        }
      } else {
        setSettingsSaveStatus('error');
        setSettingsSaveError(data.error || 'Autosave failed');
      }
    } catch (err: any) {
      setSettingsSaveStatus('error');
      setSettingsSaveError(err.message || 'Network error');
    } finally {
      setSavingSettings(false);
    }
  };

  // Update Group Setting Helper (1500ms Debounce with Batching & Optimistic UI Update)
  const updateSetting = (key: string, value: any, immediate: boolean = false) => {
    if (!activeGroupDetailId) return;

    // 1. Optimistic local state update for instant UI feedback
    setGroupDetails((prev: any) => {
      if (!prev) return prev;
      const updated = { ...prev };
      const keys = key.split('.');
      if (keys.length === 1) {
        updated.settings = { ...(updated.settings || {}), [key]: value };
      } else if (keys.length === 2) {
        updated.settings = {
          ...(updated.settings || {}),
          [keys[0]]: {
            ...(updated.settings?.[keys[0]] || {}),
            [keys[1]]: value
          }
        };
      }
      return updated;
    });

    // 2. Deep merge into pending batch
    const keys = key.split('.');
    if (keys.length === 1) {
      pendingSettingsBatchRef.current[key] = value;
    } else if (keys.length === 2) {
      pendingSettingsBatchRef.current[keys[0]] = {
        ...(pendingSettingsBatchRef.current[keys[0]] || groupDetails?.settings?.[keys[0]] || {}),
        [keys[1]]: value
      };
    }

    if (immediate) {
      flushPendingSettings();
      return;
    }

    setSettingsSaveStatus('saving');

    // 3. Debounce 1500ms
    if (settingsDebounceTimerRef.current) {
      clearTimeout(settingsDebounceTimerRef.current);
    }
    settingsDebounceTimerRef.current = setTimeout(() => {
      flushPendingSettings();
    }, 1500);
  };

  const botInfo = overview?.botStatus?.botInfo;
  const isPolling = overview?.botStatus?.isPolling;
  const stats = overview?.stats || { totalBans: 0, totalKicks: 0, totalWarns: 0, totalReports: 0, activeSchedules: 0 };

  // Filter logs based on search & group selection
  const rawLogs = selectedChatId === 'all' 
    ? overview?.recentLogs || [] 
    : groupDetails?.logs || [];

  const filteredLogs = rawLogs.filter((l: ModerationLog) => {
    const matchesSearch = debouncedSearchQuery === '' || 
      l.action?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      l.targetUsername?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      l.adminUsername?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      l.reason?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      l.details?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      l.chatTitle?.toLowerCase().includes(debouncedSearchQuery.toLowerCase());

    const matchesType = logFilterType === 'ALL' || l.action?.toLowerCase() === logFilterType.toLowerCase();
    return matchesSearch && matchesType;
  });

  // All stored messages across groups for the Messages tab
  const allStoredMessages = useMemo(() => {
    if (activeGroupDetailId) {
      return (groupDetails?.storedMessages || []).map((m: any) => ({ ...m, groupTitle: groupDetails.chatTitle, chatId: activeGroupDetailId }));
    }
    if (groupDetails?.storedMessages) {
      return groupDetails.storedMessages;
    }
    return [];
  }, [activeGroupDetailId, groupDetails]);

  // Color classes helper for themes
  const themeBg = isDark ? 'bg-stone-900 text-stone-100' : 'bg-slate-50 text-slate-900';
  const themeHeaderBg = isDark ? 'bg-stone-950 border-stone-800' : 'bg-white border-slate-200';
  const themeSidebarBg = isDark ? 'bg-stone-950 border-stone-800' : 'bg-white border-slate-200';
  const themeCardBg = isDark ? 'bg-stone-950 border-stone-800' : 'bg-white border-slate-200 shadow-sm';
  const themeInnerCardBg = isDark ? 'bg-stone-900 border-stone-800' : 'bg-slate-50 border-slate-200';
  const themeMutedText = isDark ? 'text-stone-400' : 'text-slate-500';
  const themeBorder = isDark ? 'border-stone-800' : 'border-slate-200';

  // Group Auto Response and Auto Sticker settings extraction
  const curAutoResponse = groupDetails?.settings?.autoResponse || {
    enabled: true,
    mode: 'every_message',
    cooldownSeconds: 30,
    randomize: false,
    minSeconds: 30,
    maxSeconds: 120
  };
  const curAutoSticker = groupDetails?.settings?.autoSticker || {
    enabled: true,
    mode: 'cooldown',
    cooldownSeconds: 60,
    randomize: false,
    minSeconds: 60,
    maxSeconds: 300
  };

  return (
    <div className={`h-screen overflow-hidden ${themeBg} flex flex-col font-sans transition-colors duration-200`}>
      
      {/* Top Banner / Global Header */}
      <header className={`${themeHeaderBg} border-b px-6 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 shadow-sm`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight flex items-center gap-2">
              ROXIE CONTROL CENTER
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 font-semibold uppercase tracking-wider">
                Telegram Core
              </span>
            </h1>
            <p className={`text-xs ${themeMutedText}`}>Multi-Group Moderation, Direct Chats, Security & Broadcast Operations</p>
          </div>
        </div>

        {/* Status Indicators, Theme Toggle & Test Button */}
        <div className="flex items-center gap-3 flex-wrap">
          {session ? (
            <div className={`flex items-center gap-2 ${themeInnerCardBg} px-3 py-1.5 rounded-xl border ${themeBorder} text-xs`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-semibold text-xs">{operator?.username || session.username}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 font-mono font-bold">
                {session.role}
              </span>
              <button
                onClick={handleAdminLogout}
                className="ml-1 text-[11px] text-rose-400 hover:text-rose-300 font-medium hover:underline flex items-center gap-1"
                title="Log out of Admin session"
              >
                <LogOut className="w-3 h-3" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setLoginError(null); setShowLoginModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
              title="Operator / Admin Login"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Admin Login</span>
            </button>
          )}

          <div className={`flex items-center gap-2 ${themeInnerCardBg} px-3 py-1.5 rounded-xl border ${themeBorder} text-xs`}>
            <span className={`w-2.5 h-2.5 rounded-full ${isPolling ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="font-medium text-xs">
              {isPolling ? '🟢 Online & Polling' : '🟡 Polling Inactive'}
            </span>
          </div>

          <button
            onClick={toggleTheme}
            className={`p-2 rounded-xl border ${themeBorder} ${themeInnerCardBg} hover:opacity-80 transition-colors text-xs flex items-center gap-1.5`}
            title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-600" />}
            <span className="text-[11px] font-medium hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
          </button>

          <button
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
            {testingConnection ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-65px)] overflow-hidden">
        
        {/* Sidebar Navigation */}
        <aside className={`w-full lg:w-72 ${themeSidebarBg} border-r p-4 space-y-4 flex flex-col justify-between h-full overflow-hidden shrink-0`}>
          <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
            
            {/* Group Scope Selector */}
            <div className="space-y-1.5 shrink-0">
              <label className={`text-[11px] font-semibold ${themeMutedText} uppercase tracking-wider flex items-center gap-1.5`}>
                <Users className="w-3.5 h-3.5" /> Group Scope
              </label>
              <select
                value={selectedChatId}
                onChange={(e) => {
                  const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                  setSelectedChatId(val);
                  if (val !== 'all') {
                    setActiveGroupDetailId(val);
                  }
                }}
                className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 transition-colors`}
              >
                <option value="all">🟢 [ All Groups ] ({groups.length})</option>
                {groups.map((g) => (
                  <option key={g.chatId} value={g.chatId}>
                    {g.botLeft ? '⚫' : '🟢'} {g.chatTitle} ({g.chatId})
                  </option>
                ))}
              </select>
            </div>

            {/* Navigation Menu with Categorized Headers */}
            <nav className="space-y-4 overflow-y-auto flex-1 pr-1 text-xs">
              
              {/* Core Section */}
              <div className="space-y-1">
                <button
                  onClick={() => { setActiveNav('overview'); setActiveGroupDetailId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition-colors ${
                    activeNav === 'overview' && !activeGroupDetailId
                      ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20 font-semibold' 
                      : `${themeMutedText} hover:bg-stone-800/20`
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Activity className="w-4 h-4" />
                    <span>🏠 Overview</span>
                  </div>
                  {activeNav === 'overview' && !activeGroupDetailId && <ChevronRight className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={() => { setActiveNav('control-center'); setActiveGroupDetailId(null); }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition-colors ${
                    activeNav === 'control-center' && !activeGroupDetailId
                      ? 'bg-purple-600/10 text-purple-400 border border-purple-500/20 font-semibold' 
                      : `${themeMutedText} hover:bg-stone-800/20`
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-purple-400" />
                    <span>⚙️ Control Center</span>
                  </div>
                  {activeNav === 'control-center' && !activeGroupDetailId && <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* TELEGRAM Category */}
              <div className="space-y-1">
                <div className={`px-3 text-[10px] font-bold uppercase tracking-wider ${themeMutedText}`}>Telegram</div>
                {[
                  { id: 'groups', label: '👥 Groups', icon: Users },
                  { id: 'private-chats', label: '💬 Private Chats', icon: MessageSquare, badge: privateChats.length },
                  { id: 'messages', label: '📨 Messages', icon: FileText }
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { setActiveNav(item.id); if (item.id === 'groups') setActiveGroupDetailId(null); }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition-colors ${
                        isActive 
                          ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20 font-semibold' 
                          : `${themeMutedText} hover:bg-stone-800/20`
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-bold font-mono">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* MANAGEMENT Category */}
              <div className="space-y-1">
                <div className={`px-3 text-[10px] font-bold uppercase tracking-wider ${themeMutedText}`}>Management</div>
                {[
                  { id: 'moderators', label: '👮 Moderators', icon: Shield },
                  { id: 'stickers', label: '🎨 Stickers', icon: Smile },
                  { id: 'commands', label: '🤖 Commands', icon: ListChecks },
                  { id: 'settings', label: '⚙️ Settings', icon: Settings },
                  { id: 'permissions', label: '🔐 Permissions', icon: Lock }
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveNav(item.id);
                        if (item.id === 'settings' && activeGroupDetailId) {
                          setGroupDetailTab('general');
                        } else if (item.id === 'moderators' && activeGroupDetailId) {
                          setGroupDetailTab('moderators');
                        } else if (item.id === 'permissions' && activeGroupDetailId) {
                          setGroupDetailTab('permissions');
                        }
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition-colors ${
                        isActive 
                          ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20 font-semibold' 
                          : `${themeMutedText} hover:bg-stone-800/20`
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </div>
                      {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>

              {/* ACTIONS Category */}
              <div className="space-y-1">
                <div className={`px-3 text-[10px] font-bold uppercase tracking-wider ${themeMutedText}`}>Actions</div>
                {[
                  { id: 'schedules', label: '⏰ Schedules & Rules', icon: Clock, badge: schedulesList.length },
                  { id: 'send-message', label: '📢 Send Message', icon: Send },
                  { id: 'broadcast', label: '📣 Broadcast', icon: Radio }
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveNav(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition-colors ${
                        isActive 
                          ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20 font-semibold' 
                          : `${themeMutedText} hover:bg-stone-800/20`
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </div>
                      {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>

              {/* SYSTEM Category */}
              <div className="space-y-1">
                <div className={`px-3 text-[10px] font-bold uppercase tracking-wider ${themeMutedText}`}>System</div>
                {[
                  { id: 'audit', label: '📋 Activity Log', icon: Database },
                  { id: 'health-diagnostics', label: '📊 Health & Diagnostics', icon: Activity },
                  { id: 'live-verify', label: '🛡️ Live Verification', icon: ShieldCheck },
                  { id: 'live-checklist', label: '✅ Live Test Checklist (46)', icon: ListChecks }
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveNav(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition-colors ${
                        isActive 
                          ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20 font-semibold' 
                          : `${themeMutedText} hover:bg-stone-800/20`
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </div>
                      {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>

            </nav>
          </div>

          {/* Sidebar Footer info */}
          <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-[11px] ${themeMutedText} space-y-1.5 shrink-0`}>
            <div className="flex justify-between">
              <span>Bot Username:</span>
              <span className="font-mono font-semibold">@{botInfo?.username || 'MissRoxie_Bot'}</span>
            </div>
            <div className="flex justify-between">
              <span>Connected Groups:</span>
              <span className="font-bold text-blue-500">{groups.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Security Engine:</span>
              <span className="text-emerald-500 font-semibold">Active</span>
            </div>
          </div>
        </aside>

        {/* Content Area - Scrollable */}
        <main className="flex-1 p-6 space-y-6 overflow-y-auto h-full">
          
          {/* Global Search & Export Header */}
          <div className={`sticky top-0 z-30 ${themeCardBg} backdrop-blur-md border rounded-2xl p-3.5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3`}>
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search events, users, groups, messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-blue-500 transition-colors`}
              />
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className={`${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
              >
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="all">All Time</option>
              </select>

              <button
                onClick={() => exportData('json')}
                className={`flex items-center gap-1.5 px-3 py-2 ${themeInnerCardBg} hover:opacity-80 border ${themeBorder} rounded-xl text-xs transition-colors`}
              >
                <Download className="w-3.5 h-3.5" /> JSON
              </button>
              <button
                onClick={() => exportData('csv')}
                className={`flex items-center gap-1.5 px-3 py-2 ${themeInnerCardBg} hover:opacity-80 border ${themeBorder} rounded-xl text-xs transition-colors`}
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          </div>

          {/* TAB: OVERVIEW */}
          {activeNav === 'overview' && !activeGroupDetailId && (
            <div className="space-y-6">
              
              {/* Top Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: '🤖 Bot Status', value: isPolling ? 'ONLINE' : 'OFFLINE', subtitle: isPolling ? 'Telegram Connected' : 'Polling Inactive', icon: Bot, color: isPolling ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
                  { label: '👥 Connected Groups', value: groups.length, subtitle: `${groups.filter(g => !g.botLeft).length} Active`, icon: Users, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
                  { label: '💬 Private Chats', value: overview?.privateChatsCount || privateChats.length, subtitle: 'Users in Direct Chat', icon: MessageSquare, color: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
                  { label: '📨 Stored Messages', value: overview?.totalMessagesCount || 0, subtitle: 'Group & Private Memory', icon: FileText, color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20' },
                ].map((s, idx) => {
                  const Icon = s.icon;
                  return (
                    <div key={idx} className={`${themeCardBg} border rounded-2xl p-5 flex items-center justify-between`}>
                      <div>
                        <p className={`text-xs ${themeMutedText} font-medium`}>{s.label}</p>
                        <h3 className="text-2xl font-bold mt-1">{s.value}</h3>
                        <p className="text-[11px] text-stone-400 mt-0.5">{s.subtitle}</p>
                      </div>
                      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${s.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bot Identity Banner */}
              <div className={`${themeCardBg} border rounded-2xl p-6`}>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-2xl shadow-xl shadow-blue-500/20 shrink-0">
                      🤖
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-lg font-bold">@{botInfo?.username || 'MissRoxie_Bot'}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isPolling ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                          {isPolling ? 'POLLING ACTIVE' : 'DISCONNECTED'}
                        </span>
                      </div>
                      <p className={`text-xs ${themeMutedText} mt-0.5 font-mono`}>
                        ID: {botInfo?.id || '1087968824'} • Name: {botInfo?.firstName || 'Miss Roxie'} • Uptime: {Math.floor((overview?.uptimeSeconds || 0) / 60)}m {(overview?.uptimeSeconds || 0) % 60}s
                      </p>
                      <div className="flex items-center gap-3 mt-3 text-xs">
                        <span className="flex items-center gap-1 text-blue-500 font-medium">
                          <Users className="w-3.5 h-3.5" /> {overview?.activeUsersCount || 0} Active Users
                        </span>
                        <span className="flex items-center gap-1 text-purple-500 font-medium">
                          <Smile className="w-3.5 h-3.5" /> {overview?.totalStickersCount || 0} Stickers
                        </span>
                        <span className="flex items-center gap-1 text-emerald-500 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" /> Anti-Raid Active
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <button
                      onClick={() => setActiveNav('broadcast')}
                      className="flex-1 md:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Radio className="w-4 h-4" /> Broadcast
                    </button>
                    <button
                      onClick={() => setActiveNav('send-message')}
                      className={`flex-1 md:flex-none px-4 py-2 ${themeInnerCardBg} hover:opacity-80 border ${themeBorder} rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2`}
                    >
                      <Send className="w-4 h-4" /> Send Message
                    </button>
                  </div>
                </div>
              </div>

              {/* Connected Groups Quick Grid */}
              <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-500" /> Connected Telegram Groups ({groups.length})
                  </h3>
                  <button
                    onClick={() => setActiveNav('groups')}
                    className="text-xs text-blue-500 hover:underline font-semibold"
                  >
                    View All Groups →
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groups.slice(0, 6).map((g) => (
                    <div key={g.chatId} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between`}>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            g.status === 'Unavailable' ? 'bg-red-500' :
                            g.botLeft ? 'bg-stone-500' : 'bg-emerald-500'
                          }`} />
                          <h4 className="text-xs font-bold">{g.chatTitle}</h4>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                            g.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500' :
                            g.status === 'Bot Left' ? 'bg-stone-500/10 text-stone-400' :
                            g.status === 'Unavailable' ? 'bg-red-500/10 text-red-500' :
                            'bg-amber-500/10 text-amber-500'
                          }`}>
                            {g.status}
                          </span>
                        </div>
                        <div className={`text-[11px] ${themeMutedText} font-mono`}>
                          Chat ID: {g.chatId} • Role: {g.botRole || 'Admin'}
                        </div>
                      </div>

                      <button
                        onClick={() => { setActiveGroupDetailId(g.chatId); setActiveNav('groups'); }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
                      >
                        Open
                      </button>
                    </div>
                  ))}
                  {groups.length === 0 && (
                    <p className={`text-xs ${themeMutedText} col-span-2 py-6 text-center`}>No groups discovered yet. Add Roxie to a Telegram group to begin monitoring.</p>
                  )}
                </div>
              </div>

              {/* Moderation Actions Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Bans Issued', count: stats.totalBans, icon: Ban, color: 'text-red-500' },
                  { label: 'Kicks Issued', count: stats.totalKicks, icon: UserX, color: 'text-amber-500' },
                  { label: 'Warnings Issued', count: stats.totalWarns, icon: AlertTriangle, color: 'text-yellow-500' },
                  { label: 'Reports Handled', count: stats.totalReports, icon: Flag, color: 'text-blue-500' },
                ].map((m, idx) => (
                  <div key={idx} className={`${themeCardBg} border rounded-2xl p-4 space-y-1`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${themeMutedText}`}>{m.label}</span>
                      <m.icon className={`w-4 h-4 ${m.color}`} />
                    </div>
                    <div className="text-xl font-bold font-mono">{m.count}</div>
                  </div>
                ))}
              </div>

            </div>
          )}

          {/* TAB: GLOBAL CONTROL CENTER */}
          {activeNav === 'control-center' && !activeGroupDetailId && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-purple-400" /> Global Control Center
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold uppercase tracking-wider">
                      🌐 Bot-Wide Master Controls
                    </span>
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>
                    Configure global bot policies, master engine toggles, and view cross-scope operational status.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {savingGlobal && <span className="text-xs text-purple-400 animate-pulse font-semibold">Updating global settings...</span>}
                  <button
                    onClick={fetchData}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                  </button>
                </div>
              </div>

              {/* Hierarchy / Scope Explainer Legend */}
              <div className={`${themeCardBg} border rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4`}>
                <div className={`${themeInnerCardBg} p-3.5 rounded-xl border ${themeBorder} space-y-1`}>
                  <div className="flex items-center gap-2 font-bold text-xs text-purple-400">
                    <Globe className="w-4 h-4" /> 🌐 GLOBAL SCOPE
                  </div>
                  <p className={`text-[11px] ${themeMutedText}`}>
                    Master switches that apply across the entire Roxie instance. If disabled here, feature is inactive everywhere.
                  </p>
                </div>
                <div className={`${themeInnerCardBg} p-3.5 rounded-xl border ${themeBorder} space-y-1`}>
                  <div className="flex items-center gap-2 font-bold text-xs text-blue-400">
                    <Users className="w-4 h-4" /> 👥 GROUP SCOPE
                  </div>
                  <p className={`text-[11px] ${themeMutedText}`}>
                    Completely isolated per Telegram group in <code className="font-mono text-[10px]">data/groups/&lt;chatId&gt;.json</code>.
                  </p>
                </div>
                <div className={`${themeInnerCardBg} p-3.5 rounded-xl border ${themeBorder} space-y-1`}>
                  <div className="flex items-center gap-2 font-bold text-xs text-emerald-400">
                    <MessageSquare className="w-4 h-4" /> 👤 PRIVATE CHAT
                  </div>
                  <p className={`text-[11px] ${themeMutedText}`}>
                    Direct 1-on-1 personal conversations with Roxie saved in <code className="font-mono text-[10px]">data/private/&lt;userId&gt;.json</code>.
                  </p>
                </div>
              </div>

              {/* Master Global Controls Grid */}
              <div className={`${themeCardBg} border rounded-2xl p-6 space-y-5`}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Master Engine Toggles
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { key: 'botEnabled', label: '🤖 Telegram Bot Online', desc: 'Global master switch for bot responsiveness' },
                    { key: 'aiConversationEnabled', label: '💬 AI Conversation Engine', desc: 'Enable AI chat processing globally' },
                    { key: 'globalModerationEnabled', label: '🛡️ Moderation Engine', desc: 'Enforce anti-spam, anti-flood and filters' },
                    { key: 'globalStickersEnabled', label: '🎨 Sticker & Media System', desc: 'Enable custom & anime sticker responses' },
                    { key: 'globalAutoResponseEnabled', label: '🤖 Auto-Response System', desc: 'Enable scheduled or frequency-based AI chats' },
                    { key: 'globalAutoStickerEnabled', label: '🎭 Auto-Sticker System', desc: 'Enable auto-sticker response frequency engine' },
                    { key: 'globalLustModeAvailable', label: '❤️ Lust Mode Availability', desc: 'Allow groups to activate Lust Mode (Levels 0-4)' },
                    { key: 'globalLoggingEnabled', label: '📋 Audit Logging', desc: 'Record operator and bot moderation events' },
                    { key: 'maintenanceMode', label: '🚧 Maintenance Mode', desc: 'Restrict operations to dashboard operators only' },
                  ].map((ctrl) => {
                    const isChecked = Boolean((globalSettings as any)[ctrl.key]);
                    return (
                      <div key={ctrl.key} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between gap-3`}>
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            {ctrl.label}
                          </span>
                          <p className={`text-[10px] ${themeMutedText}`}>{ctrl.desc}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => updateGlobalSetting(ctrl.key, e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Connected Groups Quick Jumper */}
              <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                    <Users className="w-4 h-4" /> Connected Telegram Groups ({groups.length})
                  </h3>
                  <span className={`text-xs ${themeMutedText}`}>Select a group to open its full 18-tab Control Center</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {groups.map((g) => (
                    <button
                      key={g.chatId}
                      onClick={() => {
                        setSelectedChatId(g.chatId);
                        setActiveGroupDetailId(g.chatId);
                        setGroupDetailTab('overview');
                      }}
                      className={`${themeInnerCardBg} border ${themeBorder} hover:border-purple-500/50 p-3 rounded-xl text-left transition-all space-y-1 group`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold truncate group-hover:text-purple-400 transition-colors">
                          {g.chatTitle}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                          g.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-stone-500/10 text-stone-400'
                        }`}>
                          {g.status}
                        </span>
                      </div>
                      <div className={`text-[10px] font-mono ${themeMutedText}`}>
                        ID: {g.chatId}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bot-Wide Full Backup & Restore */}
              <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Database className="w-4 h-4" /> Bot-Wide Complete Backup & Restore
                    </h3>
                    <p className={`text-[11px] ${themeMutedText}`}>
                      Export or restore configurations for all {groups.length} Telegram groups and global flags in a single JSON backup.
                    </p>
                  </div>
                  <button
                    onClick={handleExportAllBotBackup}
                    disabled={botBackupLoading}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {botBackupLoading ? 'Exporting...' : 'Export All Groups JSON'}
                  </button>
                </div>

                {botBackupNotification && (
                  <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    botBackupNotification.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {botBackupNotification.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{botBackupNotification.message}</span>
                  </div>
                )}

                <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                  <span className="text-xs font-bold block">Restore Full Bot Backup</span>
                  <p className={`text-[11px] ${themeMutedText}`}>
                    Upload or paste a complete bot backup JSON file to restore all groups. All current group states will have safety backups created automatically before restoration.
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer px-3 py-1.5 bg-stone-700/40 hover:bg-stone-700/60 rounded-xl text-xs font-semibold flex items-center gap-1.5 text-stone-300 border border-stone-600/30">
                        <Upload className="w-3.5 h-3.5" /> Select .json File
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                setBotBackupJson(ev.target?.result as string || '');
                              };
                              reader.readAsText(file);
                            }
                          }}
                        />
                      </label>
                      {botBackupJson && (
                        <span className="text-[11px] text-emerald-400 font-mono">
                          JSON payload loaded ({botBackupJson.length} bytes)
                        </span>
                      )}
                    </div>
                    <textarea
                      value={botBackupJson}
                      onChange={(e) => setBotBackupJson(e.target.value)}
                      placeholder='Paste full bot backup JSON here: { "backupVersion": "1.0", "groups": { ... } }'
                      rows={3}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-emerald-500`}
                    />
                    <div className="flex items-center justify-end">
                      <button
                        onClick={handleRestoreAllBotBackup}
                        disabled={!botBackupJson.trim() || botBackupLoading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${botBackupLoading ? 'animate-spin' : ''}`} />
                        {botBackupLoading ? 'Restoring All Groups...' : 'Restore Full Bot Backup'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: GROUPS LIST VIEW */}
          {activeNav === 'groups' && !activeGroupDetailId && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-500" /> Telegram Groups ({groups.length})
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>Real-time inspection, administration, settings and permission controls.</p>
                </div>
                <button
                  onClick={fetchData}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh Groups
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map((g) => (
                  <div key={g.chatId} className={`${themeCardBg} border rounded-2xl p-5 space-y-4 flex flex-col justify-between`}>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-base">
                            {g.chatTitle.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="text-xs font-bold truncate max-w-[160px]">{g.chatTitle}</h3>
                            <span className={`text-[10px] font-mono ${themeMutedText}`}>ID: {g.chatId}</span>
                          </div>
                        </div>

                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          g.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                          g.status === 'Bot Left' ? 'bg-stone-500/10 text-stone-400 border border-stone-500/20' :
                          g.status === 'Unavailable' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                          'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                        }`}>
                          {g.status}
                        </span>
                      </div>

                      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs space-y-1.5`}>
                        <div className="flex justify-between">
                          <span className={themeMutedText}>Roxie Role:</span>
                          <span className="font-semibold">{g.botRole || '🛡️ Administrator'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={themeMutedText}>Members:</span>
                          <span className="font-mono">{g.memberCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={themeMutedText}>Protection:</span>
                          <span className={`font-semibold ${g.protectionStatus ? 'text-emerald-500' : 'text-stone-400'}`}>
                            {g.protectionStatus ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className={themeMutedText}>Lust Mode:</span>
                          <span className={`font-semibold ${g.lustMode ? 'text-pink-500' : 'text-stone-400'}`}>
                            {g.lustMode ? '❤️ Enabled' : 'Off'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => { setActiveGroupDetailId(g.chatId); setGroupDetailTab('overview'); }}
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <span>[ OPEN ]</span>
                      </button>
                      {g.status === 'Bot Left' ? (
                        <span className="px-3 py-2 bg-stone-500/10 text-stone-400 border border-stone-500/20 rounded-xl text-xs font-semibold flex items-center gap-1">
                          <LogOut className="w-3.5 h-3.5" /> Left
                        </span>
                      ) : g.status === 'Unavailable' ? (
                        <span
                          className="px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold flex items-center gap-1"
                          title={g.unavailableReason || 'Unavailable on Telegram'}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" /> Stale
                        </span>
                      ) : (
                        <button
                          onClick={() => { setLeaveModalGroup(g); setLeaveConfirmInput(''); }}
                          className="px-3 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/20 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
                          title="Leave Group"
                        >
                          <LogOut className="w-3.5 h-3.5" /> Leave
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: GROUP DETAIL VIEW WITH INNER TABS */}
          {activeGroupDetailId && groupDetails && (
            <div className="space-y-6">
              
              {/* Group Detail Header */}
              <div className={`${themeCardBg} border rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4`}>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setActiveGroupDetailId(null)}
                    className={`p-2 ${themeInnerCardBg} hover:opacity-80 rounded-xl border ${themeBorder} text-xs flex items-center gap-1`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-lg font-bold">{groupDetails.chatTitle}</h2>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        groupDetails.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                        groupDetails.status === 'Bot Left' ? 'bg-stone-500/10 text-stone-400 border border-stone-500/20' :
                        groupDetails.status === 'Unavailable' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                        'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                      }`}>
                        {groupDetails.status}
                      </span>
                      {settingsSaveStatus === 'saving' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Saving...
                        </span>
                      )}
                      {settingsSaveStatus === 'saved' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Saved ✓
                        </span>
                      )}
                      {settingsSaveStatus === 'error' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <AlertCircle className="w-3 h-3" /> Save failed
                          <button onClick={() => flushPendingSettings()} className="underline ml-1 font-bold hover:text-rose-200">Retry</button>
                        </span>
                      )}
                    </div>
                    <p className={`text-xs ${themeMutedText} font-mono mt-0.5`}>
                      Chat ID: {groupDetails.chatId} • Authority: {groupDetails.botRole || '🛡️ Administrator'}
                      {groupDetails.unavailableReason && (
                        <span className="text-red-400 ml-2 font-sans font-medium">({groupDetails.unavailableReason})</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Inner Tabs Navigation */}
                <div className={`flex items-center gap-1.5 ${themeInnerCardBg} p-2 rounded-xl border ${themeBorder} flex-wrap text-xs font-semibold overflow-x-auto`}>
                  {[
                    { id: 'overview', label: '📊 Overview' },
                    { id: 'general', label: '⚙️ General' },
                    { id: 'moderation', label: '🛡️ Moderation' },
                    { id: 'content_protection', label: '🔒 Content Protection' },
                    { id: 'ai_conversation', label: '🤖 AI / Chat' },
                    { id: 'lust_mode', label: '❤️ Lust Mode' },
                    { id: 'stickers', label: `🎨 Stickers (${groupStickersData?.packs?.length || 0})` },
                    { id: 'auto_response', label: '🤖 Auto Response' },
                    { id: 'auto_sticker', label: '🎭 Auto Sticker' },
                    { id: 'slowmode', label: '⏱️ Slowmode' },
                    { id: 'abuse_words', label: `🤬 Abuse Words (${groupAbuseWords.length})` },
                    { id: 'members', label: `👥 Members (${groupMembersList.length})` },
                    { id: 'moderators', label: `👮 Moderators (${groupModerators?.administrators?.length || 0})` },
                    { id: 'telegram_permissions', label: '🔐 Permissions' },
                    { id: 'commands', label: '📜 Commands' },
                    { id: 'messages', label: `💬 Messages (${groupDetails.storedMessages?.length || 0})` },
                    { id: 'schedules', label: `⏰ Schedules & Rules (${schedulesList.filter(s => s.chatId === activeGroupDetailId).length})` },
                    { id: 'activity', label: '📋 Activity' },
                    { id: 'backup', label: '💾 Backup & Restore' },
                    { id: 'danger_zone', label: '🚨 Danger Zone' }
                  ].map((tab: any) => (
                    <button
                      key={tab.id}
                      onClick={() => setGroupDetailTab(tab.id)}
                      className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap ${
                        groupDetailTab === tab.id || (groupDetailTab === 'settings' && tab.id === 'general') || (groupDetailTab === 'permissions' && tab.id === 'telegram_permissions')
                          ? 'bg-blue-600 text-white shadow-sm font-bold'
                          : `${themeMutedText} hover:opacity-80 hover:bg-stone-800/20`
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* INNER TAB: GROUP OVERVIEW */}
              {groupDetailTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: 'Bans', count: groupDetails.bans?.length || 0, icon: Ban, color: 'text-red-500' },
                      { label: 'Kicks', count: groupDetails.kicks?.length || 0, icon: UserX, color: 'text-amber-500' },
                      { label: 'Mutes', count: groupDetails.mutes?.length || 0, icon: Volume2, color: 'text-yellow-500' },
                      { label: 'Reports', count: groupDetails.reports?.length || 0, icon: Flag, color: 'text-blue-500' },
                    ].map((s, idx) => (
                      <div key={idx} className={`${themeCardBg} border rounded-2xl p-4 space-y-1`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs ${themeMutedText}`}>{s.label}</span>
                          <s.icon className={`w-4 h-4 ${s.color}`} />
                        </div>
                        <div className="text-xl font-bold font-mono">{s.count}</div>
                      </div>
                    ))}
                  </div>

                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                    <h3 className="text-xs font-bold uppercase tracking-wider">Active Group Protections</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Link Protection', on: Boolean(groupDetails.settings?.linksProtection) },
                        { label: 'Sticker Protection', on: Boolean(groupDetails.settings?.stickerProtection) },
                        { label: 'Anti-Flood', on: Boolean(groupDetails.settings?.floodEnabled) },
                        { label: 'Anti-Raid', on: Boolean(groupDetails.settings?.raidEnabled) },
                        { label: 'CAPTCHA Verification', on: Boolean(groupDetails.settings?.captchaEnabled) },
                        { label: 'AI Chatbot', on: Boolean(groupDetails.settings?.chatbotEnabled) },
                        { label: 'Lust Mode', on: Boolean(groupDetails.settings?.lustMode) },
                        { label: 'Reports System', on: Boolean(groupDetails.settings?.reportsEnabled) }
                      ].map((p, idx) => (
                        <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex items-center justify-between text-xs`}>
                          <span>{p.label}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.on ? 'bg-emerald-500/10 text-emerald-500' : 'bg-stone-500/10 text-stone-400'}`}>
                            {p.on ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP STORED MESSAGES */}
              {groupDetailTab === 'messages' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500" /> Stored Group Messages ({groupDetails.storedMessages?.length || 0})
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Real messages received & recorded in group memory by Roxie.</p>
                    </div>
                    <button
                      onClick={() => fetchData()}
                      className={`px-3 py-1.5 ${themeInnerCardBg} border ${themeBorder} hover:opacity-80 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                  </div>

                  {/* Messages Feed */}
                  <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                    {(groupDetails.storedMessages || []).map((msg: any, idx: number) => (
                      <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-start gap-3 transition-colors hover:border-blue-500/30`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          msg.role === 'assistant' || msg.source === 'dashboard' ? 'bg-blue-600 text-white shadow-sm' : 'bg-purple-600/20 text-purple-400'
                        }`}>
                          {msg.role === 'assistant' || msg.source === 'dashboard' ? 'R' : (msg.name?.slice(0, 1) || 'U')}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold">{msg.displayName || msg.name || (msg.role === 'assistant' ? 'Roxie' : 'User')}</span>
                              {msg.username && (
                                <span className={`text-[10px] font-mono ${themeMutedText}`}>@{msg.username}</span>
                              )}
                              {msg.source === 'dashboard' && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  DASHBOARD OPERATOR
                                </span>
                              )}
                              {msg.messageId && (
                                <span className={`text-[10px] font-mono ${themeMutedText}`}>#{msg.messageId}</span>
                              )}
                            </div>
                            <span className={`text-[10px] font-mono ${themeMutedText}`}>
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                          </div>

                          {/* Reply quote preview if replying to another message */}
                          {msg.replyTo && (
                            <div className="border-l-2 border-blue-500 bg-blue-500/5 px-2.5 py-1 rounded text-[11px] text-blue-300">
                              <span className="font-semibold">↩ Replying to {msg.replyTo.name || 'user'}:</span> {msg.replyTo.text ? `"${msg.replyTo.text}"` : ''}
                            </div>
                          )}

                          {msg.mediaType === 'sticker' ||
                          msg.content?.startsWith('🎨 Sticker') ||
                          msg.content?.includes('[Sent sticker]') ? (
                            <StickerPreview mediaFileId={msg.mediaFileId} content={msg.content} isDark={false} />
                          ) : (
                            <p className="text-xs leading-relaxed break-words">{msg.content}</p>
                          )}

                          {/* Reply Action Button */}
                          <div className="pt-1 flex items-center justify-end gap-2">
                            {msg.messageId ? (
                              <button
                                onClick={() => handleSelectReplyTarget(msg)}
                                className="px-2.5 py-1 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                                title={`Reply directly to message #${msg.messageId}`}
                              >
                                <Reply className="w-3 h-3" /> Reply
                              </button>
                            ) : (
                              <span className="text-[10px] text-stone-500 italic" title="Reply unavailable — Telegram message ID not stored">
                                Reply unavailable
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!groupDetails.storedMessages || groupDetails.storedMessages.length === 0) && (
                      <p className={`text-xs ${themeMutedText} text-center py-8`}>No messages stored for this group yet.</p>
                    )}
                  </div>

                  {/* Professional Sticky Message Composer */}
                  <div id="group-message-composer" className={`border ${themeBorder} rounded-2xl overflow-hidden shadow-lg transition-all ${themeInnerCardBg}`}>
                    {/* Reply Target Preview Bar */}
                    {groupReplyTarget && (
                      <div className="bg-blue-600/10 border-b border-blue-500/20 px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Reply className="w-4 h-4 text-blue-400 shrink-0" />
                          <div className="text-xs truncate">
                            <span className="text-blue-400 font-semibold">Replying to {groupReplyTarget.displayName || groupReplyTarget.name || (groupReplyTarget.username ? `@${groupReplyTarget.username}` : 'User')}</span>
                            {groupReplyTarget.messageId && (
                              <span className={`ml-1.5 font-mono text-[10px] ${themeMutedText}`}>#{groupReplyTarget.messageId}</span>
                            )}
                            <p className={`text-[11px] ${themeMutedText} truncate italic mt-0.5 max-w-[400px]`}>
                              "{groupReplyTarget.content}"
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setGroupReplyTarget(null)}
                          className="p-1 hover:bg-stone-500/20 rounded-lg text-stone-400 hover:text-stone-200 transition-colors shrink-0 cursor-pointer"
                          title="Cancel Reply"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Feedback Notification Banner */}
                    {groupMessageFeedback && (
                      <div className={`px-4 py-2 text-xs flex items-center justify-between ${
                        groupMessageFeedback.type === 'success'
                          ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border-b border-red-500/20'
                      }`}>
                        <span>{groupMessageFeedback.message}</span>
                        <button onClick={() => setGroupMessageFeedback(null)} className="hover:opacity-70 cursor-pointer">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Composer Input Area */}
                    <div className="p-3.5 space-y-2.5">
                      <textarea
                        rows={2}
                        value={groupComposerText}
                        onChange={(e) => setGroupComposerText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendGroupMessage();
                          }
                        }}
                        disabled={sendingGroupMessage || groupDetails.status === 'Bot Left' || groupDetails.status === 'Unavailable'}
                        placeholder={
                          groupDetails.status === 'Bot Left' ? 'Cannot send: Roxie has left this group.' :
                          groupDetails.status === 'Unavailable' ? 'Cannot send: This group is unavailable on Telegram.' :
                          groupReplyTarget ? `Reply to ${groupReplyTarget.displayName || groupReplyTarget.name || 'user'} as Roxie...` :
                          'Write a message as Roxie...'
                        }
                        className={`w-full bg-transparent resize-none text-xs focus:outline-none placeholder:text-stone-500 leading-relaxed`}
                      />

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/5">
                        <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
                          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          <span>
                            Press <kbd className="px-1 py-0.5 rounded bg-stone-500/20 font-mono text-[10px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 rounded bg-stone-500/20 font-mono text-[10px]">Shift+Enter</kbd> for new line • Sending as <strong>Roxie</strong>
                          </span>
                        </div>

                        <button
                          onClick={handleSendGroupMessage}
                          disabled={!groupComposerText.trim() || sendingGroupMessage || groupDetails.status === 'Bot Left' || groupDetails.status === 'Unavailable'}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {sendingGroupMessage ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Sending...</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>{groupReplyTarget ? 'Reply as Roxie' : 'Send'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP MODERATORS */}
              {groupDetailTab === 'moderators' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-500" /> Telegram Group Administrators
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>Source: {groupModerators?.source === 'telegram' ? '🟢 Telegram Authoritative API' : '🟡 Local Cache Fallback'}</p>
                  </div>

                  <div className="space-y-3">
                    {(groupModerators?.administrators || []).map((adm: any, idx: number) => (
                      <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3`}>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">{adm.name}</span>
                            {adm.username && <span className={`text-xs font-mono ${themeMutedText}`}>@{adm.username}</span>}
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-bold">
                              {adm.role}
                            </span>
                          </div>
                          <div className={`text-[11px] font-mono ${themeMutedText}`}>User ID: {adm.userId} {adm.customTitle ? `• Title: ${adm.customTitle}` : ''}</div>
                        </div>

                        {adm.permissions && (
                          <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                            {Object.entries(adm.permissions).map(([pKey, pVal]: [string, any]) => (
                              <span key={pKey} className={`px-2 py-0.5 rounded ${pVal ? 'bg-emerald-500/10 text-emerald-500' : 'bg-stone-500/10 text-stone-400'}`}>
                                {pKey.replace('can_', '')}: {pVal ? 'YES' : 'NO'}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {(!groupModerators?.administrators || groupModerators.administrators.length === 0) && (
                      <p className={`text-xs ${themeMutedText} text-center py-8`}>No administrators found.</p>
                    )}
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP STICKERS */}
              {groupDetailTab === 'stickers' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <Smile className="w-4 h-4 text-amber-500" /> Group Sticker Pack Management
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>
                        Per-group isolated sticker packs. Packs can be independently enabled, disabled, previewed, or removed.
                      </p>
                    </div>

                    <button
                      onClick={() => { setShowAddPackModal(true); setAddPackError(null); }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <Plus className="w-4 h-4" /> Add Sticker Pack
                    </button>
                  </div>

                  {/* Configured Sticker Packs List */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                        <span>Configured Sticker Packs</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-bold font-mono text-[10px]">
                          {groupStickersData?.packs?.length || 0}
                        </span>
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(groupStickersData?.packs || []).map((pack: any, idx: number) => {
                        const isEnabled = pack.enabled !== false;
                        return (
                          <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold">{pack.title || pack.name}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                    isEnabled 
                                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                                      : 'bg-stone-500/10 text-stone-400 border border-stone-500/20'
                                  }`}>
                                    {isEnabled ? '🟢 Enabled' : '🔴 Disabled'}
                                  </span>
                                </div>
                                <div className={`text-[11px] font-mono ${themeMutedText}`}>
                                  {pack.name} • {pack.stickerCount || pack.stickers?.length || 0} Stickers
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => setPreviewPack(pack)}
                                className={`px-2.5 py-1.5 ${themeCardBg} hover:opacity-80 border ${themeBorder} rounded-lg text-xs font-medium flex items-center gap-1`}
                              >
                                <Eye className="w-3.5 h-3.5 text-blue-500" /> Preview
                              </button>

                              <button
                                onClick={() => handleToggleStickerPack(pack.name, !isEnabled)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  isEnabled 
                                    ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' 
                                    : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                                }`}
                              >
                                {isEnabled ? 'Disable' : 'Enable'}
                              </button>

                              <button
                                onClick={() => setRemovePackModal(pack)}
                                className="px-2.5 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/20 rounded-lg text-xs font-medium flex items-center gap-1 ml-auto"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {(!groupStickersData?.packs || groupStickersData.packs.length === 0) && (
                        <div className={`col-span-2 text-center py-10 border border-dashed ${themeBorder} rounded-xl space-y-2`}>
                          <Smile className="w-8 h-8 text-stone-400 mx-auto" />
                          <p className={`text-xs ${themeMutedText}`}>No custom sticker packs configured for this group yet.</p>
                          <button
                            onClick={() => setShowAddPackModal(true)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
                          >
                            + Add First Sticker Pack
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP GENERAL SETTINGS */}
              {(groupDetailTab === 'general' || groupDetailTab === 'settings') && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <Settings className="w-4 h-4 text-blue-500" /> General Group Configuration
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Core policies, warning thresholds, welcome & goodbye announcements, and CAPTCHA.</p>
                    </div>
                    {savingSettings && <span className="text-xs text-blue-500 animate-pulse font-semibold">Saving changes...</span>}
                  </div>

                  {/* Warning System & Enforcement */}
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-5 space-y-4`}>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> Warning & Moderation Escalation
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Warning Threshold</label>
                        <select
                          value={groupDetails.settings?.warnLimit ?? 3}
                          onChange={(e) => updateSetting('warnLimit', Number(e.target.value))}
                          className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                        >
                          <option value="3">3 Warnings</option>
                          <option value="5">5 Warnings</option>
                          <option value="10">10 Warnings</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Action upon Threshold</label>
                        <select
                          value={groupDetails.settings?.warnAction || 'ban'}
                          onChange={(e) => updateSetting('warnAction', e.target.value)}
                          className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                        >
                          <option value="ban">Ban User</option>
                          <option value="kick">Kick User</option>
                          <option value="mute">Mute User</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Warning Expiry</label>
                        <select
                          value={groupDetails.settings?.warnExpireSeconds ?? 0}
                          onChange={(e) => updateSetting('warnExpireSeconds', Number(e.target.value))}
                          className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                        >
                          <option value="0">Never Expire</option>
                          <option value="86400">1 Day</option>
                          <option value="604800">7 Days</option>
                          <option value="2592000">30 Days</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Welcome & Goodbye Messages */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold flex items-center gap-2 cursor-pointer">
                          <span>👋 Welcome Message</span>
                        </label>
                        <input
                          type="checkbox"
                          checked={Boolean(groupDetails.settings?.welcomeEnabled)}
                          onChange={(e) => updateSetting('welcomeEnabled', e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600"
                        />
                      </div>
                      <textarea
                        rows={2}
                        value={groupDetails.settings?.welcomeMessage || 'Welcome {user} to {chat}!'}
                        onChange={(e) => updateSetting('welcomeMessage', e.target.value)}
                        placeholder="Welcome {user} to {chat}!"
                        className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl p-2.5 text-xs font-mono focus:outline-none`}
                      />
                    </div>

                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold flex items-center gap-2 cursor-pointer">
                          <span>👋 Goodbye Message</span>
                        </label>
                        <input
                          type="checkbox"
                          checked={Boolean(groupDetails.settings?.goodbyeEnabled)}
                          onChange={(e) => updateSetting('goodbyeEnabled', e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600"
                        />
                      </div>
                      <textarea
                        rows={2}
                        value={groupDetails.settings?.goodbyeMessage || 'Goodbye {user}!'}
                        onChange={(e) => updateSetting('goodbyeMessage', e.target.value)}
                        placeholder="Goodbye {user}!"
                        className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl p-2.5 text-xs font-mono focus:outline-none`}
                      />
                    </div>
                  </div>

                  {/* Join Request & CAPTCHA Verification */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between`}>
                      <div>
                        <span className="text-xs font-bold block">Auto-Accept Join Requests</span>
                        <span className={`text-[11px] ${themeMutedText}`}>Automatically approve pending join requests</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(groupDetails.settings?.autoAcceptEnabled)}
                        onChange={(e) => updateSetting('autoAcceptEnabled', e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                    </div>

                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between`}>
                      <div>
                        <span className="text-xs font-bold block">New Member CAPTCHA</span>
                        <span className={`text-[11px] ${themeMutedText}`}>Require button or math verification on join</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(groupDetails.settings?.captchaEnabled)}
                        onChange={(e) => updateSetting('captchaEnabled', e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP MODERATION */}
              {groupDetailTab === 'moderation' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="border-b pb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-500" /> Moderation & Anti-Spam Controls
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>Automated flood, raid, abusive language and promotional spam engines.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { key: 'stopSpamEnabled', label: '🛑 Master Anti-Spam', desc: 'Global filter for spam patterns' },
                      { key: 'floodEnabled', label: '🌊 Anti-Flood Engine', desc: 'Limit rapid-fire message bursts' },
                      { key: 'raidEnabled', label: '🛡️ Anti-Raid Defense', desc: 'Lockdown group on mass joins' },
                      { key: 'stopAbusiveEnabled', label: '🤬 Abuse Filter', desc: 'Enforce custom & core abuse lists' },
                      { key: 'stopPromotionEnabled', label: '📢 Promo Filter', desc: 'Block channel adverts & invites' },
                      { key: 'automodEnabled', label: '🤖 Auto-Moderator', desc: 'Automated warnings & escalation' },
                      { key: 'reportsEnabled', label: '🚩 Member Reports', desc: 'Allow @admin report triggers' },
                      { key: 'securityEnabled', label: '🔒 Deep Security', desc: 'Enhanced link & forward analysis' }
                    ].map((m) => {
                      const isChecked = Boolean(groupDetails.settings?.[m.key]);
                      return (
                        <div key={m.key} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between gap-2`}>
                          <div>
                            <span className="text-xs font-bold block">{m.label}</span>
                            <span className={`text-[10px] ${themeMutedText}`}>{m.desc}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => updateSetting(m.key, e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600"
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Active Warnings Table */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500">Active Warnings In Group</h4>
                    {(!groupDetails.warnings || groupDetails.warnings.length === 0) ? (
                      <p className={`text-xs ${themeMutedText} py-4 text-center border rounded-xl ${themeBorder}`}>No active warnings for members in this group.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className={`border-b ${themeBorder} ${themeMutedText} uppercase text-[10px]`}>
                            <tr>
                              <th className="py-2">User ID</th>
                              <th className="py-2">Count</th>
                              <th className="py-2">Reason</th>
                              <th className="py-2">Timestamp</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupDetails.warnings.map((w: any, idx: number) => (
                              <tr key={idx} className={`border-b ${themeBorder}`}>
                                <td className="py-2 font-mono">{w.userId}</td>
                                <td className="py-2 font-bold text-amber-500">{w.count} / {groupDetails.settings?.warnLimit || 3}</td>
                                <td className="py-2">{w.reason || 'Rule violation'}</td>
                                <td className="py-2 font-mono text-[10px]">{new Date(w.timestamp).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* INNER TAB: CONTENT PROTECTION */}
              {groupDetailTab === 'content_protection' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="border-b pb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Lock className="w-4 h-4 text-emerald-500" /> Content & Media Protection
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>Filter unwanted media types, links, bursts, and maintain allowed domains.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { key: 'linksProtection', label: '🔗 Links Protection', desc: 'Block unauthorized URLs' },
                      { key: 'stickerProtection', label: '🎨 Sticker Protection', desc: 'Restrict oversized sticker spam' },
                      { key: 'fileProtection', label: '📁 File Protection', desc: 'Block downloadable executables/docs' },
                      { key: 'imageProtection', label: '🖼️ Image Protection', desc: 'Restrict mass image uploads' },
                      { key: 'gifProtection', label: '🎬 GIF/Animation Protection', desc: 'Block looping GIF spam' },
                      { key: 'voiceProtection', label: '🎤 Voice Message Protection', desc: 'Block voice notes from non-admins' }
                    ].map((p) => {
                      const isChecked = Boolean(groupDetails.settings?.[p.key]);
                      return (
                        <div key={p.key} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between gap-2`}>
                          <div>
                            <span className="text-xs font-bold block">{p.label}</span>
                            <span className={`text-[10px] ${themeMutedText}`}>{p.desc}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => updateSetting(p.key, e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600"
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Whitelisted Domains */}
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-5 space-y-3`}>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-500">Allowed Link Domains (Whitelist)</h4>
                    <div className="flex flex-wrap gap-2">
                      {(groupDetails.settings?.linksWhitelist || []).map((domain: string, idx: number) => (
                        <span key={idx} className="px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-mono flex items-center gap-1.5">
                          {domain}
                        </span>
                      ))}
                      {(!groupDetails.settings?.linksWhitelist || groupDetails.settings.linksWhitelist.length === 0) && (
                        <span className={`text-xs ${themeMutedText}`}>No domains currently whitelisted.</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: AI & CONVERSATION */}
              {groupDetailTab === 'ai_conversation' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="border-b pb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Bot className="w-4 h-4 text-purple-400" /> Roxie AI Chatbot & Personality
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>Configure casual conversational intelligence, language style, and persona filters.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between`}>
                      <div>
                        <span className="text-xs font-bold block">AI Chatbot Enabled</span>
                        <span className={`text-[11px] ${themeMutedText}`}>Roxie converses naturally with group members</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(groupDetails.settings?.chatbotEnabled)}
                        onChange={(e) => updateSetting('chatbotEnabled', e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                    </div>

                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between`}>
                      <div>
                        <span className="text-xs font-bold block">Brother-Zone Filter</span>
                        <span className={`text-[11px] ${themeMutedText}`}>Playful response when members call Roxie 'didi' or 'sister'</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(groupDetails.settings?.brotherZoneEnabled)}
                        onChange={(e) => updateSetting('brotherZoneEnabled', e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className={`text-[11px] ${themeMutedText} font-semibold block`}>AI Personality Style</label>
                      <select
                        value={groupDetails.settings?.personality || 'normal'}
                        onChange={(e) => updateSetting('personality', e.target.value)}
                        className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                      >
                        <option value="normal">😊 Sweet & Helpful (Normal)</option>
                        <option value="tsundere">😤 Tsundere (Feisty & Proud)</option>
                        <option value="affectionate">🥰 Affectionate (Warm & Caring)</option>
                        <option value="strict">🧐 Strict (Disciplined Moderator)</option>
                        <option value="sarcastic">😏 Sarcastic (Witty & Teasing)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Preferred Language</label>
                      <select
                        value={groupDetails.settings?.language || 'hinglish'}
                        onChange={(e) => updateSetting('language', e.target.value)}
                        className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                      >
                        <option value="hinglish">🇮🇳 Hinglish (Natural Indian Mix)</option>
                        <option value="hindi">🇮🇳 Hindi (Shuddh / Devanagari / Roman)</option>
                        <option value="english">🌐 English (Global)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: LUST MODE */}
              {groupDetailTab === 'lust_mode' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2 text-pink-500">
                        <Flame className="w-4 h-4" /> Lust Mode & Flirtatious Intelligence
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Levels 0 (Off) to 4 (Sensual & Passionate). Isolated per group.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleResetGroupLust}
                        className="px-3 py-1.5 bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/20 rounded-xl text-xs font-semibold"
                      >
                        Reset Group Lust (0)
                      </button>
                      <button
                        onClick={handleResetUserLustLevels}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold"
                      >
                        Reset All Users
                      </button>
                    </div>
                  </div>

                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-5 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold block">Lust Mode Status</span>
                        <span className={`text-[11px] ${themeMutedText}`}>Enables flirty responses and lust-sticker reactions</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(groupDetails.settings?.lustMode)}
                        onChange={(e) => updateSetting('lustMode', e.target.checked)}
                        className="w-5 h-5 rounded text-pink-600"
                      />
                    </div>

                    <div className="space-y-2 pt-2">
                      <label className={`text-[11px] ${themeMutedText} font-semibold block`}>
                        Current Group Base Lust Level: <span className="text-pink-400 font-bold font-mono text-sm">{groupDetails.settings?.lustLevel ?? 0}</span> / 4
                      </label>
                      <div className="grid grid-cols-5 gap-2">
                        {[0, 1, 2, 3, 4].map((lvl) => (
                          <button
                            key={lvl}
                            onClick={() => updateSetting('lustLevel', lvl)}
                            className={`py-2 rounded-xl text-xs font-bold transition-colors ${
                              (groupDetails.settings?.lustLevel ?? 0) === lvl
                                ? 'bg-pink-600 text-white shadow-sm'
                                : `${themeCardBg} border ${themeBorder} ${themeMutedText} hover:text-pink-400`
                            }`}
                          >
                            Level {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Known User Lust Levels in this Group */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-pink-400">
                      User Lust Levels in this Group ({groupLustUsers.length})
                    </h4>
                    {groupLustUsers.length === 0 ? (
                      <p className={`text-xs ${themeMutedText} py-4 text-center border rounded-xl ${themeBorder}`}>
                        No individual user lust scores recorded for this group yet.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {groupLustUsers.map((ul: any, idx: number) => (
                          <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex items-center justify-between text-xs`}>
                            <span className="font-mono">{ul.userId}</span>
                            <span className="px-2 py-0.5 rounded font-bold font-mono bg-pink-500/10 text-pink-400 border border-pink-500/20">
                              Level {ul.level}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* INNER TAB: AUTO RESPONSE */}
              {groupDetailTab === 'auto_response' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2 text-blue-500">
                        <Bot className="w-4 h-4" /> Auto Response Engine
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Configure automatic AI conversational reply frequency for this group.</p>
                    </div>
                    {savingSettings && <span className="text-xs text-blue-500 animate-pulse font-semibold">Saving changes...</span>}
                  </div>

                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-5 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold block">Engine Switch</span>
                        <p className={`text-[11px] ${themeMutedText}`}>Enable or disable AI auto-responses in this group</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                          groupDetails.autoResponseNextAvailableSeconds > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                        }`}>
                          {groupDetails.autoResponseNextAvailableSeconds > 0 ? `⏳ Cooldown: ~${groupDetails.autoResponseNextAvailableSeconds}s` : '🟢 Ready'}
                        </span>
                        <input
                          type="checkbox"
                          checked={Boolean(curAutoResponse.enabled)}
                          onChange={(e) => updateSetting('autoResponse', { ...curAutoResponse, enabled: e.target.checked })}
                          className="w-4 h-4 rounded text-blue-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Response Mode</label>
                        <select
                          value={curAutoResponse.mode || 'every_message'}
                          onChange={(e) => updateSetting('autoResponse', { ...curAutoResponse, mode: e.target.value })}
                          className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                        >
                          <option value="every_message">Every Eligible Message</option>
                          <option value="cooldown">Cooldown Interval</option>
                          <option value="random">Randomized Interval</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Cooldown (Seconds)</label>
                        <input
                          type="number"
                          min="10"
                          max="86400"
                          value={curAutoResponse.cooldownSeconds || 30}
                          onChange={(e) => updateSetting('autoResponse', { ...curAutoResponse, cooldownSeconds: Number(e.target.value) })}
                          className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-mono`}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Random Interval (Min – Max)</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            placeholder="Min"
                            min="10"
                            value={curAutoResponse.minSeconds || 30}
                            onChange={(e) => updateSetting('autoResponse', { ...curAutoResponse, minSeconds: Number(e.target.value) })}
                            className={`w-1/2 ${themeCardBg} border ${themeBorder} rounded-xl px-2.5 py-2 text-xs font-mono`}
                          />
                          <span className="text-xs text-stone-400">-</span>
                          <input
                            type="number"
                            placeholder="Max"
                            max="86400"
                            value={curAutoResponse.maxSeconds || 120}
                            onChange={(e) => updateSetting('autoResponse', { ...curAutoResponse, maxSeconds: Number(e.target.value) })}
                            className={`w-1/2 ${themeCardBg} border ${themeBorder} rounded-xl px-2.5 py-2 text-xs font-mono`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: AUTO STICKER */}
              {groupDetailTab === 'auto_sticker' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2 text-amber-500">
                        <Smile className="w-4 h-4" /> Auto Sticker Engine
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Configure automatic animated and custom sticker response frequencies.</p>
                    </div>
                    {savingSettings && <span className="text-xs text-amber-500 animate-pulse font-semibold">Saving changes...</span>}
                  </div>

                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-5 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold block">Sticker Engine Switch</span>
                        <p className={`text-[11px] ${themeMutedText}`}>Independent from text auto-response cooldown</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                          groupDetails.autoStickerNextAvailableSeconds > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                        }`}>
                          {groupDetails.autoStickerNextAvailableSeconds > 0 ? `⏳ Cooldown: ~${groupDetails.autoStickerNextAvailableSeconds}s` : '🟢 Ready'}
                        </span>
                        <input
                          type="checkbox"
                          checked={Boolean(curAutoSticker.enabled)}
                          onChange={(e) => updateSetting('autoSticker', { ...curAutoSticker, enabled: e.target.checked })}
                          className="w-4 h-4 rounded text-amber-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Sticker Mode</label>
                        <select
                          value={curAutoSticker.mode || 'cooldown'}
                          onChange={(e) => updateSetting('autoSticker', { ...curAutoSticker, mode: e.target.value })}
                          className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                        >
                          <option value="cooldown">Cooldown Interval</option>
                          <option value="random">Randomized Interval</option>
                          <option value="every_message">Every Eligible Message</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Cooldown (Seconds)</label>
                        <input
                          type="number"
                          min="10"
                          max="86400"
                          value={curAutoSticker.cooldownSeconds || 60}
                          onChange={(e) => updateSetting('autoSticker', { ...curAutoSticker, cooldownSeconds: Number(e.target.value) })}
                          className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-mono`}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Random Interval (Min – Max)</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            placeholder="Min"
                            min="10"
                            value={curAutoSticker.minSeconds || 60}
                            onChange={(e) => updateSetting('autoSticker', { ...curAutoSticker, minSeconds: Number(e.target.value) })}
                            className={`w-1/2 ${themeCardBg} border ${themeBorder} rounded-xl px-2.5 py-2 text-xs font-mono`}
                          />
                          <span className="text-xs text-stone-400">-</span>
                          <input
                            type="number"
                            placeholder="Max"
                            max="86400"
                            value={curAutoSticker.maxSeconds || 300}
                            onChange={(e) => updateSetting('autoSticker', { ...curAutoSticker, maxSeconds: Number(e.target.value) })}
                            className={`w-1/2 ${themeCardBg} border ${themeBorder} rounded-xl px-2.5 py-2 text-xs font-mono`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: SLOWMODE */}
              {groupDetailTab === 'slowmode' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="border-b pb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2 text-blue-500">
                      <Clock className="w-4 h-4" /> Telegram Slowmode Delay Control
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>
                      Directly sets Telegram slowmode for this chat via <code className="font-mono text-[10px]">setChatSlowModeDelay</code>.
                    </p>
                  </div>

                  {slowmodeFeedback && (
                    <div className={`p-3 rounded-xl text-xs font-semibold ${
                      slowmodeFeedback.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {slowmodeFeedback}
                    </div>
                  )}

                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-5 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Current Slowmode:</span>
                      <span className="text-sm font-mono font-bold text-blue-400">
                        {groupDetails.settings?.slowModeSeconds ? `${groupDetails.settings.slowModeSeconds}s` : 'Disabled (0s)'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Quick Presets:</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: 'Off', sec: 0 },
                          { label: '10s', sec: 10 },
                          { label: '30s', sec: 30 },
                          { label: '1 min', sec: 60 },
                          { label: '5 min', sec: 300 },
                          { label: '15 min', sec: 900 },
                          { label: '1 hour', sec: 3600 }
                        ].map((preset) => (
                          <button
                            key={preset.sec}
                            onClick={() => handleApplySlowmode(preset.sec)}
                            disabled={applyingSlowmode}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                              (groupDetails.settings?.slowModeSeconds ?? 0) === preset.sec
                                ? 'bg-blue-600 text-white shadow-sm'
                                : `${themeCardBg} border ${themeBorder} hover:opacity-80`
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <input
                        type="number"
                        min="0"
                        max="86400"
                        value={slowmodeInput}
                        onChange={(e) => setSlowmodeInput(Number(e.target.value))}
                        className={`w-40 ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-mono`}
                        placeholder="Seconds"
                      />
                      <button
                        onClick={() => handleApplySlowmode(slowmodeInput)}
                        disabled={applyingSlowmode}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {applyingSlowmode ? 'Applying to Telegram...' : 'Apply Slowmode'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: ABUSE WORDS */}
              {groupDetailTab === 'abuse_words' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2 text-red-500">
                        <Ban className="w-4 h-4" /> Custom Abuse Words Management ({groupAbuseWords.length})
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Isolated per group. Messages containing any of these words will be moderated.</p>
                    </div>
                    {groupAbuseWords.length > 0 && (
                      <button
                        onClick={handleClearAbuseWords}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold"
                      >
                        Clear All Words
                      </button>
                    )}
                  </div>

                  {/* Add Word Form */}
                  <form onSubmit={handleAddAbuseWord} className="flex gap-2">
                    <input
                      type="text"
                      value={newAbuseWordInput}
                      onChange={(e) => setNewAbuseWordInput(e.target.value)}
                      placeholder="Add new word or phrase..."
                      className={`flex-1 ${themeInnerCardBg} border ${themeBorder} rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-red-500`}
                    />
                    <button
                      type="submit"
                      disabled={!newAbuseWordInput.trim()}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      + Add Word
                    </button>
                  </form>

                  {/* Search and Word Chips */}
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={abuseSearch}
                      onChange={(e) => setAbuseSearch(e.target.value)}
                      placeholder="Search abuse words..."
                      className={`w-full sm:w-64 ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-1.5 text-xs focus:outline-none`}
                    />

                    <div className="flex flex-wrap gap-2 pt-1 max-h-72 overflow-y-auto pr-1">
                      {groupAbuseWords
                        .filter(w => !debouncedAbuseSearch || w.toLowerCase().includes(debouncedAbuseSearch.toLowerCase()))
                        .map((w, idx) => (
                          <span
                            key={idx}
                            className={`${themeInnerCardBg} border ${themeBorder} px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-2 group hover:border-red-500/40`}
                          >
                            <span>{w}</span>
                            <button
                              onClick={() => handleRemoveAbuseWord(w)}
                              className="text-stone-400 hover:text-red-400 transition-colors"
                              title="Delete word"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      {groupAbuseWords.length === 0 && (
                        <p className={`text-xs ${themeMutedText} py-6 text-center w-full`}>No custom abuse words added for this group yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: MEMBERS & TELEGRAM ACTIONS */}
              {groupDetailTab === 'members' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2 text-blue-500">
                        <Users className="w-4 h-4" /> Group Members & Moderation Console ({groupMembersList.length})
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Real-time member actions executed against the authoritative Telegram API.</p>
                    </div>
                    <button
                      onClick={fetchData}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh Members
                    </button>
                  </div>

                  {memberActionFeedback && (
                    <div className={`p-3 rounded-xl text-xs font-semibold ${
                      memberActionFeedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {memberActionFeedback.message}
                    </div>
                  )}

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search member by name, username, or ID..."
                      className={`w-full sm:w-80 ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                    />

                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                      {groupMembersList
                        .filter(m => {
                          if (!debouncedMemberSearch) return true;
                          const s = debouncedMemberSearch.toLowerCase();
                          return (
                            String(m.userId).includes(s) ||
                            (m.firstName && m.firstName.toLowerCase().includes(s)) ||
                            (m.username && m.username.toLowerCase().includes(s))
                          );
                        })
                        .map((m, idx) => (
                          <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3`}>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold">{m.firstName || m.name || `User ${m.userId}`}</span>
                                {m.username && <span className={`text-xs font-mono ${themeMutedText}`}>@{m.username}</span>}
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                  m.role === 'creator' || m.role === 'administrator' ? 'bg-blue-500/10 text-blue-400' : 'bg-stone-700/20 text-stone-300'
                                }`}>
                                  {m.role || 'Member'}
                                </span>
                              </div>
                              <div className={`text-[10px] font-mono ${themeMutedText}`}>
                                User ID: {m.userId} {m.lastActive ? `• Last active: ${new Date(m.lastActive).toLocaleDateString()}` : ''}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                onClick={() => handleMemberAction('ban', m.userId)}
                                disabled={memberActionLoading[`ban_${m.userId}`]}
                                className="px-2.5 py-1 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold transition-colors"
                              >
                                {memberActionLoading[`ban_${m.userId}`] ? 'Banning...' : '🚫 Ban'}
                              </button>
                              <button
                                onClick={() => handleMemberAction('unban', m.userId)}
                                disabled={memberActionLoading[`unban_${m.userId}`]}
                                className="px-2.5 py-1 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-semibold transition-colors"
                              >
                                {memberActionLoading[`unban_${m.userId}`] ? 'Unbanning...' : '🔓 Unban'}
                              </button>
                              <button
                                onClick={() => handleMemberAction('restrict', m.userId)}
                                disabled={memberActionLoading[`restrict_${m.userId}`]}
                                className="px-2.5 py-1 bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-500/20 rounded-lg text-xs font-semibold transition-colors"
                              >
                                {memberActionLoading[`restrict_${m.userId}`] ? 'Muting...' : '🔇 Mute'}
                              </button>
                              <button
                                onClick={() => handleMemberAction('promote', m.userId)}
                                disabled={memberActionLoading[`promote_${m.userId}`]}
                                className="px-2.5 py-1 bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/20 rounded-lg text-xs font-semibold transition-colors"
                              >
                                {memberActionLoading[`promote_${m.userId}`] ? 'Promoting...' : '👮 Promote'}
                              </button>
                              <button
                                onClick={() => handleMemberAction('demote', m.userId)}
                                disabled={memberActionLoading[`demote_${m.userId}`]}
                                className="px-2.5 py-1 bg-stone-700/20 hover:bg-stone-700/40 text-stone-300 border border-stone-600/20 rounded-lg text-xs font-semibold transition-colors"
                              >
                                {memberActionLoading[`demote_${m.userId}`] ? 'Demoting...' : '🔻 Demote'}
                              </button>
                            </div>
                          </div>
                        ))}
                      {groupMembersList.length === 0 && (
                        <p className={`text-xs ${themeMutedText} py-6 text-center`}>No member records found for this group.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: TELEGRAM PERMISSIONS */}
              {(groupDetailTab === 'telegram_permissions' || groupDetailTab === 'permissions') && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Lock className="w-4 h-4 text-blue-500" /> Telegram Permissions Matrix
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>
                      Authoritative Telegram ChatMember permissions. Telegram hierarchy is strictly enforced.
                    </p>
                  </div>

                  {/* Roxie's Own Admin Permissions */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-500">
                      Roxie Administrator Permissions (Current Role: {groupPermissionsData?.roxieRole || '🛡️ Administrator'})
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(groupPermissionsData?.roxiePermissions || {}).map(([pKey, pVal]: [string, any]) => (
                        <div key={pKey} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex items-center justify-between text-xs`}>
                          <span className="font-mono">{pKey.replace('can_', '')}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pVal ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                            {pVal ? 'ALLOWED' : 'DENIED'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Default Group Member Permissions */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">
                      Default Member Permissions (Telegram setChatPermissions)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {Object.entries(groupPermissionsData?.defaultMemberPermissions || {}).map(([pKey, pVal]: [string, any]) => (
                        <div key={pKey} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex items-center justify-between text-xs`}>
                          <span className="font-mono">{pKey.replace('can_', '')}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pVal ? 'bg-blue-500/10 text-blue-500' : 'bg-stone-500/10 text-stone-400'}`}>
                            {pVal ? 'YES' : 'NO'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: BACKUP, EXPORT & RESTORE */}
              {groupDetailTab === 'backup' && (
                <div className="space-y-6">
                  {/* Header Banner */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-3`}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="space-y-1">
                        <h3 className="text-base font-bold flex items-center gap-2 text-emerald-400">
                          <Database className="w-5 h-5" /> 💾 Group Backup, Lossless Export & Restore Studio
                        </h3>
                        <p className={`text-xs ${themeMutedText}`}>
                          Isolated backup management for Group <strong className="font-mono text-emerald-400">{activeGroupDetailId}</strong>. JSON is the authoritative lossless format; CSV provides a flattened summary for human inspection.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Scope: 👥 GROUP ISOLATED
                        </span>
                      </div>
                    </div>

                    {backupNotification && (
                      <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 ${
                        backupNotification.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        <div className="flex items-center gap-2">
                          {backupNotification.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                          <span>{backupNotification.message}</span>
                        </div>
                        <button onClick={() => setBackupNotification(null)} className="opacity-70 hover:opacity-100">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Section 1: Quick Export Cards */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                      <Download className="w-4 h-4" /> 1. Quick Export & Downloads
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* JSON Download */}
                      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex flex-col justify-between space-y-3`}>
                        <div className="space-y-1">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-blue-400">
                            <FileCode className="w-4 h-4" /> 📥 Complete JSON Backup
                          </span>
                          <p className={`text-[11px] ${themeMutedText}`}>
                            Machine-restorable lossless export containing all settings, sticker packs, abuse words, lust modes, and automations.
                          </p>
                        </div>
                        <button
                          onClick={handleDownloadGroupJson}
                          disabled={backupLoading}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" /> Download JSON Backup
                        </button>
                      </div>

                      {/* CSV Download */}
                      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex flex-col justify-between space-y-3`}>
                        <div className="space-y-1">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-amber-400">
                            <FileText className="w-4 h-4" /> 📊 Flattened CSV Report
                          </span>
                          <p className={`text-[11px] ${themeMutedText}`}>
                            Human-readable spreadsheet export of active rules and policies. Note: Use JSON for complete lossless restore.
                          </p>
                        </div>
                        <button
                          onClick={handleDownloadGroupCsv}
                          disabled={backupLoading}
                          className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" /> Download CSV Report
                        </button>
                      </div>

                      {/* Copy JSON */}
                      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex flex-col justify-between space-y-3`}>
                        <div className="space-y-1">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-purple-400">
                            <Copy className="w-4 h-4" /> 📋 Copy JSON to Clipboard
                          </span>
                          <p className={`text-[11px] ${themeMutedText}`}>
                            Directly copy the formatted backup payload to paste into code editors or other group configs.
                          </p>
                        </div>
                        <button
                          onClick={handleCopyGroupJson}
                          className="w-full py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          {copiedJsonToast ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedJsonToast ? 'Copied to Clipboard!' : 'Copy JSON Configuration'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Direct JSON Editor */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                          <FileCode className="w-4 h-4" /> 2. Direct JSON Editor
                        </h4>
                        <p className={`text-[11px] ${themeMutedText}`}>
                          Inspect and modify raw JSON parameters directly with instant syntax validation.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleLoadGroupJsonIntoEditor}
                          disabled={backupLoading}
                          className="px-3 py-1.5 bg-stone-700/50 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${backupLoading ? 'animate-spin' : ''}`} /> Load Current JSON
                        </button>
                        <button
                          onClick={handleFormatEditorJson}
                          disabled={!backupEditorJson.trim()}
                          className="px-3 py-1.5 bg-stone-700/50 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-40"
                        >
                          Format
                        </button>
                        <button
                          onClick={handleValidateEditorJson}
                          disabled={!backupEditorJson.trim()}
                          className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-40"
                        >
                          Validate Syntax
                        </button>
                      </div>
                    </div>

                    {backupEditorError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-mono flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{backupEditorError}</span>
                      </div>
                    )}

                    {backupEditorSuccess && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 font-mono flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{backupEditorSuccess}</span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <textarea
                        value={backupEditorJson}
                        onChange={(e) => {
                          setBackupEditorJson(e.target.value);
                          setBackupEditorError(null);
                          setBackupEditorSuccess(null);
                        }}
                        placeholder='Click "Load Current JSON" above to populate this editor with the group configuration.'
                        rows={12}
                        className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-purple-500 leading-relaxed`}
                        spellCheck={false}
                      />
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className={`text-[11px] ${themeMutedText}`}>
                          Editing JSON directly requires applying changes to take runtime effect.
                        </span>
                        <button
                          onClick={() => {
                            if (handleValidateEditorJson()) {
                              handlePreviewImport(backupEditorJson);
                            }
                          }}
                          disabled={!backupEditorJson.trim() || backupLoading}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors shadow-sm flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" /> Preview & Apply JSON Edits
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Import & Partial Restore Studio */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-5`}>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Upload className="w-4 h-4" /> 3. Import & Partial Configuration Restore
                      </h4>
                      <p className={`text-[11px] ${themeMutedText}`}>
                        Restore full backups or selectively restore specific categories without overwriting existing data.
                      </p>
                    </div>

                    {/* File upload or paste input */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <label className="cursor-pointer px-4 py-2 bg-stone-700/40 hover:bg-stone-700/60 rounded-xl text-xs font-semibold flex items-center gap-2 text-stone-200 border border-stone-600/30 transition-colors">
                          <Upload className="w-4 h-4" /> Upload .json Backup File
                          <input
                            type="file"
                            accept=".json,application/json"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                  setBackupImportJson(ev.target?.result as string || '');
                                };
                                reader.readAsText(file);
                              }
                            }}
                          />
                        </label>
                        {backupImportJson && (
                          <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> JSON Loaded ({backupImportJson.length} bytes)
                          </span>
                        )}
                      </div>

                      <textarea
                        value={backupImportJson}
                        onChange={(e) => setBackupImportJson(e.target.value)}
                        placeholder='Or paste exported group backup JSON here: { "backupVersion": "1.0", "settings": { ... } }'
                        rows={4}
                        className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-emerald-500`}
                        spellCheck={false}
                      />
                    </div>

                    {/* Group ID Mismatch Warning & Override */}
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-2`}>
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          id="overrideChatIdCheck"
                          checked={backupOverrideChatId}
                          onChange={(e) => setBackupOverrideChatId(e.target.checked)}
                          className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <label htmlFor="overrideChatIdCheck" className="text-xs cursor-pointer select-none space-y-0.5 block">
                          <span className="font-bold text-stone-200 block">
                            Import as new configuration for this group (Allow Chat ID Override)
                          </span>
                          <span className={`text-[11px] ${themeMutedText} block`}>
                            Enable this option if you are applying a configuration template exported from another group to this group ({activeGroupDetailId}).
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Partial Import Section Selector Checkboxes */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-200">
                          Select Categories to Restore:
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setBackupImportSelectedSections([
                              'settings', 'welcome', 'moderation', 'contentProtection', 'abuseWords',
                              'stickers', 'lustMode', 'autoResponse', 'autoSticker', 'slowmode',
                              'personality', 'schedules', 'notes'
                            ])}
                            className="text-[11px] text-blue-400 hover:underline font-semibold"
                          >
                            Select All
                          </button>
                          <span className="text-stone-600">•</span>
                          <button
                            onClick={() => setBackupImportSelectedSections([])}
                            className="text-[11px] text-stone-400 hover:underline font-semibold"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                        {[
                          { id: 'settings', label: '⚙️ General Settings' },
                          { id: 'welcome', label: '👋 Welcome & Goodbye' },
                          { id: 'moderation', label: '🛡️ Moderation & Spam' },
                          { id: 'contentProtection', label: '🔒 Content Protection' },
                          { id: 'abuseWords', label: '🤬 Abuse Words List' },
                          { id: 'stickers', label: '🎨 Sticker Packs & Library' },
                          { id: 'lustMode', label: '❤️ Lust Mode & Levels' },
                          { id: 'autoResponse', label: '🤖 Auto-Response Engine' },
                          { id: 'autoSticker', label: '🎭 Auto-Sticker Engine' },
                          { id: 'slowmode', label: '⏱️ Slowmode Delay' },
                          { id: 'personality', label: '💬 AI & Personality' },
                          { id: 'schedules', label: '📅 Schedules' },
                          { id: 'notes', label: '📝 Group Notes' }
                        ].map((sec) => {
                          const isSelected = backupImportSelectedSections.includes(sec.id);
                          return (
                            <button
                              key={sec.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setBackupImportSelectedSections(backupImportSelectedSections.filter(s => s !== sec.id));
                                } else {
                                  setBackupImportSelectedSections([...backupImportSelectedSections, sec.id]);
                                }
                              }}
                              className={`p-2.5 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition-all ${
                                isSelected
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                  : `${themeInnerCardBg} ${themeBorder} opacity-60 hover:opacity-90`
                              }`}
                            >
                              <span>{sec.label}</span>
                              {isSelected ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <div className="w-3.5 h-3.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Import Action Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-stone-800">
                      <button
                        onClick={() => handlePreviewImport(backupImportJson)}
                        disabled={!backupImportJson.trim() || backupLoading || backupImportSelectedSections.length === 0}
                        className="px-4 py-2 bg-stone-700/50 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" /> 🔍 Preview Changes
                      </button>
                      <button
                        onClick={() => handleApplyImport(backupImportJson)}
                        disabled={!backupImportJson.trim() || backupLoading || backupImportSelectedSections.length === 0}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        <Database className="w-3.5 h-3.5" /> 💾 Apply Configuration
                      </button>
                    </div>
                  </div>

                  {/* Section 4: Automatic Safety Backups History */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          <Clock className="w-4 h-4" /> 4. Automatic Safety Backups History ({backupHistoryList.length})
                        </h4>
                        <p className={`text-[11px] ${themeMutedText}`}>
                          Automatic snapshots saved in <code className="font-mono text-[10px]">data/backups/group_{activeGroupDetailId}/</code> before every configuration import.
                        </p>
                      </div>
                      <button
                        onClick={() => fetchData()}
                        className="p-1.5 rounded-lg bg-stone-800/40 hover:bg-stone-800 text-stone-300 text-xs flex items-center gap-1"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh Snapshots
                      </button>
                    </div>

                    {backupHistoryList.length === 0 ? (
                      <div className={`p-6 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-center space-y-1`}>
                        <p className={`text-xs ${themeMutedText}`}>No pre-import safety backups recorded yet for this group.</p>
                        <p className={`text-[10px] ${themeMutedText}`}>A snapshot is generated automatically each time a configuration is imported.</p>
                      </div>
                    ) : (
                      <div className={`border ${themeBorder} rounded-xl overflow-hidden`}>
                        <table className="w-full text-xs text-left">
                          <thead className={`${themeInnerCardBg} border-b ${themeBorder} text-[11px] font-semibold text-stone-400`}>
                            <tr>
                              <th className="p-3">Snapshot Timestamp</th>
                              <th className="p-3">File Name</th>
                              <th className="p-3">Size</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-800">
                            {backupHistoryList.map((snap: any, idx: number) => (
                              <tr key={idx} className="hover:bg-stone-800/20">
                                <td className="p-3 font-mono text-[11px] text-stone-300">
                                  {new Date(snap.timestamp).toLocaleString()}
                                </td>
                                <td className="p-3 font-mono text-[11px] text-blue-400">
                                  {snap.filename}
                                </td>
                                <td className="p-3 font-mono text-[11px] text-stone-400">
                                  {(snap.size / 1024).toFixed(1)} KB
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    onClick={() => handleRestoreSafetySnapshot(snap.filename)}
                                    disabled={backupLoading}
                                    className="px-3 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1"
                                  >
                                    <RefreshCw className="w-3 h-3" /> Restore Snapshot
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* INNER TAB: DANGER ZONE */}
              {groupDetailTab === 'danger_zone' && (
                <div className={`${themeCardBg} border border-red-500/30 rounded-2xl p-6 space-y-6 bg-red-950/5`}>
                  <div className="border-b border-red-500/20 pb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2 text-red-400">
                      <AlertTriangle className="w-4 h-4" /> Danger Zone — Destructive Operations
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>
                      These actions permanently clear group state, reset settings, or remove Roxie from the chat. All actions require confirmation.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Reset Group Settings */}
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-red-400 block">Reset Group Settings</span>
                        <p className={`text-[11px] ${themeMutedText}`}>Revert all moderation, protection, and response policies for this group to factory defaults.</p>
                      </div>
                      <button
                        onClick={() => { setDangerModal('reset_settings'); setDangerConfirmInput(''); }}
                        className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold"
                      >
                        Reset Group Settings
                      </button>
                    </div>

                    {/* Clear Conversation Memory */}
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-red-400 block">Clear Group Memory</span>
                        <p className={`text-[11px] ${themeMutedText}`}>Permanently wipe all recorded conversation history and AI context memory for this chat.</p>
                      </div>
                      <button
                        onClick={() => { setDangerModal('clear_memory'); setDangerConfirmInput(''); }}
                        className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold"
                      >
                        Clear Memory
                      </button>
                    </div>

                    {/* Remove All Custom Stickers */}
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-red-400 block">Remove Custom Stickers</span>
                        <p className={`text-[11px] ${themeMutedText}`}>Unlink and remove all custom sticker pack configurations belonging to this group.</p>
                      </div>
                      <button
                        onClick={() => { setDangerModal('clear_stickers'); setDangerConfirmInput(''); }}
                        className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold"
                      >
                        Remove Custom Stickers
                      </button>
                    </div>

                    {/* Leave Group */}
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-red-400 block">Leave Telegram Group</span>
                        <p className={`text-[11px] ${themeMutedText}`}>Command Roxie to leave this Telegram chat immediately via Telegram leaveChat API.</p>
                      </div>
                      <button
                        onClick={() => {
                          const gInfo = groups.find(g => g.chatId === activeGroupDetailId);
                          if (gInfo) {
                            setLeaveModalGroup(gInfo);
                            setLeaveConfirmInput('');
                          }
                        }}
                        className="px-3 py-1.5 bg-red-600 text-white hover:bg-red-500 rounded-xl text-xs font-semibold"
                      >
                        Leave Group
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP COMMANDS */}
              {groupDetailTab === 'commands' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-blue-500" /> Commands Usable in This Group
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {commands.slice(0, 12).map((cmd, idx) => (
                      <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 space-y-1`}>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-blue-500">{cmd.command}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 font-semibold">{cmd.permission}</span>
                        </div>
                        <p className={`text-xs ${themeMutedText}`}>{cmd.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP ACTIVITY */}
              {groupDetailTab === 'activity' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-500" /> Activity Log for {groupDetails.chatTitle}
                  </h3>
                  <div className="space-y-2">
                    {(groupDetails.logs || []).map((l: any, idx: number) => (
                      <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex items-center justify-between text-xs`}>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-stone-400">{new Date(l.timestamp).toLocaleTimeString()}</span>
                          <span className="px-2 py-0.5 rounded font-bold uppercase text-[10px] bg-blue-500/10 text-blue-500">{l.action}</span>
                          <span>{l.details || l.reason || 'Event executed'}</span>
                        </div>
                        <span className={`font-mono ${themeMutedText}`}>@{l.adminUsername || 'system'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP SCHEDULES & RULES */}
              {groupDetailTab === 'schedules' && (
                <div className="space-y-6">
                  {/* Scheduled Messages for this group */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-500" /> Scheduled Messages ({schedulesList.filter(s => s.chatId === activeGroupDetailId).length})
                        </h3>
                        <p className={`text-xs ${themeMutedText}`}>Automated recurring broadcasts and scheduled announcements for {groupDetails.chatTitle}.</p>
                      </div>
                      <button
                        onClick={() => {
                          setEditingSchedule(null);
                          setNewScheduleForm({
                            chatId: activeGroupDetailId,
                            name: '',
                            message: '',
                            scheduleType: 'interval',
                            intervalStr: '1h',
                            nextRunDate: new Date().toISOString().split('T')[0],
                            nextRunTime: '12:00',
                            timezone: 'UTC',
                            contentType: 'text',
                            mediaFileId: '',
                            replyToMessageId: '',
                            enabled: true
                          });
                          setShowCreateScheduleModal(true);
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" /> New Schedule
                      </button>
                    </div>

                    {schedulesList.filter(s => s.chatId === activeGroupDetailId).length === 0 ? (
                      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-8 text-center space-y-2`}>
                        <Clock className="w-8 h-8 text-stone-500 mx-auto opacity-40" />
                        <p className="text-xs font-semibold text-stone-400">No scheduled messages configured for this group</p>
                        <p className={`text-[11px] ${themeMutedText}`}>Create a schedule to automatically send hourly reminders, daily announcements, or custom broadcasts.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {schedulesList.filter(s => s.chatId === activeGroupDetailId).map((s: any) => (
                          <div key={s.id} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs`}>
                            <div className="space-y-1 max-w-xl">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-bold">ID: {s.id}</span>
                                <span className="font-semibold text-sm">{s.name || 'Scheduled Message'}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.enabled !== false ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-stone-800 text-stone-400'}`}>
                                  {s.enabled !== false ? '● Active' : '○ Paused'}
                                </span>
                                {s.scheduleType && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 uppercase font-semibold">
                                    {s.scheduleType}
                                  </span>
                                )}
                              </div>
                              <p className={`line-clamp-2 text-xs ${isDark ? 'text-stone-300' : 'text-slate-700'}`}>{s.message || s.messageText}</p>
                              <div className={`flex flex-wrap items-center gap-3 text-[11px] ${themeMutedText} pt-1`}>
                                <span>Interval: <strong className="text-stone-300">{s.intervalFormatted || 'Custom'}</strong></span>
                                <span>Next: <strong className="text-stone-300">{s.nextRun ? new Date(s.nextRun).toLocaleString() : 'N/A'}</strong></span>
                                <span>Runs: <strong className="text-stone-300">{s.runsCount || 0}</strong></span>
                                {s.lastStatus && (
                                  <span className={s.lastStatus === 'success' ? 'text-emerald-400' : 'text-rose-400'}>
                                    Last: {s.lastStatus}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleToggleSchedule(s.id, s.enabled !== false)}
                                className={`px-2.5 py-1 rounded-lg font-semibold text-xs border ${
                                  s.enabled !== false
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                }`}
                              >
                                {s.enabled !== false ? 'Pause' : 'Enable'}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingSchedule(s);
                                  setNewScheduleForm({
                                    chatId: s.chatId,
                                    name: s.name || '',
                                    message: s.message || s.messageText || '',
                                    scheduleType: s.scheduleType || 'interval',
                                    intervalStr: s.intervalFormatted || '1h',
                                    nextRunDate: s.nextRun ? new Date(s.nextRun).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                                    nextRunTime: s.nextRun ? new Date(s.nextRun).toISOString().split('T')[1].slice(0, 5) : '12:00',
                                    timezone: s.timezone || 'UTC',
                                    contentType: s.contentType || 'text',
                                    mediaFileId: s.mediaFileId || '',
                                    replyToMessageId: s.replyToMessageId ? String(s.replyToMessageId) : '',
                                    enabled: s.enabled !== false
                                  });
                                  setShowCreateScheduleModal(true);
                                }}
                                className={`px-2.5 py-1 rounded-lg ${themeInnerCardBg} border ${themeBorder} text-stone-300 hover:text-white`}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteSchedule(s.id)}
                                className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                                title="Delete Schedule"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Automation Rules for this group */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-500" /> Automation Rules ({groupAutomationsList.length})
                        </h3>
                        <p className={`text-xs ${themeMutedText}`}>Reactive automation triggers and enforcement actions for {groupDetails.chatTitle}.</p>
                      </div>
                      <button
                        onClick={() => setShowCreateAutomationModal(true)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Rule
                      </button>
                    </div>

                    {groupAutomationsList.length === 0 ? (
                      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-8 text-center space-y-2`}>
                        <Zap className="w-8 h-8 text-stone-500 mx-auto opacity-40" />
                        <p className="text-xs font-semibold text-stone-400">No automation rules configured for this group</p>
                        <p className={`text-[11px] ${themeMutedText}`}>Add custom reactive rules (e.g., auto-delete spam, instant user warns, link blocks).</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {groupAutomationsList.map((a: any) => (
                          <div key={a.id} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between text-xs`}>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-bold">RULE: {a.id}</span>
                                <span className="font-semibold text-blue-400">Trigger: {a.trigger}</span>
                                <span className="text-stone-500">➔</span>
                                <span className="font-semibold text-amber-400">Action: {a.action}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.enabled !== false ? 'bg-emerald-500/10 text-emerald-400' : 'bg-stone-800 text-stone-400'}`}>
                                  {a.enabled !== false ? 'Active' : 'Disabled'}
                                </span>
                              </div>
                              {a.parameters && (
                                <p className={`text-[11px] ${themeMutedText}`}>Parameters: <code className="font-mono">{a.parameters}</code></p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleToggleAutomation(activeGroupDetailId, a.id, a.enabled !== false)}
                                className={`px-2 py-1 rounded-lg text-xs font-semibold border ${
                                  a.enabled !== false
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                }`}
                              >
                                {a.enabled !== false ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                onClick={() => handleDeleteAutomation(activeGroupDetailId, a.id)}
                                className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB: PRIVATE CHATS (DMs) */}
          {activeNav === 'private-chats' && (
            <div className={`${themeCardBg} border rounded-2xl h-[calc(100vh-170px)] flex flex-col md:flex-row overflow-hidden`}>
              
              {/* Left Pane: Users list */}
              <div className={`w-full md:w-80 border-r ${themeBorder} p-4 flex flex-col space-y-3 shrink-0 overflow-hidden`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-500" /> Private Conversations ({privateChats.length})
                  </h3>
                </div>

                <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                  {privateChats.map((chat) => {
                    const isSelected = activePrivateChatId === chat.chatId;
                    return (
                      <div
                        key={chat.chatId}
                        onClick={() => setActivePrivateChatId(chat.chatId)}
                        className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-600/10 border-blue-500/30'
                            : `${themeInnerCardBg} ${themeBorder} hover:opacity-80`
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold truncate max-w-[140px]">{chat.name}</span>
                          <span className={`text-[10px] font-mono ${themeMutedText}`}>
                            {new Date(chat.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className={`text-xs ${themeMutedText} truncate mt-1`}>{chat.lastMessage || 'Conversation active'}</p>
                        <div className="flex items-center gap-2 mt-1 text-[10px]">
                          <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-500 font-medium">
                            {chat.language || 'English'}
                          </span>
                          <span className={`font-mono ${themeMutedText}`}>ID: {chat.userId}</span>
                        </div>
                      </div>
                    );
                  })}
                  {privateChats.length === 0 && (
                    <p className={`text-xs ${themeMutedText} text-center py-12`}>No private conversations recorded yet.</p>
                  )}
                </div>
              </div>

              {/* Right Pane: Conversation Thread */}
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {activePrivateChatId ? (
                  <>
                    {/* Thread Header */}
                    <div className={`p-4 border-b ${themeBorder} flex items-center justify-between shrink-0`}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm">
                          {privateChats.find(c => c.chatId === activePrivateChatId)?.name?.slice(0, 1) || 'U'}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold">
                            {privateChats.find(c => c.chatId === activePrivateChatId)?.name || `Chat ${activePrivateChatId}`}
                          </h4>
                          <span className={`text-[11px] font-mono ${themeMutedText}`}>
                            Chat ID: {activePrivateChatId} • Detected Language: {privateChats.find(c => c.chatId === activePrivateChatId)?.language || 'English'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Messages Scroll Area */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-3">
                      {privateChatMessages.map((m, idx) => {
                        const isOut = m.direction === 'out' || m.role === 'assistant';
                        return (
                          <div key={idx} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-md p-3 rounded-2xl text-xs space-y-1 ${
                              isOut 
                                ? 'bg-blue-600 text-white rounded-br-none' 
                                : `${themeInnerCardBg} border ${themeBorder} rounded-bl-none`
                            }`}>
                              <div className="flex items-center justify-between gap-4 text-[10px] opacity-70">
                                <span>{isOut ? 'Roxie' : 'User'}</span>
                                <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
                              </div>
                              {m.mediaType === 'sticker' ||
                              m.content?.startsWith('🎨 Sticker') ||
                              m.content?.includes('[Sent sticker]') ? (
                                <StickerPreview mediaFileId={m.mediaFileId} content={m.content} isDark={true} />
                              ) : (
                                <p className="whitespace-pre-wrap">{m.content}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {privateChatMessages.length === 0 && (
                        <p className={`text-xs ${themeMutedText} text-center py-16`}>No messages in this conversation yet.</p>
                      )}
                    </div>

                    {/* Reply Composer */}
                    <form onSubmit={handleSendPrivateReply} className={`p-4 border-t ${themeBorder} flex items-center gap-2 shrink-0`}>
                      <input
                        type="text"
                        placeholder="Type reply to user..."
                        value={privateReplyText}
                        onChange={(e) => setPrivateReplyText(e.target.value)}
                        className={`flex-1 ${themeInnerCardBg} border ${themeBorder} rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-blue-500`}
                      />
                      <button
                        type="submit"
                        disabled={sendingPrivateReply || !privateReplyText.trim()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                      >
                        <Send className="w-3.5 h-3.5" /> Send
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2">
                    <MessageSquare className="w-10 h-10 text-stone-400" />
                    <h4 className="text-xs font-bold">Select a Conversation</h4>
                    <p className={`text-xs ${themeMutedText}`}>Choose a user from the left pane to view their chat history with Roxie.</p>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB: MESSAGES (STORED GROUP MESSAGES) */}
          {activeNav === 'messages' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" /> Stored Message Center
                </h3>
                <p className={`text-xs ${themeMutedText}`}>Inspection of messages received and remembered by Roxie.</p>
              </div>

              <div className="space-y-3">
                {allStoredMessages.map((msg: any, idx: number) => (
                  <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-start justify-between gap-3`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">{msg.name || (msg.role === 'assistant' ? 'Roxie' : 'User')}</span>
                        {msg.groupTitle && <span className={`text-[10px] ${themeMutedText}`}>in {msg.groupTitle}</span>}
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${msg.role === 'assistant' ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'}`}>
                          {msg.role}
                        </span>
                      </div>
                      <p className="text-xs">{msg.content}</p>
                    </div>
                    <span className={`text-[10px] font-mono ${themeMutedText} shrink-0`}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
                {allStoredMessages.length === 0 && (
                  <p className={`text-xs ${themeMutedText} text-center py-12`}>Select a specific group to view its stored conversation memory.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB: SEND MESSAGE */}
          {activeNav === 'send-message' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6 max-w-2xl`}>
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Send className="w-4 h-4 text-blue-500" /> Send Direct Telegram Message
                </h3>
                <p className={`text-xs ${themeMutedText}`}>Transmit a message to a connected group or private chat directly via Telegram API.</p>
              </div>

              {sendResult && (
                <div className={`p-4 rounded-xl text-xs border ${sendResult.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                  {sendResult.ok ? '✅ Message sent successfully!' : `❌ Failed to send: ${sendResult.data?.error}`}
                </div>
              )}

              <form onSubmit={handleSendMessage} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold block">Target Destination</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="targetType"
                        checked={sendTargetType === 'group'}
                        onChange={() => { setSendTargetType('group'); setSendTargetId(''); }}
                        className="text-blue-600"
                      />
                      <span>Telegram Group</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="targetType"
                        checked={sendTargetType === 'private'}
                        onChange={() => { setSendTargetType('private'); setSendTargetId(''); }}
                        className="text-blue-600"
                      />
                      <span>Private Chat (DM)</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold block">Select Target</label>
                  {sendTargetType === 'group' ? (
                    <select
                      value={sendTargetId}
                      onChange={(e) => setSendTargetId(e.target.value)}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2.5 text-xs focus:outline-none`}
                    >
                      <option value="">-- Choose Group --</option>
                      {groups.filter(g => !g.botLeft).map(g => (
                        <option key={g.chatId} value={g.chatId}>{g.chatTitle} ({g.chatId})</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={sendTargetId}
                      onChange={(e) => setSendTargetId(e.target.value)}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2.5 text-xs focus:outline-none`}
                    >
                      <option value="">-- Choose User --</option>
                      {privateChats.map(c => (
                        <option key={c.chatId} value={c.chatId}>{c.name} ({c.chatId})</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold block">Message Content (HTML supported)</label>
                  <textarea
                    rows={4}
                    placeholder="Enter message to send..."
                    value={sendMessageContent}
                    onChange={(e) => setSendMessageContent(e.target.value)}
                    className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs focus:outline-none focus:border-blue-500`}
                  />
                </div>

                {sendMessageContent.trim() && (
                  <div className="space-y-1 pt-1">
                    <span className={`text-[11px] ${themeMutedText}`}>Live Preview:</span>
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs`}>
                      {sendMessageContent}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={sendingMessage || !sendTargetId || !sendMessageContent.trim()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingMessage ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            </div>
          )}

          {/* TAB: SCHEDULES & RULES */}
          {activeNav === 'schedules' && (
            <div className="space-y-6">
              {/* Header & Main Schedule Management */}
              <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-500" /> Scheduled Messages ({schedulesList.length})
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>Configure automated recurring messages, intervals, and one-time announcements across all chats.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingSchedule(null);
                        setNewScheduleForm({
                          chatId: groups[0]?.chatId || '',
                          name: '',
                          message: '',
                          scheduleType: 'interval',
                          intervalStr: '1h',
                          nextRunDate: new Date().toISOString().split('T')[0],
                          nextRunTime: '12:00',
                          timezone: 'UTC',
                          contentType: 'text',
                          mediaFileId: '',
                          replyToMessageId: '',
                          enabled: true
                        });
                        setShowCreateScheduleModal(true);
                      }}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> New Schedule
                    </button>
                    <button
                      onClick={() => fetchData()}
                      disabled={schedulesLoading}
                      className={`p-2 rounded-xl ${themeInnerCardBg} border ${themeBorder} text-stone-400 hover:text-white transition-colors`}
                      title="Refresh"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${schedulesLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Filter by Target Group */}
                <div className="flex items-center gap-2 text-xs">
                  <span className={`font-semibold ${themeMutedText}`}>Filter Target:</span>
                  <select
                    value={schedulesFilterChatId}
                    onChange={(e) => setSchedulesFilterChatId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className={`${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none`}
                  >
                    <option value="all">All Groups ({schedulesList.length} schedules)</option>
                    {groups.map(g => (
                      <option key={g.chatId} value={g.chatId}>
                        {g.chatTitle} ({schedulesList.filter(s => s.chatId === g.chatId).length})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Schedules List */}
                {schedulesList.filter(s => schedulesFilterChatId === 'all' || s.chatId === schedulesFilterChatId).length === 0 ? (
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-10 text-center space-y-3`}>
                    <Clock className="w-10 h-10 text-stone-500 mx-auto opacity-40" />
                    <p className="text-sm font-semibold text-stone-300">No scheduled messages found</p>
                    <p className={`text-xs ${themeMutedText} max-w-sm mx-auto`}>
                      Click "New Schedule" to create automated recurring announcements, hourly reminders, or scheduled notices for any group.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {schedulesList
                      .filter(s => schedulesFilterChatId === 'all' || s.chatId === schedulesFilterChatId)
                      .map((s: any) => {
                        const targetGroup = groups.find(g => g.chatId === s.chatId);
                        return (
                          <div key={s.id} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs`}>
                            <div className="space-y-1.5 max-w-2xl">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-bold">ID: {s.id}</span>
                                <span className="font-bold text-sm">{s.name || 'Scheduled Broadcast'}</span>
                                <span className="text-stone-400">➔</span>
                                <span className="font-semibold text-blue-400">{targetGroup?.chatTitle || s.chatTitle || `Chat ${s.chatId}`}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.enabled !== false ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-stone-800 text-stone-400'}`}>
                                  {s.enabled !== false ? '● Active' : '○ Paused'}
                                </span>
                                {s.scheduleType && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 uppercase font-semibold">
                                    {s.scheduleType}
                                  </span>
                                )}
                              </div>
                              <p className={`line-clamp-2 text-xs ${isDark ? 'text-stone-300' : 'text-slate-700'}`}>{s.message || s.messageText}</p>
                              <div className={`flex flex-wrap items-center gap-3 text-[11px] ${themeMutedText} pt-1`}>
                                <span>Interval: <strong className="text-stone-300">{s.intervalFormatted || 'Custom'}</strong></span>
                                <span>Next: <strong className="text-stone-300">{s.nextRun ? new Date(s.nextRun).toLocaleString() : 'N/A'}</strong></span>
                                <span>Runs: <strong className="text-stone-300">{s.runsCount || 0}</strong></span>
                                {s.lastRun && (
                                  <span>Last: <strong className="text-stone-300">{new Date(s.lastRun).toLocaleString()}</strong></span>
                                )}
                                {s.lastStatus && (
                                  <span className={s.lastStatus === 'success' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                                    Status: {s.lastStatus}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleToggleSchedule(s.id, s.enabled !== false)}
                                className={`px-3 py-1.5 rounded-xl font-semibold text-xs border transition-colors ${
                                  s.enabled !== false
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                }`}
                              >
                                {s.enabled !== false ? 'Pause' : 'Enable'}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingSchedule(s);
                                  setNewScheduleForm({
                                    chatId: s.chatId,
                                    name: s.name || '',
                                    message: s.message || s.messageText || '',
                                    scheduleType: s.scheduleType || 'interval',
                                    intervalStr: s.intervalFormatted || '1h',
                                    nextRunDate: s.nextRun ? new Date(s.nextRun).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                                    nextRunTime: s.nextRun ? new Date(s.nextRun).toISOString().split('T')[1].slice(0, 5) : '12:00',
                                    timezone: s.timezone || 'UTC',
                                    contentType: s.contentType || 'text',
                                    mediaFileId: s.mediaFileId || '',
                                    replyToMessageId: s.replyToMessageId ? String(s.replyToMessageId) : '',
                                    enabled: s.enabled !== false
                                  });
                                  setShowCreateScheduleModal(true);
                                }}
                                className={`px-3 py-1.5 rounded-xl ${themeInnerCardBg} border ${themeBorder} text-stone-300 hover:text-white transition-colors`}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteSchedule(s.id)}
                                className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
                                title="Delete Schedule"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Group Automation Rules Section */}
              <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" /> Group Automation Rules
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>Configure reactive automation triggers and moderation actions for individual groups.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={schedulesFilterChatId === 'all' ? (groups[0]?.chatId || '') : schedulesFilterChatId}
                      onChange={(e) => {
                        const cid = Number(e.target.value);
                        setSchedulesFilterChatId(cid);
                        fetchAutomations(cid);
                      }}
                      className={`${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none`}
                    >
                      {groups.map(g => (
                        <option key={g.chatId} value={g.chatId}>
                          {g.chatTitle}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowCreateAutomationModal(true)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Rule
                    </button>
                  </div>
                </div>

                {groupAutomationsList.length === 0 ? (
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-8 text-center space-y-2`}>
                    <Zap className="w-8 h-8 text-stone-500 mx-auto opacity-40" />
                    <p className="text-xs font-semibold text-stone-400">No automation rules configured for selected group</p>
                    <p className={`text-[11px] ${themeMutedText}`}>Add custom reactive rules (e.g., auto-delete spam, instant user warns, link blocks).</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupAutomationsList.map((a: any) => {
                      const curChatId = schedulesFilterChatId === 'all' ? groups[0]?.chatId : schedulesFilterChatId;
                      return (
                        <div key={a.id} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between text-xs`}>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-bold">RULE: {a.id}</span>
                              <span className="font-semibold text-blue-400">Trigger: {a.trigger}</span>
                              <span className="text-stone-500">➔</span>
                              <span className="font-semibold text-amber-400">Action: {a.action}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.enabled !== false ? 'bg-emerald-500/10 text-emerald-400' : 'bg-stone-800 text-stone-400'}`}>
                                {a.enabled !== false ? 'Active' : 'Disabled'}
                              </span>
                            </div>
                            {a.parameters && (
                              <p className={`text-[11px] ${themeMutedText}`}>Parameters: <code className="font-mono">{a.parameters}</code></p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleAutomation(Number(curChatId), a.id, a.enabled !== false)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                                a.enabled !== false
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              }`}
                            >
                              {a.enabled !== false ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => handleDeleteAutomation(Number(curChatId), a.id)}
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: BROADCAST */}
          {activeNav === 'broadcast' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6 max-w-3xl`}>
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Radio className="w-4 h-4 text-blue-500" /> Multi-Group Broadcast
                </h3>
                <p className={`text-xs ${themeMutedText}`}>Broadcast announcements across multiple selected groups with rate-limiting & error isolation.</p>
              </div>

              {broadcastResult && (
                <div className={`p-4 rounded-xl text-xs border ${broadcastResult.failed === 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}`}>
                  Broadcast Complete: Sent to {broadcastResult.sent} of {broadcastResult.total} groups. {broadcastResult.failed > 0 && `(${broadcastResult.failed} failed)`}
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold">Select Target Groups ({broadcastSelectedGroups.length} selected)</label>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setBroadcastSelectedGroups(groups.filter(g => !g.botLeft).map(g => g.chatId))}
                        className="text-blue-500 hover:underline"
                      >
                        Select All
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => setBroadcastSelectedGroups([])}
                        className="text-stone-400 hover:underline"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                    {groups.filter(g => !g.botLeft).map(g => {
                      const isChecked = broadcastSelectedGroups.includes(g.chatId);
                      return (
                        <label key={g.chatId} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex items-center gap-3 cursor-pointer text-xs`}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setBroadcastSelectedGroups([...broadcastSelectedGroups, g.chatId]);
                              } else {
                                setBroadcastSelectedGroups(broadcastSelectedGroups.filter(id => id !== g.chatId));
                              }
                            }}
                            className="w-4 h-4 rounded text-blue-600"
                          />
                          <span className="font-semibold truncate">{g.chatTitle}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold block">Announcement Message</label>
                  <textarea
                    rows={4}
                    placeholder="Enter broadcast announcement..."
                    value={broadcastContent}
                    onChange={(e) => setBroadcastContent(e.target.value)}
                    className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs focus:outline-none focus:border-blue-500`}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowBroadcastConfirm(true)}
                  disabled={broadcasting || broadcastSelectedGroups.length === 0 || !broadcastContent.trim()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  <Radio className="w-3.5 h-3.5" />
                  {broadcasting ? 'Broadcasting...' : `Broadcast to ${broadcastSelectedGroups.length} Groups`}
                </button>
              </div>

              {/* Confirmation Modal */}
              {showBroadcastConfirm && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                  <div className={`${themeCardBg} border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl`}>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" /> Confirm Broadcast
                    </h3>
                    <p className="text-xs">
                      You are about to transmit this announcement to <strong className="text-blue-500">{broadcastSelectedGroups.length} groups</strong>. Proceed?
                    </p>
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs max-h-32 overflow-y-auto`}>
                      {broadcastContent}
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        onClick={() => setShowBroadcastConfirm(false)}
                        className={`px-3 py-1.5 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs`}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleBroadcast}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold"
                      >
                        Confirm Broadcast
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB: STICKER CENTER */}
          {activeNav === 'stickers' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Smile className="w-4 h-4 text-amber-500" /> Sticker Center
                  </h3>
                  <p className={`text-xs ${themeMutedText}`}>Catalog of imported, custom group, and Lust Mode sticker sets.</p>
                </div>

                <div className={`flex items-center gap-1.5 ${themeInnerCardBg} p-1 rounded-xl border ${themeBorder} text-xs font-semibold`}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'custom', label: 'Custom' },
                    { id: 'lust', label: 'Lust Mode' },
                    { id: 'default', label: 'Default' }
                  ].map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => setStickerTab(t.id)}
                      className={`px-3 py-1 rounded-lg transition-colors ${
                        stickerTab === t.id ? 'bg-blue-600 text-white' : `${themeMutedText}`
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Object.entries(globalStickersData?.global?.stickers || {}).flatMap(([mood, list]: [string, any]) => {
                  if (!Array.isArray(list)) return [];
                  return list.map((st: any) => ({
                    fileId: typeof st === 'string' ? st : st.fileId,
                    mood,
                    source: typeof st === 'object' ? st.source : 'custom'
                  }));
                }).map((item, idx) => (
                  <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex flex-col items-center justify-between text-center space-y-2`}>
                    <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-2xl">
                      🎨
                    </div>
                    <div className="space-y-0.5 w-full">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 block truncate">{item.mood}</span>
                      <span className={`text-[10px] font-mono ${themeMutedText} block truncate`} title={item.fileId}>
                        {item.fileId.slice(0, 10)}...
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: COMMANDS */}
          {activeNav === 'commands' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-blue-500" /> Authoritative Command Registry ({commands.length} Commands)
                </h3>
                <p className={`text-xs ${themeMutedText}`}>Synchronized single source of truth for Telegram bot commands, permissions, syntax, and aliases.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {commands.map((cmd, idx) => (
                  <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-2`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-blue-500/10 text-blue-500 font-mono text-xs font-bold rounded-lg border border-blue-500/20">
                          {cmd.command}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-stone-500/10 text-stone-400">
                          {cmd.category}
                        </span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                        cmd.permission === 'Owner' ? 'bg-red-500/20 text-red-500' :
                        cmd.permission === 'Admin' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'
                      }`}>
                        {cmd.permission}
                      </span>
                    </div>
                    <p className="text-xs">{cmd.description}</p>
                    {cmd.aliases && cmd.aliases.length > 0 && (
                      <div className="text-[11px] text-blue-400">
                        <strong>Aliases:</strong> {cmd.aliases.join(', ')}
                      </div>
                    )}
                    <div className={`${themeCardBg} rounded-lg p-2.5 text-[11px] font-mono space-y-0.5 ${themeMutedText}`}>
                      <div><strong>Syntax:</strong> {cmd.syntax}</div>
                      <div><strong>Example:</strong> {cmd.example}</div>
                      {cmd.scopes && (
                        <div><strong>Scopes:</strong> {cmd.scopes.join(', ')}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: ACTIVITY / AUDIT LOG */}
          {activeNav === 'audit' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-500" /> Moderation & System Audit Log
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className={`${themeInnerCardBg} ${themeMutedText} border-b ${themeBorder}`}>
                    <tr>
                      <th className="p-3">Time</th>
                      <th className="p-3">Group</th>
                      <th className="p-3">Actor</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Target</th>
                      <th className="p-3">Details / Reason</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-stone-900' : 'divide-slate-200'}`}>
                    {filteredLogs.map((l: ModerationLog, idx: number) => (
                      <tr key={idx} onClick={() => setSelectedEvent(l)} className="hover:opacity-80 cursor-pointer">
                        <td className={`p-3 font-mono ${themeMutedText}`}>{new Date(l.timestamp).toLocaleTimeString()}</td>
                        <td className="p-3">{l.chatTitle || l.chatId}</td>
                        <td className="p-3 font-mono">@{l.adminUsername || l.adminUserId || 'system'}</td>
                        <td className="p-3 font-bold text-blue-500">{l.action}</td>
                        <td className="p-3 font-mono">@{l.targetUsername || l.targetUserId || '-'}</td>
                        <td className={`p-3 truncate max-w-xs ${themeMutedText}`}>{l.reason || l.details || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: HEALTH & DIAGNOSTICS */}
          {activeNav === 'health-diagnostics' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-500" /> Roxie Production Monitoring & Diagnostics
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>Real-time system health, component statuses, runtime metrics, and error diagnostics.</p>
                </div>
                <button
                  onClick={fetchData}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh Diagnostics
                </button>
              </div>

              {/* Status Banner */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                healthData?.status === 'HEALTHY' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' :
                healthData?.status === 'DEGRADED' ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' :
                'bg-red-500/10 border-red-500/30 text-red-500'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${
                    healthData?.status === 'HEALTHY' ? 'bg-emerald-500' :
                    healthData?.status === 'DEGRADED' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <div>
                    <h3 className="text-sm font-bold">System Status: {healthData?.status || 'HEALTHY'}</h3>
                    <p className="text-xs opacity-80">Last checked: {healthData?.timestamp ? new Date(healthData.timestamp).toLocaleTimeString() : 'N/A'}</p>
                  </div>
                </div>
                <div className="text-xs font-mono">
                  Uptime: {Math.floor((healthData?.uptimeSeconds || 0) / 60)}m {(healthData?.uptimeSeconds || 0) % 60}s
                </div>
              </div>

              {/* Component Status Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { name: 'Bot Core', status: healthData?.components?.bot?.configured ? 'Configured' : 'Missing Token', ok: healthData?.components?.bot?.configured },
                  { name: 'Telegram Polling', status: healthData?.components?.telegramPolling?.status || 'HEALTHY', ok: healthData?.components?.telegramPolling?.status !== 'DEGRADED' },
                  { name: 'Scheduler', status: healthData?.components?.scheduler?.status || 'HEALTHY', ok: true },
                  { name: 'AI Chatbot', status: healthData?.components?.ai?.status || 'HEALTHY', ok: true },
                  {
                    name: 'Storage Persistence',
                    status: healthData?.components?.storage?.indicator === 'persistent' ? '🟢 Persistent' :
                            healthData?.components?.storage?.indicator === 'local_ephemeral' ? '🟡 Local / Ephemeral' : '🔴 Persistence Error',
                    ok: healthData?.components?.storage?.indicator !== 'error',
                    extra: (
                      <div className={`text-[11px] ${themeMutedText} space-y-0.5 pt-1.5 border-t border-white/5`}>
                        <div className="truncate"><span className="font-semibold">Data Dir:</span> {healthData?.components?.storage?.dataDirectory || 'data'}</div>
                        <div><span className="font-semibold">Writable:</span> {healthData?.components?.storage?.isWritable ? 'Yes' : 'No'}</div>
                      </div>
                    )
                  }
                ].map((comp: any, idx) => (
                  <div key={idx} className={`${themeCardBg} border rounded-2xl p-4 space-y-2 flex flex-col justify-between`}>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${themeMutedText}`}>{comp.name}</span>
                        <span className={`w-2 h-2 rounded-full ${comp.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      </div>
                      <div className="text-sm font-bold">{comp.status}</div>
                    </div>
                    {comp.extra && comp.extra}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: LIVE CHECKLIST */}
          {activeNav === 'live-checklist' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-blue-500" /> Live Test Checklist (LIVE-01 to LIVE-46)
                  </h3>
                  <p className={`text-xs ${themeMutedText}`}>Record verification status for end-to-end Telegram bot behaviors.</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-lg">
                    Pass: {Object.values(liveTestStatus).filter(v => v === 'PASS').length}
                  </span>
                  <span className="px-2.5 py-1 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg">
                    Fail: {Object.values(liveTestStatus).filter(v => v === 'FAIL').length}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className={`${themeInnerCardBg} ${themeMutedText} border-b ${themeBorder}`}>
                    <tr>
                      <th className="p-3 w-28">Test ID</th>
                      <th className="p-3">Behavior / Feature Description</th>
                      <th className="p-3 w-40 text-right">Verification Status</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-stone-900' : 'divide-slate-200'}`}>
                    {LIVE_TESTS.map((test) => {
                      const status = liveTestStatus[test.id] || 'NOT TESTED';
                      return (
                        <tr key={test.id} className="hover:opacity-80">
                          <td className="p-3 font-mono font-bold text-blue-500">{test.id}</td>
                          <td className="p-3">{test.title}</td>
                          <td className="p-3 text-right">
                            <select
                              value={status}
                              onChange={(e) => updateTestStatus(test.id, e.target.value as any)}
                              className={`px-3 py-1.5 rounded-xl font-medium text-xs border ${
                                status === 'PASS' 
                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' 
                                  : status === 'FAIL' 
                                  ? 'bg-red-500/10 text-red-500 border-red-500/30' 
                                  : `${themeInnerCardBg} ${themeBorder}`
                              }`}
                            >
                              <option value="NOT TESTED">NOT TESTED</option>
                              <option value="PASS">PASS</option>
                              <option value="FAIL">FAIL</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: LIVE TELEGRAM VERIFICATION */}
          {activeNav === 'live-verify' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> Live Telegram Verification
                  </h3>
                  <p className={`text-xs ${themeMutedText}`}>Real-time Telegram API connection and bot identity diagnostics.</p>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium flex items-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} /> Test Connection
                </button>
              </div>

              {testResult && (
                <div className={`p-4 rounded-xl text-xs border ${testResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                  {testResult.success ? `✅ Successfully connected to bot @${testResult.bot?.username} (${testResult.bot?.first_name})` : `❌ Connection failed: ${testResult.error}`}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-1`}>
                  <span className={`text-[11px] ${themeMutedText} font-medium`}>Connection State</span>
                  <div className="text-sm font-bold flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${isPolling ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                    <span>{isPolling ? 'CONNECTED & POLLING' : 'DISCONNECTED'}</span>
                  </div>
                </div>

                <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-1`}>
                  <span className={`text-[11px] ${themeMutedText} font-medium`}>Bot Username</span>
                  <div className="text-sm font-bold font-mono">
                    @{botInfo?.username || 'MissRoxie_Bot'}
                  </div>
                </div>

                <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-1`}>
                  <span className={`text-[11px] ${themeMutedText} font-medium`}>Polling Errors</span>
                  <div className="text-xs font-mono text-emerald-500 truncate">
                    {telegramStatus?.pollingError || 'None'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LOADING FALLBACK FOR GROUP DETAILS */}
          {activeGroupDetailId && !groupDetails && (
            <div className={`${themeCardBg} border rounded-2xl p-12 text-center space-y-4`}>
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
              <div>
                <h3 className="text-sm font-bold">Loading Group Data...</h3>
                <p className={`text-xs ${themeMutedText} mt-1`}>Fetching settings, permissions, and members for Chat ID: {activeGroupDetailId}</p>
              </div>
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => fetchData()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
                <button
                  onClick={() => setActiveGroupDetailId(null)}
                  className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
                >
                  Back to Overview
                </button>
              </div>
            </div>
          )}

          {/* TAB: SETTINGS HUB */}
          {activeNav === 'settings' && !activeGroupDetailId && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Settings className="w-5 h-5 text-blue-500" /> Group & Global Settings Hub
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>Select any Telegram group to configure its individual moderation, AI, welcome, or security settings.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {groups.map((g) => (
                  <div key={g.chatId} className={`${themeCardBg} border rounded-2xl p-5 space-y-3 flex flex-col justify-between`}>
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold truncate">{g.chatTitle}</h3>
                      <p className={`text-[10px] font-mono ${themeMutedText}`}>ID: {g.chatId}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedChatId(g.chatId);
                        setActiveGroupDetailId(g.chatId);
                        setGroupDetailTab('general');
                      }}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Settings2 className="w-3.5 h-3.5" /> Open Group Settings
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: MODERATORS HUB */}
          {activeNav === 'moderators' && !activeGroupDetailId && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-500" /> Group Moderators Hub
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>Inspect group administrators, promote/demote members, and manage custom moderator privileges.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {groups.map((g) => (
                  <div key={g.chatId} className={`${themeCardBg} border rounded-2xl p-5 space-y-3 flex flex-col justify-between`}>
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold truncate">{g.chatTitle}</h3>
                      <p className={`text-[10px] font-mono ${themeMutedText}`}>ID: {g.chatId} • {g.botRole || 'Admin'}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedChatId(g.chatId);
                        setActiveGroupDetailId(g.chatId);
                        setGroupDetailTab('moderators');
                      }}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Shield className="w-3.5 h-3.5" /> Manage Moderators
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: PERMISSIONS HUB */}
          {activeNav === 'permissions' && !activeGroupDetailId && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Lock className="w-5 h-5 text-blue-500" /> Group Content Permissions Hub
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>Configure content locks, custom user roles, and sticker/media exemptions per group.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {groups.map((g) => (
                  <div key={g.chatId} className={`${themeCardBg} border rounded-2xl p-5 space-y-3 flex flex-col justify-between`}>
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold truncate">{g.chatTitle}</h3>
                      <p className={`text-[10px] font-mono ${themeMutedText}`}>ID: {g.chatId}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedChatId(g.chatId);
                        setActiveGroupDetailId(g.chatId);
                        setGroupDetailTab('permissions');
                      }}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5" /> Manage Permissions
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Add Sticker Pack Modal */}
      {showAddPackModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl`}>
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-500" /> Add Telegram Sticker Pack
              </h3>
              <button onClick={() => setShowAddPackModal(false)} className="text-stone-400 hover:opacity-80">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className={`text-xs ${themeMutedText}`}>
              Enter an existing Telegram sticker pack name or link (e.g. <code>https://t.me/addstickers/MyPack</code> or <code>MyPack</code>).
              Roxie will resolve the pack directly from Telegram without re-hosting.
            </p>

            {addPackError && (
              <div className="p-3 rounded-xl text-xs bg-red-500/10 border border-red-500/20 text-red-500">
                {addPackError}
              </div>
            )}

            <form onSubmit={handleAddStickerPack} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold block">Sticker Pack Name or URL</label>
                <input
                  type="text"
                  placeholder="https://t.me/addstickers/... or pack_name"
                  value={newPackInput}
                  onChange={(e) => setNewPackInput(e.target.value)}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddPackModal(false)}
                  className={`px-3 py-1.5 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingPack || !newPackInput.trim()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {addingPack ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {addingPack ? 'Resolving...' : 'Add Pack'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Sticker Pack Modal */}
      {previewPack && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden`}>
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Smile className="w-4 h-4 text-amber-500" /> {previewPack.title || previewPack.name}
                </h3>
                <span className={`text-[11px] font-mono ${themeMutedText}`}>
                  {previewPack.name} • {previewPack.stickerCount || previewPack.stickers?.length || 0} Stickers • {previewPack.enabled !== false ? '🟢 Active' : '🔴 Disabled'}
                </span>
              </div>
              <button onClick={() => setPreviewPack(null)} className="text-stone-400 hover:opacity-80">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                {(previewPack.stickers || []).map((st: any, sIdx: number) => (
                  <div key={sIdx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-2 flex flex-col items-center justify-center text-center space-y-1`}>
                    <span className="text-2xl">{st.emoji || '🎨'}</span>
                    <span className={`text-[9px] font-mono ${themeMutedText} truncate w-full`} title={st.fileId}>
                      {st.fileId ? st.fileId.slice(0, 8) : `ID #${sIdx+1}`}
                    </span>
                  </div>
                ))}
                {(!previewPack.stickers || previewPack.stickers.length === 0) && (
                  <p className={`text-xs ${themeMutedText} col-span-4 text-center py-8`}>Sticker metadata resolved on demand.</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t shrink-0 text-xs">
              <span className={themeMutedText}>Configured for Group {activeGroupDetailId}</span>
              <button
                onClick={() => setPreviewPack(null)}
                className={`px-4 py-1.5 ${themeInnerCardBg} border ${themeBorder} rounded-xl font-semibold`}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Sticker Pack Confirmation Modal */}
      {removePackModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border border-red-500/30 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl`}>
            <div className="flex items-center gap-3 text-red-500">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold">Remove Sticker Pack?</h3>
            </div>

            <p className="text-xs leading-relaxed">
              This will remove <strong>"{removePackModal.title || removePackModal.name}"</strong> from Roxie's allowed sticker collection for this group.
            </p>
            <p className={`text-[11px] ${themeMutedText}`}>
              <em>Note:</em> This only removes the pack from Roxie's local group configuration. It does <strong>not</strong> delete the pack from Telegram.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRemovePackModal(null)}
                className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveStickerPack}
                disabled={removingPack}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors"
              >
                {removingPack ? 'Removing...' : 'Remove Pack'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Group Confirmation Modal */}
      {leaveModalGroup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border border-red-500/30 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl`}>
            <div className="flex items-center gap-3 text-red-500">
              <LogOut className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold">Leave Telegram Group?</h3>
            </div>

            <p className="text-xs leading-relaxed">
              Are you sure you want Roxie to leave <strong>"{leaveModalGroup.chatTitle}"</strong> (Chat ID: {leaveModalGroup.chatId})?
              Roxie will authoritatively verify the group and membership via Telegram before departing. All automated moderation, AI conversation, and protections will cease immediately for this group.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-stone-400 block">
                To confirm, type <strong className="text-red-500">LEAVE</strong> below:
              </label>
              <input
                type="text"
                value={leaveConfirmInput}
                onChange={(e) => setLeaveConfirmInput(e.target.value)}
                placeholder="Type LEAVE to confirm"
                className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-red-500`}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setLeaveModalGroup(null)}
                className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveGroup}
                disabled={leaveConfirmInput !== 'LEAVE' || leavingGroup}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors"
              >
                {leavingGroup ? 'Leaving...' : 'Confirm & Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone Action Modal */}
      {dangerModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border border-red-500/30 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl`}>
            <div className="flex items-center gap-3 text-red-500">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold">
                {dangerModal === 'reset_settings' && 'Reset Group Settings?'}
                {dangerModal === 'clear_memory' && 'Clear Group Memory?'}
                {dangerModal === 'clear_stickers' && 'Remove Custom Stickers?'}
                {dangerModal === 'clear_abuse' && 'Clear All Abuse Words?'}
              </h3>
            </div>

            <p className="text-xs leading-relaxed">
              This action is permanent and cannot be undone.
              {dangerModal === 'reset_settings' && ' All custom policies, auto-response frequencies, and rules will be reset to defaults.'}
              {dangerModal === 'clear_memory' && ' All user context and conversation history stored for this group will be wiped.'}
              {dangerModal === 'clear_stickers' && ' All sticker pack configurations for this group will be erased.'}
              {dangerModal === 'clear_abuse' && ' All custom abuse words configured for this group will be deleted.'}
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-stone-400 block">
                To confirm, type <strong className="text-red-500">CONFIRM</strong> below:
              </label>
              <input
                type="text"
                value={dangerConfirmInput}
                onChange={(e) => setDangerConfirmInput(e.target.value)}
                placeholder="Type CONFIRM to proceed"
                className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-red-500`}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => { setDangerModal(null); setDangerConfirmInput(''); }}
                className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDangerAction}
                disabled={dangerConfirmInput !== 'CONFIRM' || executingDangerAction}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors"
              >
                {executingDangerAction ? 'Executing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Import Diff Preview Modal */}
      {backupDiffPreview && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border ${themeBorder} rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl max-h-[85vh] flex flex-col`}>
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold">🔍 Configuration Changes Preview</h3>
              </div>
              <button
                onClick={() => setBackupDiffPreview(null)}
                className={`p-1 rounded-lg ${themeInnerCardBg} ${themeMutedText} hover:opacity-100`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Group check */}
            {!backupDiffPreview.matchedChatId && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-400 space-y-1">
                <span className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Group ID Mismatch Detected
                </span>
                <p>
                  Backup belongs to Group <strong>{backupDiffPreview.configChatId}</strong> but you are applying it to Group <strong>{backupDiffPreview.currentChatId}</strong>. Override confirmation is active.
                </p>
              </div>
            )}

            <div className="overflow-y-auto space-y-4 pr-1 flex-1 text-xs">
              {/* Modified Section */}
              {backupDiffPreview.modified?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-amber-400 text-xs flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5" /> Modified Parameters ({backupDiffPreview.modified.length})
                  </h4>
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl divide-y divide-stone-800`}>
                    {backupDiffPreview.modified.map((m: any, idx: number) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between font-mono text-[11px]">
                        <span className="font-semibold text-stone-200">{m.field}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-red-400 line-through opacity-80">{String(m.oldValue)}</span>
                          <span className="text-stone-500">→</span>
                          <span className="text-emerald-400 font-bold">{String(m.newValue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Added Section */}
              {backupDiffPreview.added?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-emerald-400 text-xs flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Added Items ({backupDiffPreview.added.length})
                  </h4>
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-2.5 space-y-1 font-mono text-[11px]`}>
                    {backupDiffPreview.added.map((a: any, idx: number) => (
                      <div key={idx} className="text-emerald-400 flex items-center gap-2">
                        <span>+ {a.field}:</span>
                        <span className="text-stone-300">{String(a.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Removed Section */}
              {backupDiffPreview.removed?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-red-400 text-xs flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" /> Removed Items ({backupDiffPreview.removed.length})
                  </h4>
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-2.5 space-y-1 font-mono text-[11px]`}>
                    {backupDiffPreview.removed.map((r: any, idx: number) => (
                      <div key={idx} className="text-red-400 flex items-center gap-2">
                        <span>- {r.field}:</span>
                        <span className="text-stone-400 line-through">{String(r.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unchanged summary */}
              {backupDiffPreview.unchanged?.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className={`text-[11px] ${themeMutedText}`}>
                    • {backupDiffPreview.unchanged.length} parameters unchanged.
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-stone-800">
              <span className={`text-[11px] ${themeMutedText}`}>
                A safety snapshot will be created automatically before applying.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBackupDiffPreview(null)}
                  className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const payload = backupImportJson.trim() || backupEditorJson.trim();
                    handleApplyImport(payload);
                  }}
                  disabled={backupLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> Apply Changes Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Details Drawer */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end">
          <div className={`w-full max-w-md ${themeCardBg} border-l ${themeBorder} p-6 space-y-6 overflow-y-auto`}>
            <div className="flex items-center justify-between border-b pb-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" /> Event Details
              </h3>
              <button onClick={() => setSelectedEvent(null)} className={`p-1 ${themeInnerCardBg} rounded-lg ${themeMutedText}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <span className={`${themeMutedText} block`}>Event ID:</span>
                <span className="font-semibold">{selectedEvent.id}</span>
              </div>
              <div>
                <span className={`${themeMutedText} block`}>Action:</span>
                <span className="text-blue-500 font-bold">{selectedEvent.action}</span>
              </div>
              <div>
                <span className={`${themeMutedText} block`}>Chat ID / Group:</span>
                <span>{selectedEvent.chatTitle || selectedEvent.chatId}</span>
              </div>
              <div>
                <span className={`${themeMutedText} block`}>Actor:</span>
                <span>@{selectedEvent.adminUsername || selectedEvent.adminUserId || 'system'}</span>
              </div>
              <div>
                <span className={`${themeMutedText} block`}>Target:</span>
                <span>@{selectedEvent.targetUsername || selectedEvent.targetUserId || '-'}</span>
              </div>
              <div>
                <span className={`${themeMutedText} block`}>Reason / Details:</span>
                <span>{selectedEvent.reason || selectedEvent.details || 'None'}</span>
              </div>
              <div>
                <span className={`${themeMutedText} block`}>Timestamp:</span>
                <span>{new Date(selectedEvent.timestamp).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Schedule Modal */}
      {showCreateScheduleModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                {editingSchedule ? 'Edit Scheduled Message' : 'Create Scheduled Message'}
              </h3>
              <button
                onClick={() => { setShowCreateScheduleModal(false); setEditingSchedule(null); }}
                className={`p-1.5 rounded-lg ${themeInnerCardBg} border ${themeBorder} text-stone-400 hover:text-white`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveSchedule(); }} className="space-y-4 text-xs">
              {/* Target Group */}
              <div className="space-y-1.5">
                <label className="font-semibold block">Target Group</label>
                <select
                  value={newScheduleForm.chatId}
                  onChange={(e) => setNewScheduleForm({ ...newScheduleForm, chatId: Number(e.target.value) })}
                  disabled={Boolean(editingSchedule)}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-blue-500`}
                >
                  <option value="">Select a group...</option>
                  {groups.map(g => (
                    <option key={g.chatId} value={g.chatId}>
                      {g.chatTitle} (ID: {g.chatId})
                    </option>
                  ))}
                </select>
              </div>

              {/* Schedule Title */}
              <div className="space-y-1.5">
                <label className="font-semibold block">Schedule Name / Label</label>
                <input
                  type="text"
                  placeholder="e.g., Daily Morning Greeting, Hourly Reminder"
                  value={newScheduleForm.name}
                  onChange={(e) => setNewScheduleForm({ ...newScheduleForm, name: e.target.value })}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500`}
                />
              </div>

              {/* Message Content */}
              <div className="space-y-1.5">
                <label className="font-semibold block">Message Content (HTML supported)</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Enter message text to broadcast..."
                  value={newScheduleForm.message}
                  onChange={(e) => setNewScheduleForm({ ...newScheduleForm, message: e.target.value })}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs focus:outline-none focus:border-blue-500 font-sans`}
                />
              </div>

              {/* Schedule Type & Frequency */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold block">Schedule Type</label>
                  <select
                    value={newScheduleForm.scheduleType}
                    onChange={(e: any) => setNewScheduleForm({ ...newScheduleForm, scheduleType: e.target.value })}
                    className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none`}
                  >
                    <option value="interval">Recurring Interval (e.g. 1h, 30m)</option>
                    <option value="one_time">One-Time Execution</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>

                {newScheduleForm.scheduleType === 'interval' ? (
                  <div className="space-y-1.5">
                    <label className="font-semibold block">Interval Format</label>
                    <input
                      type="text"
                      placeholder="e.g. 30m, 1h, 2h, 1d"
                      value={newScheduleForm.intervalStr}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, intervalStr: e.target.value })}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="font-semibold block">Timezone</label>
                    <select
                      value={newScheduleForm.timezone}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, timezone: e.target.value })}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none`}
                    >
                      <option value="UTC">UTC</option>
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Date & Time if One-Time / Daily */}
              {newScheduleForm.scheduleType !== 'interval' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold block">Execution Date</label>
                    <input
                      type="date"
                      value={newScheduleForm.nextRunDate}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, nextRunDate: e.target.value })}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold block">Execution Time</label>
                    <input
                      type="time"
                      value={newScheduleForm.nextRunTime}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, nextRunTime: e.target.value })}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                    />
                  </div>
                </div>
              )}

              {/* Content Type & Media */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold block">Content Type</label>
                  <select
                    value={newScheduleForm.contentType}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, contentType: e.target.value })}
                    className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none`}
                  >
                    <option value="text">Text Only</option>
                    <option value="photo">Photo / Image</option>
                    <option value="sticker">Sticker</option>
                    <option value="animation">GIF / Animation</option>
                    <option value="video">Video</option>
                    <option value="document">Document</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold block">Reply To Message ID (optional)</label>
                  <input
                    type="number"
                    placeholder="e.g. 1234"
                    value={newScheduleForm.replyToMessageId}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, replyToMessageId: e.target.value })}
                    className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                  />
                </div>
              </div>

              {newScheduleForm.contentType !== 'text' && (
                <div className="space-y-1.5">
                  <label className="font-semibold block">Media File ID / URL</label>
                  <input
                    type="text"
                    placeholder="Telegram file_id or public media URL"
                    value={newScheduleForm.mediaFileId}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, mediaFileId: e.target.value })}
                    className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                  />
                </div>
              )}

              {/* Enabled Switch */}
              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={newScheduleForm.enabled}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, enabled: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>Enable Schedule Immediately</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => { setShowCreateScheduleModal(false); setEditingSchedule(null); }}
                  className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={schedulesLoading || !newScheduleForm.chatId || !newScheduleForm.message.trim()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {schedulesLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {editingSchedule ? 'Save Changes' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Automation Rule Modal */}
      {showCreateAutomationModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Add Automation Rule
              </h3>
              <button
                onClick={() => setShowCreateAutomationModal(false)}
                className={`p-1.5 rounded-lg ${themeInnerCardBg} border ${themeBorder} text-stone-400 hover:text-white`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveAutomation(); }} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold block">Trigger Condition</label>
                <select
                  value={newAutomationForm.trigger}
                  onChange={(e) => setNewAutomationForm({ ...newAutomationForm, trigger: e.target.value })}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none`}
                >
                  <option value="spam_detected">Spam Message Detected</option>
                  <option value="link_posted">Unauthorized Link Posted</option>
                  <option value="abuse_word_detected">Abuse Word / Hate Speech</option>
                  <option value="caps_flood">Excessive Capslock Flood</option>
                  <option value="forward_flood">Channel Forward Flood</option>
                  <option value="join_event">New Member Join</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold block">Enforcement Action</label>
                <select
                  value={newAutomationForm.action}
                  onChange={(e) => setNewAutomationForm({ ...newAutomationForm, action: e.target.value })}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none`}
                >
                  <option value="delete_message">Delete Message Immediately</option>
                  <option value="warn_user">Issue Warning to User</option>
                  <option value="mute_user">Temporarily Mute User</option>
                  <option value="kick_user">Kick User from Group</option>
                  <option value="ban_user">Permanently Ban User</option>
                  <option value="send_alert">Send Alert Notice to Chat</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold block">Parameters (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. duration=10m or alert message"
                  value={newAutomationForm.parameters}
                  onChange={(e) => setNewAutomationForm({ ...newAutomationForm, parameters: e.target.value })}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={newAutomationForm.enabled}
                    onChange={(e) => setNewAutomationForm({ ...newAutomationForm, enabled: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-600"
                  />
                  <span>Enable Rule Immediately</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setShowCreateAutomationModal(false)}
                  className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={automationsLoading}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {automationsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md ${themeCardBg} border ${themeBorder} rounded-2xl p-6 shadow-2xl space-y-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Admin Operator Login</h3>
                  <p className={`text-[11px] ${themeMutedText}`}>Authenticate to access protected administrative controls</p>
                </div>
              </div>
              <button
                onClick={() => setShowLoginModal(false)}
                className={`p-1.5 rounded-lg hover:bg-white/10 ${themeMutedText} transition-colors`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="space-y-3.5">
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider ${themeMutedText} mb-1`}>
                  Username
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="admin"
                  required
                  autoFocus
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 transition-colors`}
                />
              </div>

              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider ${themeMutedText} mb-1`}>
                  Password
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 transition-colors`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold ${themeInnerCardBg} border ${themeBorder} hover:opacity-80 transition-opacity`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loggingIn}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {loggingIn ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Log In</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
