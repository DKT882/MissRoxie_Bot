import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield,
  Users,
  Bot,
  Flame,
  Lock,
  Radio,
  Clock,
  Ban,
  ListChecks,
  Database,
  Save,
  Download,
  Upload,
  Trash2,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Send,
  Zap,
  Sparkles,
  Sliders,
  ChevronRight,
  ExternalLink,
  Layers,
  FileText,
  Smile,
  Eye,
  Settings,
  HelpCircle,
  X,
  Check,
  Search,
  Bookmark,
  Copy,
  Edit2,
  Code
} from 'lucide-react';

export type MiniAppFeature =
  | 'overview'
  | 'welcome_goodbye'
  | 'rich_post'
  | 'mention_all'
  | 'general'
  | 'moderation'
  | 'content_protection'
  | 'ai_conversation'
  | 'lust_mode'
  | 'stickers'
  | 'auto_engine'
  | 'slowmode'
  | 'abuse_words'
  | 'members'
  | 'moderators'
  | 'permissions'
  | 'commands'
  | 'schedules'
  | 'activity'
  | 'backup';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface RichMessageConfig {
  enabled: boolean;
  mode?: 'simple' | 'rich';
  contentType?: 'text' | 'photo' | 'video' | 'document' | 'voice' | 'audio' | 'animation' | 'sticker';
  text?: string;
  mediaFileId?: string;
  buttons?: Array<Array<{ text: string; url: string }>>;
  pinAfterSend?: boolean;
}

export const TelegramMiniApp: React.FC = () => {
  // Telegram & Auth State
  const [initData, setInitData] = useState<string>('');
  const [chatId, setChatId] = useState<number | null>(null);
  const [chatTitle, setChatTitle] = useState<string>('Telegram Group');
  const [token, setToken] = useState<string>('');
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [role, setRole] = useState<'GROUP_OWNER' | 'EXCEPTION_ADMIN' | 'GROUP_ADMIN' | 'UNAUTHORIZED'>('UNAUTHORIZED');
  const [allowedFeatures, setAllowedFeatures] = useState<MiniAppFeature[]>([]);
  const [activeTab, setActiveTab] = useState<MiniAppFeature>('general');
  const [navCategory, setNavCategory] = useState<'owner' | 'moderation'>('moderation');

  // Loading & Notice State
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadingSlow, setLoadingSlow] = useState<boolean>(false);
  const [initAttempts, setInitAttempts] = useState<number>(0);
  const [debugInfo, setDebugInfo] = useState<{
    tgAvailable: boolean;
    initDataPresent: boolean;
    resolvedChatId: number | null;
  }>({
    tgAvailable: false,
    initDataPresent: false,
    resolvedChatId: null
  });
  const [tabLoading, setTabLoading] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Feature Data States
  const [overviewData, setOverviewData] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [moderatorsList, setModeratorsList] = useState<any[]>([]);
  const [membersList, setMembersList] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [abuseWords, setAbuseWords] = useState<string[]>([]);
  const [newAbuseWord, setNewAbuseWord] = useState<string>('');
  const [stickersData, setStickersData] = useState<any>(null);
  const [schedulesData, setSchedulesData] = useState<any[]>([]);
  const [automationsData, setAutomationsData] = useState<any[]>([]);
  const [rulesText, setRulesText] = useState<string>('');
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [activitySearch, setActivitySearch] = useState<string>('');
  const [safetyBackups, setSafetyBackups] = useState<any[]>([]);
  const [mentionAllStatus, setMentionAllStatus] = useState<any>(null);
  const [mentionReason, setMentionReason] = useState<string>('');
  const [mentionTemplate, setMentionTemplate] = useState<string>('');
  const [commandsList, setCommandsList] = useState<any[]>([]);
  const [commandSearch, setCommandSearch] = useState<string>('');
  const [permissionsData, setPermissionsData] = useState<any>(null);
  const [groupWarnings, setGroupWarnings] = useState<any[]>([]);
  const [lustUsers, setLustUsers] = useState<any[]>([]);

  // Welcome & Goodbye State
  const [welcomeSubTab, setWelcomeSubTab] = useState<'welcome' | 'goodbye' | 'dm'>('welcome');
  const [welcomeData, setWelcomeData] = useState<{
    groupWelcome: RichMessageConfig;
    groupGoodbye: RichMessageConfig;
    welcomeDm: RichMessageConfig;
    autoDeleteJoinLeave: boolean;
  }>({
    groupWelcome: { enabled: false, text: '👋 Welcome {user} to {groupname}!', contentType: 'text', buttons: [] },
    groupGoodbye: { enabled: false, text: '👋 Goodbye {user}!', contentType: 'text', buttons: [] },
    welcomeDm: { enabled: false, text: 'You joined {groupname} 🎉', contentType: 'text', buttons: [] },
    autoDeleteJoinLeave: false
  });
  const [testDmUserId, setTestDmUserId] = useState<string>('');
  const [welcomeSaving, setWelcomeSaving] = useState<boolean>(false);
  const [welcomeTesting, setWelcomeTesting] = useState<boolean>(false);

  // Rich Post State
  const [postContentType, setPostContentType] = useState<'text' | 'photo' | 'video' | 'document' | 'sticker'>('text');
  const [postContent, setPostContent] = useState<string>('');
  const [postMediaId, setPostMediaId] = useState<string>('');
  const [postPin, setPostPin] = useState<boolean>(false);
  const [postProtect, setPostProtect] = useState<boolean>(false);
  const [postButtons, setPostButtons] = useState<Array<{ text: string; url: string }>>([]);
  const [newBtnText, setNewBtnText] = useState<string>('');
  const [newBtnUrl, setNewBtnUrl] = useState<string>('');
  const [postSending, setPostSending] = useState<boolean>(false);

  // Copy Schedule Code Modal
  const [copyScheduleModal, setCopyScheduleModal] = useState<{
    isOpen: boolean;
    schedule: any;
    command: string;
    jsonConfig: any;
    copiedField: 'command' | 'json' | null;
  } | null>(null);

  // Schedule saving loading state
  const [scheduleSaving, setScheduleSaving] = useState<boolean>(false);

  // New Schedule Form Modal
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [showCopyScheduleFromIdModal, setShowCopyScheduleFromIdModal] = useState<boolean>(false);
  const [copyScheduleFromIdInput, setCopyScheduleFromIdInput] = useState<string>('');
  const [copyScheduleFromIdError, setCopyScheduleFromIdError] = useState<string | null>(null);

  const [showLoadPostFromIdModal, setShowLoadPostFromIdModal] = useState<boolean>(false);
  const [loadPostFromIdInput, setLoadPostFromIdInput] = useState<string>('');
  const [loadPostFromIdError, setLoadPostFromIdError] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<{
    name: string;
    message: string;
    scheduleType: 'interval' | 'daily' | 'weekly' | 'one_time';
    intervalStr: string;
    nextRunDate: string;
    nextRunTime: string;
    pinAfterSend: boolean;
    replyToLatest: boolean;
  }>({
    name: '',
    message: '',
    scheduleType: 'interval',
    intervalStr: '1h',
    nextRunDate: new Date().toISOString().split('T')[0],
    nextRunTime: '12:00',
    pinAfterSend: false,
    replyToLatest: false
  });

  // New Automation Rule Modal
  const [showAutomationModal, setShowAutomationModal] = useState<boolean>(false);
  const [autoRuleForm, setAutoRuleForm] = useState<{
    trigger: string;
    action: string;
    parameters: string;
  }>({
    trigger: 'spam_detected',
    action: 'delete_message',
    parameters: ''
  });

  // Add Sticker Pack Modal
  const [showStickerModal, setShowStickerModal] = useState<boolean>(false);
  const [stickerPackInput, setStickerPackInput] = useState<string>('');
  const [previewPack, setPreviewPack] = useState<any | null>(null);

  // Role Assignment Modal
  const [showRoleModal, setShowRoleModal] = useState<boolean>(false);
  // Editing state for Schedule & Automation (Feature 2 Parity)
    const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
    const [editingAutomation, setEditingAutomation] = useState<any | null>(null);

    // Sticker Pack Copy state (Feature 3)
    const [showCopyStickersModal, setShowCopyStickersModal] = useState<boolean>(false);
    const [stickerSources, setStickerSources] = useState<any[]>([]);
    const [selectedSourceGroupId, setSelectedSourceGroupId] = useState<string>('');
    const [selectedPacksToCopy, setSelectedPacksToCopy] = useState<string[]>([]);
    const [copyStickerResults, setCopyStickerResults] = useState<any[] | null>(null);
    const [isCopyingStickers, setIsCopyingStickers] = useState<boolean>(false);

    // Post Library state in TMA (Feature 1 & 2)
    const [showPostLibraryModal, setShowPostLibraryModal] = useState<boolean>(false);
    const [savedPostsData, setSavedPostsData] = useState<any[]>([]);
    const [postLibrarySearch, setPostLibrarySearch] = useState<string>('');
    const [postLibraryLoading, setPostLibraryLoading] = useState<boolean>(false);
    const [showSavePostModal, setShowSavePostModal] = useState<boolean>(false);
    const [newPostTitle, setNewPostTitle] = useState<string>('');
    const [isSavingPostToLib, setIsSavingPostToLib] = useState<boolean>(false);

    const [roleModalTarget, setRoleModalTarget] = useState<any | null>(null);
  const [selectedRoleToAssign, setSelectedRoleToAssign] = useState<string>('MODERATOR');

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    action: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    action: () => {}
  });

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotice({ message, type });
    setTimeout(() => {
      setNotice(null);
    }, 4500);
  };

  // Helper fetcher with TMA session header
  const tmaFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as any || {})
    };

    if (token) {
      headers['x-tma-session'] = token;
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (initData) {
      headers['x-telegram-init-data'] = initData;
    }
    if (chatId) {
      headers['x-telegram-chat-id'] = String(chatId);
    }

    const response = await fetch(endpoint, {
      ...options,
      headers
    });

    return response;
  }, [token, initData, chatId]);

  // 1. Initial Authentication & Group Identification
  useEffect(() => {
    let isCancelled = false;
    const controller = new AbortController();
    const slowTimer = setTimeout(() => {
      if (!isCancelled) setLoadingSlow(true);
    }, 6000);
    const timeoutTimer = setTimeout(() => {
      controller.abort();
    }, 15000);

    const initApp = async () => {
      setAuthLoading(true);
      setAuthError(null);
      setLoadingSlow(false);

      try {
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
          tg.ready?.();
          tg.expand?.();
        }

        // Extract launch data
        let rawInitData = tg?.initData || '';
        const urlParams = new URLSearchParams(window.location.search || '');
        const hashParams = new URLSearchParams((window.location.hash || '').replace('#', ''));

        if (!rawInitData) {
          rawInitData = hashParams.get('tgWebAppData') || urlParams.get('tgWebAppData') || '';
        }

        // Determine target Group ID
        let targetChatId: number | null = null;
        const paramChatId =
          urlParams.get('chat_id') ||
          urlParams.get('chatId') ||
          urlParams.get('startapp') ||
          hashParams.get('chat_id') ||
          hashParams.get('chatId') ||
          hashParams.get('startapp') ||
          hashParams.get('tgWebAppStartParam') ||
          tg?.initDataUnsafe?.start_param;

        if (paramChatId) {
          const parsed = Number(paramChatId);
          if (!isNaN(parsed) && parsed < 0) {
            targetChatId = parsed;
          }
        }

        // Fallback in test/development mode if no chatId provided in query
        const isTestEnv = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') || (import.meta as any).env?.MODE === 'test';
        if (!targetChatId && (isTestEnv || urlParams.get('demo') === 'true')) {
          targetChatId = -1001234567890;
        }

        setDebugInfo({
          tgAvailable: Boolean(tg || (window as any).TelegramWebviewProxy),
          initDataPresent: Boolean(rawInitData),
          resolvedChatId: targetChatId
        });

        if (!targetChatId) {
          setAuthError('No group context specified. Please launch Roxie Mini App directly from your Telegram group via the /dashboard command.');
          setAuthLoading(false);
          return;
        }

        setChatId(targetChatId);
        setInitData(rawInitData);

        // In test mode or when testing without Telegram client, generate test token
        let launchInitData = rawInitData;
        if (!launchInitData && (urlParams.get('test_user') || isTestEnv)) {
          const testUid = urlParams.get('test_user') || '1001';
          launchInitData = `test_tma_token:${testUid}:AdminUser`;
        }

        if (!launchInitData) {
          setAuthError('Missing Telegram authentication data. Please open this app inside Telegram.');
          setAuthLoading(false);
          return;
        }

        // Call backend validation endpoint with timeout
        const res = await fetch('/api/tma/auth/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initData: launchInitData,
            chatId: targetChatId
          }),
          signal: controller.signal
        });

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        if (isCancelled) return;

        if (!res.ok || !data?.ok) {
          const defaultMsg = res.status >= 500
            ? `Server error (${res.status}). The service may be waking up from sleep. Please tap Retry Connection.`
            : 'You do not have administrative access to manage this group.';
          setAuthError(data?.error || defaultMsg);
          setAuthLoading(false);
          return;
        }

        setToken(data.token);
        setUser(data.user);
        setRole(data.role);
        setChatTitle(data.chatTitle || `Group ${Math.abs(targetChatId)}`);
        setAllowedFeatures(data.allowedFeatures || []);

        // Pick initial active tab & category
        if (data.role === 'GROUP_OWNER' || data.role === 'EXCEPTION_ADMIN') {
          setNavCategory('owner');
          setActiveTab('overview');
        } else {
          setNavCategory('moderation');
          setActiveTab('general');
        }
      } catch (err: any) {
        if (isCancelled) return;
        if (err?.name === 'AbortError') {
          setAuthError('Connection timed out. The backend server may be waking up from sleep. Please tap Retry Connection.');
        } else if (err?.message?.includes('Failed to fetch') || err?.message?.includes('NetworkError')) {
          setAuthError('Network error connecting to Roxie backend server. Please verify your connection and tap Retry.');
        } else {
          setAuthError(`Initialization error: ${err?.message || err}`);
        }
      } finally {
        clearTimeout(slowTimer);
        clearTimeout(timeoutTimer);
        if (!isCancelled) {
          setAuthLoading(false);
        }
      }
    };

    initApp();

    return () => {
      isCancelled = true;
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
      controller.abort();
    };
  }, [initAttempts]);

  // 2. Tab Data Loader
  const loadTabData = useCallback(async (tab: MiniAppFeature) => {
    if (!chatId || !token) return;
    setTabLoading(true);

    try {
      if (tab === 'overview' && allowedFeatures.includes('overview')) {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/overview`);
        if (res.ok) {
          const d = await res.json();
          setOverviewData(d.overview);
        }
      } else if (['general', 'moderation', 'content_protection', 'ai_conversation', 'auto_engine', 'slowmode'].includes(tab)) {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/settings`);
        if (res.ok) {
          const d = await res.json();
          setSettings(d);
        }
        if (tab === 'moderation') {
          const wRes = await tmaFetch(`/api/tma/groups/${chatId}/warnings`);
          if (wRes.ok) {
            const wData = await wRes.json();
            setGroupWarnings(wData.warnings || []);
          }
        }
      } else if (tab === 'welcome_goodbye' && allowedFeatures.includes('welcome_goodbye')) {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/welcome-goodbye`);
        if (res.ok) {
          const d = await res.json();
          setWelcomeData({
            groupWelcome: d.groupWelcome || { enabled: false, text: '👋 Welcome {user} to {groupname}!', contentType: 'text', buttons: [] },
            groupGoodbye: d.groupGoodbye || { enabled: false, text: '👋 Goodbye {user}!', contentType: 'text', buttons: [] },
            welcomeDm: d.welcomeDm || { enabled: false, text: 'You joined {groupname} 🎉', contentType: 'text', buttons: [] },
            autoDeleteJoinLeave: Boolean(d.autoDeleteJoinLeave)
          });
        }
      } else if (tab === 'moderators') {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/moderators`);
        if (res.ok) {
          const d = await res.json();
          setModeratorsList(d.administrators || []);
        }
      } else if (tab === 'members' && allowedFeatures.includes('members')) {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/members`);
        if (res.ok) {
          const d = await res.json();
          setMembersList(d.members || []);
        }
      } else if (tab === 'abuse_words' && allowedFeatures.includes('abuse_words')) {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/abuse-words`);
        if (res.ok) {
          const d = await res.json();
          setAbuseWords(d.words || []);
        }
      } else if (tab === 'stickers') {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/stickers`);
        if (res.ok) {
          const d = await res.json();
          setStickersData(d);
        }
      } else if (tab === 'schedules' && allowedFeatures.includes('schedules')) {
        const [sRes, aRes] = await Promise.all([
          tmaFetch(`/api/tma/groups/${chatId}/schedules`),
          tmaFetch(`/api/tma/groups/${chatId}/automations`)
        ]);
        if (sRes.ok) {
          const d = await sRes.json();
          setSchedulesData(d.schedules || []);
          setRulesText(d.rules || '');
        }
        if (aRes.ok) {
          const ad = await aRes.json();
          setAutomationsData(ad.automations || []);
        }
      } else if (tab === 'activity' && allowedFeatures.includes('activity')) {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/activity`);
        if (res.ok) {
          const d = await res.json();
          setActivityLogs(d.logs || []);
        }
      } else if (tab === 'backup' && allowedFeatures.includes('backup')) {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/backup/history`);
        if (res.ok) {
          const d = await res.json();
          setSafetyBackups(d.history || []);
        }
      } else if (tab === 'mention_all') {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/mention-all/status`);
        if (res.ok) {
          const d = await res.json();
          setMentionAllStatus(d.status);
        }
      } else if (tab === 'lust_mode') {
        const [lRes, uRes] = await Promise.all([
          tmaFetch(`/api/tma/groups/${chatId}/lust/settings`),
          tmaFetch(`/api/tma/groups/${chatId}/lust/users`)
        ]);
        if (lRes.ok) {
          const d = await lRes.json();
          setSettings((prev: any) => ({ ...(prev || {}), lustMode: d.lustMode, lustLevel: d.lustLevel }));
        }
        if (uRes.ok) {
          const ud = await uRes.json();
          setLustUsers(ud.users || []);
        }
      } else if (tab === 'permissions' && allowedFeatures.includes('permissions')) {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/permissions`);
        if (res.ok) {
          const d = await res.json();
          setPermissionsData(d);
        }
      } else if (tab === 'commands') {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/commands`);
        if (res.ok) {
          const d = await res.json();
          const allCmds: any[] = [];
          if (d.categories) {
            Object.entries(d.categories).forEach(([category, cmds]: [string, any]) => {
              (cmds as any[]).forEach(c => allCmds.push({ ...c, category }));
            });
          }
          setCommandsList(allCmds);
        }
      }
    } catch (err: any) {
      showNotification(`Failed to load ${tab}: ${err.message}`, 'error');
    } finally {
      setTabLoading(false);
    }
  }, [chatId, token, allowedFeatures, tmaFetch]);

  useEffect(() => {
    if (chatId && token && activeTab) {
      loadTabData(activeTab);
    }
  }, [activeTab, chatId, token, loadTabData]);

  // Polling for mention_all status when active
  useEffect(() => {
    if (activeTab === 'mention_all' && mentionAllStatus?.active) {
      const interval = setInterval(async () => {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/mention-all/status`);
        if (res.ok) {
          const d = await res.json();
          setMentionAllStatus(d.status);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [activeTab, mentionAllStatus?.active, chatId, tmaFetch]);

  // Handlers for settings updates
  const handleUpdateSettings = async (updates: any) => {
    if (!chatId) return;
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/settings`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        showNotification('Settings updated successfully', 'success');
      } else {
        showNotification(data.error || 'Failed to update settings', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setScheduleSaving(false);
    }
  };

  // Welcome & Goodbye Handlers
  const handleSaveWelcome = async (override?: Partial<typeof welcomeData>) => {
    if (!chatId) return;
    setWelcomeSaving(true);
    try {
      const payload = {
        ...welcomeData,
        ...(override || {})
      };
      const res = await tmaFetch(`/api/tma/groups/${chatId}/welcome-goodbye`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setWelcomeData({
          groupWelcome: data.groupWelcome,
          groupGoodbye: data.groupGoodbye,
          welcomeDm: data.welcomeDm,
          autoDeleteJoinLeave: Boolean(data.autoDeleteJoinLeave)
        });
        showNotification('Welcome & Goodbye settings saved', 'success');
      } else {
        showNotification(data.error || 'Failed to save welcome settings', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setWelcomeSaving(false);
    }
  };

  const handleTestWelcome = async (target: 'groupWelcome' | 'groupGoodbye' | 'welcomeDm') => {
    if (!chatId) return;
    if (target === 'welcomeDm' && !testDmUserId.trim()) {
      showNotification('Please enter a target User ID to test private DM', 'error');
      return;
    }
    setWelcomeTesting(true);
    try {
      const cfg = target === 'groupWelcome' ? welcomeData.groupWelcome : target === 'groupGoodbye' ? welcomeData.groupGoodbye : welcomeData.welcomeDm;
      const res = await tmaFetch(`/api/tma/groups/${chatId}/welcome-goodbye/test`, {
        method: 'POST',
        body: JSON.stringify({
          target,
          config: cfg,
          targetUserId: target === 'welcomeDm' ? Number(testDmUserId.trim()) : undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        showNotification('Test message dispatched successfully!', 'success');
      } else {
        showNotification(data.error || 'Failed to send test message', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setWelcomeTesting(false);
    }
  };

  // Handlers for Abuse Words
  const handleAddAbuseWord = async () => {
    if (!newAbuseWord.trim() || !chatId) return;
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/abuse-words`, {
        method: 'POST',
        body: JSON.stringify({ word: newAbuseWord.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setAbuseWords(data.words);
        setNewAbuseWord('');
        showNotification('Word added to blacklist', 'success');
      } else {
        showNotification(data.error || 'Failed to add word', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleRemoveAbuseWord = async (word: string) => {
    if (!chatId) return;
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/abuse-words/${encodeURIComponent(word)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok) {
        setAbuseWords(data.words);
        showNotification(`Removed '${word}'`, 'success');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleClearAllAbuseWords = async () => {
    if (!chatId) return;
    setConfirmModal({
      isOpen: true,
      title: 'Clear All Abuse Words?',
      description: 'This will remove all custom banned words for this group.',
      action: async () => {
        try {
          const res = await tmaFetch(`/api/tma/groups/${chatId}/abuse-words`, { method: 'DELETE' });
          if (res.ok) {
            setAbuseWords([]);
            showNotification('Cleared all abuse words', 'info');
          }
        } catch (err: any) {
          showNotification(err.message, 'error');
        }
      }
    });
  };

  // Handlers for Members
  const handleMemberAction = (action: 'ban' | 'unban' | 'restrict' | 'promote' | 'demote', targetUserId: number, userName: string) => {
    const actionTitles = {
      ban: 'Ban Member',
      unban: 'Unban Member',
      restrict: 'Mute Member',
      promote: 'Promote to Admin',
      demote: 'Demote Admin'
    };
    setConfirmModal({
      isOpen: true,
      title: `${actionTitles[action]} (${userName})?`,
      description: `Execute ${action} for user ${targetUserId} in this group?`,
      action: async () => {
        try {
          const res = await tmaFetch(`/api/tma/groups/${chatId}/members/${targetUserId}/${action}`, { method: 'POST' });
          const data = await res.json();
          if (res.ok && data.ok) {
            showNotification(`${actionTitles[action]} succeeded`, 'success');
            loadTabData('members');
          } else {
            showNotification(data.error || `Failed to ${action} user`, 'error');
          }
        } catch (err: any) {
          showNotification(err.message, 'error');
        }
      }
    });
  };

  // Handlers for Warnings
  const handleClearWarning = async (targetUserId: number) => {
    if (!chatId) return;
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/warnings/${targetUserId}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification(`Cleared warnings for User ${targetUserId}`, 'success');
        setGroupWarnings(prev => prev.filter(w => w.userId !== targetUserId));
      } else {
        showNotification('Failed to clear warnings', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // Handlers for Mention All
  const handleStartMentionAll = async () => {
    if (!chatId) return;
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/mention-all/start`, {
        method: 'POST',
        body: JSON.stringify({
          reason: mentionReason || 'Group announcement',
          template: mentionTemplate || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        showNotification('Mention-all broadcast started', 'success');
        loadTabData('mention_all');
      } else {
        showNotification(data.error || 'Failed to start mention-all', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleStopMentionAll = async () => {
    if (!chatId) return;
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/mention-all/stop`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showNotification('Mention-all broadcast stopped', 'info');
        loadTabData('mention_all');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // Handlers for Rich Post
  const handleAddPostButton = () => {
    if (!newBtnText.trim() || !newBtnUrl.trim()) return;
    setPostButtons([...postButtons, { text: newBtnText.trim(), url: newBtnUrl.trim() }]);
    setNewBtnText('');
    setNewBtnUrl('');
  };

  const handleRemovePostButton = (index: number) => {
    setPostButtons(postButtons.filter((_, i) => i !== index));
  };
  // Schedule & Automation Edit Openers (Feature 2 Parity)
  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {}
    }
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  };

  const handleDuplicateSchedule = (s: any) => {
    setEditingSchedule(null); // Draft mode
    setScheduleForm({
      name: `${s.name || 'Schedule'} (Copy)`,
      message: s.message || s.messageText || '',
      scheduleType: s.scheduleType || (s.cronExpression ? 'daily' : 'interval'),
      intervalStr: s.intervalFormatted || s.intervalStr || '1h',
      nextRunDate: s.nextRun ? s.nextRun.split('T')[0] : new Date().toISOString().split('T')[0],
      nextRunTime: s.nextRun && s.nextRun.includes('T') ? s.nextRun.split('T')[1].slice(0, 5) : '12:00',
      pinAfterSend: Boolean(s.pinAfterSend),
      replyToLatest: Boolean(s.replyToLatest)
    });
    showNotification('Schedule duplicated into draft. Review and click "Create Schedule" to save.', 'success');
    setShowScheduleModal(true);
  };

  const handleOpenNewSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm({
      name: '',
      message: '',
      scheduleType: 'interval',
      intervalStr: '1h',
      nextRunDate: new Date().toISOString().split('T')[0],
      nextRunTime: '12:00',
      pinAfterSend: false,
      replyToLatest: false
    });
    setShowScheduleModal(true);
  };

  const handleCopyScheduleCode = async (s: any) => {
    try {
      let command = '';
      let jsonConfig: any = {};
      const res = await tmaFetch(`/api/tma/groups/${chatId}/schedules/${s.id}/code`);
      if (res.ok) {
        const data = await res.json();
        command = data.command;
        jsonConfig = data.jsonConfig;
      } else {
        const interval = s.intervalFormatted || s.intervalStr || '1h';
        const delTag = s.autoDeletePrevious ? ' delOn' : '';
        const pinTag = s.pinAfterSend ? ' pin' : '';
        const replyTag = s.replyToLatest ? ' replyOn' : '';
        const message = s.message || s.messageText || '';
        command = `/schedule ${interval}${delTag}${pinTag}${replyTag} ${message}`.trim();
        jsonConfig = {
          name: s.name || 'Schedule',
          scheduleType: s.scheduleType || 'interval',
          interval,
          message,
          contentType: s.contentType || 'text',
          pinAfterSend: Boolean(s.pinAfterSend),
          replyToLatest: Boolean(s.replyToLatest),
          autoDeletePrevious: Boolean(s.autoDeletePrevious),
          targetChatId: '<REPLACE_WITH_DESTINATION_CHAT_ID>'
        };
        if (s.mediaFileId) jsonConfig.mediaFileId = s.mediaFileId;
        if (s.timezone) jsonConfig.timezone = s.timezone;
      }
      setCopyScheduleModal({
        isOpen: true,
        schedule: s,
        command,
        jsonConfig,
        copiedField: null
      });
    } catch {
      showNotification('Failed to generate schedule code', 'error');
    }
  };

  const handleOpenEditSchedule = (s: any) => {
    let defaultDate = new Date().toISOString().split('T')[0];
    let defaultTime = '12:00';
    if (s.nextRun) {
      try {
        const d = new Date(s.nextRun);
        if (!isNaN(d.getTime())) {
          defaultDate = d.toISOString().split('T')[0];
          defaultTime = d.toISOString().split('T')[1].slice(0, 5);
        }
      } catch {}
    }

    let safeIntervalStr = '1h';
    if (s.intervalFormatted && s.intervalFormatted !== 'Custom') {
      safeIntervalStr = s.intervalFormatted;
    } else if (s.intervalStr && s.intervalStr !== 'Custom') {
      safeIntervalStr = s.intervalStr;
    } else if (s.intervalMs && typeof s.intervalMs === 'number') {
      safeIntervalStr = s.intervalMs >= 3600000 ? `${Math.round(s.intervalMs / 3600000)}h` : `${Math.round(s.intervalMs / 60000)}m`;
    }

    setEditingSchedule(s);
    setScheduleForm({
      name: s.name || s.id || 'Scheduled Broadcast',
      message: s.message || s.messageText || '',
      scheduleType: s.scheduleType || (s.cronExpression ? 'daily' : 'interval'),
      intervalStr: safeIntervalStr,
      nextRunDate: defaultDate,
      nextRunTime: defaultTime,
      pinAfterSend: Boolean(s.pinAfterSend),
      replyToLatest: Boolean(s.replyToLatest)
    });
    setShowScheduleModal(true);
  };

  const handleOpenEditAutomation = (a: any) => {
    setEditingAutomation(a);
    setAutoRuleForm({
      trigger: a.trigger || 'spam_detected',
      action: a.action || 'delete_message',
      parameters: a.parameters || ''
    });
    setShowAutomationModal(true);
  };

  // Sticker Copy Handlers (Feature 3)
  const handleOpenCopyStickers = async () => {
    if (!chatId) return;
    setCopyStickerResults(null);
    setSelectedPacksToCopy([]);
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/stickers/sources`);
      const data = await res.json();
      if (res.ok && data.sources) {
        setStickerSources(data.sources);
        if (data.sources.length > 0) {
          setSelectedSourceGroupId(String(data.sources[0].chatId));
        }
        setShowCopyStickersModal(true);
      } else {
        showNotification('No other groups with sticker packs found', 'info');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleExecuteCopyStickers = async () => {
    if (!chatId || !selectedSourceGroupId || selectedPacksToCopy.length === 0) {
      showNotification('Please select at least one pack to copy', 'error');
      return;
    }
    setIsCopyingStickers(true);
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/stickers/packs/copy`, {
        method: 'POST',
        body: JSON.stringify({
          sourceChatId: Number(selectedSourceGroupId),
          packNames: selectedPacksToCopy
        })
      });
      const data = await res.json();
      if (res.ok && data.results) {
        setCopyStickerResults(data.results);
        loadTabData('stickers');
        showNotification('Sticker pack copy operation completed', 'success');
      } else {
        showNotification(data.error || 'Failed to copy sticker packs', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setIsCopyingStickers(false);
    }
  };

  // Post Library Handlers in TMA (Feature 1 & 2)
  const handleLoadSavedPosts = async (searchQuery?: string) => {
    if (!chatId) return;
    setPostLibraryLoading(true);
    try {
      const q = searchQuery !== undefined ? searchQuery : postLibrarySearch;
      const res = await tmaFetch(`/api/tma/groups/${chatId}/posts/library${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      const data = await res.json();
      if (res.ok && data.posts) {
        setSavedPostsData(data.posts);
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setPostLibraryLoading(false);
    }
  };

  const handleOpenPostLibrary = () => {
    setShowPostLibraryModal(true);
    handleLoadSavedPosts('');
  };

  const handleSavePostToLibrary = async () => {
    if (!chatId || !newPostTitle.trim()) {
      showNotification('Please provide a title for the saved post', 'error');
      return;
    }
    setIsSavingPostToLib(true);
    try {
      const buttonRows = postButtons.length > 0 ? [postButtons] : [];
      const res = await tmaFetch(`/api/tma/groups/${chatId}/posts/library`, {
        method: 'POST',
        body: JSON.stringify({
          title: newPostTitle.trim(),
          contentType: postContentType,
          text: postContent,
          mediaFileId: postMediaId.trim() || undefined,
          buttons: buttonRows,
          protectContent: postProtect,
          pinAfterSend: postPin
        })
      });
      const data = await res.json();
      if (res.ok && data.post) {
        showNotification(`Saved to library as ${data.post.id}`, 'success');
        setShowSavePostModal(false);
        setNewPostTitle('');
      } else {
        showNotification(data.error || 'Failed to save post', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setIsSavingPostToLib(false);
    }
  };

  const handleInsertPostReference = (postId: string) => {
    setPostContent(prev => (prev ? `${prev} {{post:${postId}}}` : `{{post:${postId}}}`));
    setShowPostLibraryModal(false);
    showNotification(`Inserted {{post:${postId}}} into composer`, 'success');
  };

  const handleLoadPostIntoComposer = (p: any) => {
    if (p.contentType) setPostContentType(p.contentType);
    if (p.text) setPostContent(p.text);
    if (p.mediaFileId) setPostMediaId(p.mediaFileId);
    if (Array.isArray(p.buttons)) {
      setPostButtons(p.buttons.flat());
    }
    setShowPostLibraryModal(false);
    showNotification(`Loaded "${p.title}" into composer`, 'success');
  };

  const handleDeleteSavedPost = (postId: string) => {
    setConfirmModal({
      isOpen: true,
      title: `Delete Saved Post ${postId}?`,
      description: 'Are you sure you want to delete this reusable post from the library?',
      action: async () => {
        try {
          const res = await tmaFetch(`/api/tma/groups/${chatId}/posts/library/${postId}`, { method: 'DELETE' });
          if (res.ok) {
            showNotification(`Post ${postId} deleted`, 'info');
            handleLoadSavedPosts();
          }
        } catch (err: any) {
          showNotification(err.message, 'error');
        }
      }
    });
  };

  const handleSendRichPost = async () => {
    if (!chatId || !postContent.trim()) {
      showNotification('Please enter message text to send', 'error');
      return;
    }
    setPostSending(true);
    try {
      const buttonRows = postButtons.length > 0 ? [postButtons] : [];
      const res = await tmaFetch(`/api/tma/groups/${chatId}/rich-post/send`, {
        method: 'POST',
        body: JSON.stringify({
          post: {
            contentType: postContentType,
            text: postContent,
            mediaFileId: postMediaId.trim() || undefined,
            buttons: buttonRows,
            pinAfterSend: postPin,
            protectContent: postProtect
          },
          pinMessage: postPin
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('Rich post sent to group!', 'success');
        setPostContent('');
        setPostMediaId('');
        setPostButtons([]);
      } else {
        showNotification(data.error || 'Failed to send post', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setPostSending(false);
    }
  };

  // Handlers for Stickers
  const handleToggleStickerPack = async (packName: string, enabled: boolean) => {
    if (!chatId) return;
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/stickers/packs/${encodeURIComponent(packName)}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled })
      });
      if (res.ok) {
        showNotification(`Sticker pack ${enabled ? 'enabled' : 'disabled'}`, 'success');
        loadTabData('stickers');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleAddStickerPack = async () => {
    if (!chatId || !stickerPackInput.trim()) return;
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/stickers/packs`, {
        method: 'POST',
        body: JSON.stringify({ packNameOrUrl: stickerPackInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        showNotification(`Sticker pack added`, 'success');
        setStickerPackInput('');
        setShowStickerModal(false);
        loadTabData('stickers');
      } else {
        showNotification(data.error || 'Failed to add sticker pack', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleRemoveStickerPack = (packName: string) => {
    setConfirmModal({
      isOpen: true,
      title: `Remove Pack "${packName}"?`,
      description: 'Remove this sticker pack from this group configuration?',
      action: async () => {
        try {
          const res = await tmaFetch(`/api/tma/groups/${chatId}/stickers/packs/${encodeURIComponent(packName)}`, {
            method: 'DELETE'
          });
          if (res.ok) {
            showNotification('Sticker pack removed', 'info');
            loadTabData('stickers');
          }
        } catch (err: any) {
          showNotification(err.message, 'error');
        }
      }
    });
  };

  // Handlers for Schedules
  const handleCreateSchedule = async () => {
    if (scheduleSaving) return;
    const trimmedMessage = scheduleForm.message.trim();
    if (!chatId || !trimmedMessage) {
      showNotification('Schedule message is required', 'error');
      return;
    }
    const finalName = scheduleForm.name.trim() || (editingSchedule ? (editingSchedule.name || editingSchedule.id) : trimmedMessage.slice(0, 30));

    setScheduleSaving(true);
    try {
      const isEdit = Boolean(editingSchedule && editingSchedule.id);
      const url = isEdit
        ? `/api/tma/groups/${chatId}/schedules/${editingSchedule.id}`
        : `/api/tma/groups/${chatId}/schedules`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await tmaFetch(url, {
        method,
        body: JSON.stringify({
          ...scheduleForm,
          name: finalName
        })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        showNotification(isEdit ? 'Scheduled message updated' : 'Scheduled message created', 'success');
        setShowScheduleModal(false);
        setEditingSchedule(null);
        setScheduleForm({
          name: '',
          message: '',
          scheduleType: 'interval',
          intervalStr: '1h',
          nextRunDate: new Date().toISOString().split('T')[0],
          nextRunTime: '12:00',
          pinAfterSend: false,
          replyToLatest: false
        });
        loadTabData('schedules');
      } else {
        showNotification(data.error || (isEdit ? 'Failed to update schedule' : 'Failed to create schedule'), 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleCopyScheduleFromIdSubmit = async () => {
    const trimmedId = copyScheduleFromIdInput.trim().toUpperCase();
    if (!trimmedId) {
      setCopyScheduleFromIdError('Please enter a content or schedule ID.');
      return;
    }
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/content-items/${encodeURIComponent(trimmedId)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCopyScheduleFromIdError(data.error || `Item with ID "${trimmedId}" not found or not accessible.`);
        return;
      }
      const data = await res.json();
      const found = data.item;
      if (!found) {
        setCopyScheduleFromIdError(`Item with ID "${trimmedId}" not found.`);
        return;
      }

      let defaultDate = new Date().toISOString().split('T')[0];
      let defaultTime = '12:00';

      let safeIntervalStr = '1h';
      if (found.scheduleConfig?.intervalStr && found.scheduleConfig.intervalStr !== 'Custom') {
        safeIntervalStr = found.scheduleConfig.intervalStr;
      } else if (found.scheduleConfig?.intervalMs && typeof found.scheduleConfig.intervalMs === 'number') {
        safeIntervalStr = found.scheduleConfig.intervalMs >= 3600000 ? `${Math.round(found.scheduleConfig.intervalMs / 3600000)}h` : `${Math.round(found.scheduleConfig.intervalMs / 60000)}m`;
      }

      const baseName = found.title || found.id || 'Scheduled Broadcast';
      const copyName = baseName.includes('(Copy)') ? baseName : `${baseName} (Copy)`;

      setEditingSchedule(null);
      setScheduleForm({
        name: copyName,
        message: found.text || '',
        scheduleType: found.scheduleConfig?.scheduleType || 'interval',
        intervalStr: safeIntervalStr,
        nextRunDate: defaultDate,
        nextRunTime: defaultTime,
        pinAfterSend: Boolean(found.options?.pinAfterSend),
        replyToLatest: Boolean(found.options?.replyToLatest)
      });

      setShowCopyScheduleFromIdModal(false);
      setCopyScheduleFromIdInput('');
      setCopyScheduleFromIdError(null);
      setShowScheduleModal(true);
      showNotification(`Loaded ${found.type.toUpperCase()}: ${found.title} into draft. Review and save.`, 'info');
    } catch (err: any) {
      setCopyScheduleFromIdError(err.message || 'Failed to load item');
    }
  };

  const handleCopyAllStickerPackLinks = async () => {
    const packs = stickersData?.packs || [];
    if (!packs.length) {
      showNotification('No sticker packs configured for this group', 'info');
      return;
    }
    const links = packs
      .map((p: any) => {
        const name = p.name || p.title;
        if (!name) return null;
        return name.startsWith('http') ? name : `https://t.me/addstickers/${name}`;
      })
      .filter(Boolean);

    if (!links.length) {
      showNotification('No sticker packs configured for this group', 'info');
      return;
    }

    const ok = await copyTextToClipboard(links.join('\n'));
    if (ok) {
      showNotification(`Copied ${links.length} sticker pack link(s) to clipboard`, 'success');
    } else {
      showNotification('Failed to copy sticker pack links to clipboard', 'error');
    }
  };

  const handleLoadPostFromIdSubmit = async () => {
    const trimmedId = loadPostFromIdInput.trim().toUpperCase();
    if (!trimmedId) {
      setLoadPostFromIdError('Please enter a content ID (e.g. POST-XXXXX, schedule ID, or template ID).');
      return;
    }

    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/content-items/${encodeURIComponent(trimmedId)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setLoadPostFromIdError(d.error || `Content item "${trimmedId}" not found or not accessible.`);
        return;
      }
      const data = await res.json();
      const item = data.item;
      if (!item) {
        setLoadPostFromIdError(`Content item "${trimmedId}" not found.`);
        return;
      }

      if (item.contentType) setPostContentType(item.contentType);
      if (item.text) setPostContent(item.text);
      if (item.mediaFileId) setPostMediaId(item.mediaFileId);
      if (Array.isArray(item.buttons)) {
        setPostButtons(item.buttons.flat());
      }
      if (item.options?.protectContent !== undefined) setPostProtect(Boolean(item.options.protectContent));
      if (item.options?.pinAfterSend !== undefined) setPostPin(Boolean(item.options.pinAfterSend));

      setShowLoadPostFromIdModal(false);
      setLoadPostFromIdInput('');
      setLoadPostFromIdError(null);
      showNotification(`Loaded ${item.type.toUpperCase()}: ${item.title} into composer as draft`, 'success');
    } catch (err: any) {
      setLoadPostFromIdError(err.message || 'Failed to load content item');
    }
  };

  const handleToggleSchedule = async (id: string, currentEnabled: boolean) => {
    if (!chatId) return;
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/schedules/${id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      if (res.ok) {
        showNotification(`Schedule ${!currentEnabled ? 'activated' : 'paused'}`, 'success');
        loadTabData('schedules');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleDeleteSchedule = (id: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: `Delete Schedule "${name}"?`,
      description: 'Are you sure you want to delete this scheduled message?',
      action: async () => {
        try {
          const res = await tmaFetch(`/api/tma/groups/${chatId}/schedules/${id}`, { method: 'DELETE' });
          if (res.ok) {
            showNotification('Schedule deleted', 'info');
            loadTabData('schedules');
          }
        } catch (err: any) {
          showNotification(err.message, 'error');
        }
      }
    });
  };

  const handleSaveRules = async () => {
    if (!chatId) return;
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/rules`, {
        method: 'PUT',
        body: JSON.stringify({ rules: rulesText })
      });
      if (res.ok) {
        showNotification('Group rules updated successfully', 'success');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // Handlers for Automations
  const handleCreateAutomation = async () => {
    if (!chatId) return;
    try {
      const isEdit = Boolean(editingAutomation && editingAutomation.id);
      const url = isEdit
        ? `/api/tma/groups/${chatId}/automations/${editingAutomation.id}`
        : `/api/tma/groups/${chatId}/automations`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await tmaFetch(url, {
        method,
        body: JSON.stringify(autoRuleForm)
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        showNotification(isEdit ? 'Automation rule updated' : 'Automation rule added', 'success');
        setShowAutomationModal(false);
        setEditingAutomation(null);
        setAutoRuleForm({ trigger: 'spam_detected', action: 'delete_message', parameters: '' });
        loadTabData('schedules');
      } else {
        showNotification(data.error || (isEdit ? 'Failed to update automation' : 'Failed to create automation'), 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleToggleAutomation = async (id: string, currentEnabled: boolean) => {
    if (!chatId) return;
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/automations/${id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      if (res.ok) {
        showNotification(`Rule ${!currentEnabled ? 'enabled' : 'disabled'}`, 'success');
        loadTabData('schedules');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const handleDeleteAutomation = (id: string) => {
    if (!chatId) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete Rule?',
      description: 'Remove this automation rule?',
      action: async () => {
        try {
          const res = await tmaFetch(`/api/tma/groups/${chatId}/automations/${id}`, { method: 'DELETE' });
          if (res.ok) {
            showNotification('Rule deleted', 'info');
            loadTabData('schedules');
          }
        } catch (err: any) {
          showNotification(err.message, 'error');
        }
      }
    });
  };

  // Handlers for Permissions
  const handleTogglePermission = (pKey: string) => {
    if (!permissionsData) return;
    const current = permissionsData.defaultMemberPermissions || {};
    setPermissionsData({
      ...permissionsData,
      defaultMemberPermissions: {
        ...current,
        [pKey]: !current[pKey]
      }
    });
  };

  const handleSavePermissions = async () => {
    if (!chatId || !permissionsData) return;
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions: permissionsData.defaultMemberPermissions })
      });
      if (res.ok) {
        showNotification('Telegram default member permissions updated', 'success');
      } else {
        showNotification('Failed to update permissions', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // Handlers for Role Assignment
  const handleAssignRole = async () => {
    if (!chatId || !roleModalTarget) return;
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/moderators/${roleModalTarget.userId}/role`, {
        method: 'POST',
        body: JSON.stringify({ role: selectedRoleToAssign })
      });
      const data = await res.json();
      if (res.ok) {
        showNotification(`Assigned role ${selectedRoleToAssign} to ${roleModalTarget.name}`, 'success');
        setShowRoleModal(false);
        loadTabData('moderators');
      } else {
        showNotification(data.error || 'Failed to update role', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  // Handlers for Lust Memory Reset
  const handleResetGroupLust = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Reset Group Lust?',
      description: 'Reset group intimacy conversation state to Level 0?',
      action: async () => {
        try {
          const res = await tmaFetch(`/api/tma/groups/${chatId}/lust/reset-group`, { method: 'POST' });
          if (res.ok) {
            showNotification('Group lust state reset', 'success');
            loadTabData('lust_mode');
          }
        } catch (err: any) {
          showNotification(err.message, 'error');
        }
      }
    });
  };

  const handleResetUsersLust = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Reset All Users Lust?',
      description: 'Reset individual member lust levels in this group?',
      action: async () => {
        try {
          const res = await tmaFetch(`/api/tma/groups/${chatId}/lust/reset-users`, { method: 'POST' });
          if (res.ok) {
            showNotification('All member lust levels reset', 'success');
            loadTabData('lust_mode');
          }
        } catch (err: any) {
          showNotification(err.message, 'error');
        }
      }
    });
  };

  // Role Badge Formatter
  const renderRoleBadge = () => {
    switch (role) {
      case 'GROUP_OWNER':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            👑 Group Owner
          </span>
        );
      case 'EXCEPTION_ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            ⚡ Exception Admin
          </span>
        );
      case 'GROUP_ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            🛡️ Group Admin
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
            Unauthorized
          </span>
        );
    }
  };

  // Tab metadata dictionary
  const tabMetadata: Record<MiniAppFeature, { label: string; icon: any; ownerOnly: boolean }> = {
    overview: { label: 'Overview', icon: Layers, ownerOnly: true },
    welcome_goodbye: { label: 'Welcome', icon: FileText, ownerOnly: true },
    general: { label: 'General', icon: Sliders, ownerOnly: false },
    moderation: { label: 'Moderation', icon: Shield, ownerOnly: false },
    content_protection: { label: 'Protection', icon: Lock, ownerOnly: false },
    rich_post: { label: 'Rich Post', icon: Send, ownerOnly: false },
    mention_all: { label: 'Mention All', icon: Radio, ownerOnly: false },
    lust_mode: { label: 'Lust Mode', icon: Flame, ownerOnly: false },
    stickers: { label: 'Stickers', icon: Sparkles, ownerOnly: false },
    auto_engine: { label: 'Auto Engine', icon: Zap, ownerOnly: false },
    moderators: { label: 'Moderators', icon: Users, ownerOnly: false },
    commands: { label: 'Commands', icon: ListChecks, ownerOnly: false },
    ai_conversation: { label: 'AI Chat', icon: Bot, ownerOnly: true },
    slowmode: { label: 'Slowmode', icon: Clock, ownerOnly: true },
    abuse_words: { label: 'Abuse Words', icon: Ban, ownerOnly: true },
    members: { label: 'Members', icon: Users, ownerOnly: true },
    permissions: { label: 'Permissions', icon: Lock, ownerOnly: true },
    schedules: { label: 'Schedules', icon: Clock, ownerOnly: true },
    activity: { label: 'Activity', icon: Database, ownerOnly: true },
    backup: { label: 'Backup', icon: Download, ownerOnly: true }
  };

  const isOwnerOrException = role === 'GROUP_OWNER' || role === 'EXCEPTION_ADMIN';

  // Screen: Loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 space-y-4 font-sans">
        <div className="relative">
          <div className="w-14 h-14 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-base font-bold text-white">Authenticating with Telegram...</h2>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
            Verifying cryptographic launch credentials and authoritative group permissions.
          </p>
        </div>
        {loadingSlow && (
          <div className="mt-3 p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 max-w-xs text-center space-y-2">
            <p className="text-slate-400">Connecting is taking longer than usual. The server may be waking up from sleep.</p>
            <button
              onClick={() => setInitAttempts(c => c + 1)}
              className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 mx-auto transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry Connection
            </button>
          </div>
        )}
      </div>
    );
  }

  // Screen: Error / Unauthorized
  if (authError || role === 'UNAUTHORIZED') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center space-y-4 font-sans">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
          <XCircle className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white">Access Not Granted</h2>
          <p className="text-xs text-slate-300 max-w-sm leading-relaxed">
            {authError || 'You do not have administrative privileges in this group.'}
          </p>
        </div>

        <button
          onClick={() => {
            setAuthError(null);
            setAuthLoading(true);
            setInitAttempts(c => c + 1);
          }}
          className="w-full max-w-xs py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-cyan-600/20 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Retry Connection
        </button>

        <div className="text-[11px] font-mono text-slate-500 bg-slate-900/60 border border-slate-800 rounded-xl p-3 max-w-xs text-left w-full space-y-1">
          <div>Target Chat: <span className="text-slate-300">{debugInfo.resolvedChatId || 'Not found'}</span></div>
          <div>Telegram SDK: <span className="text-slate-300">{debugInfo.tgAvailable ? 'Detected' : 'Not detected'}</span></div>
          <div>InitData: <span className="text-slate-300">{debugInfo.initDataPresent ? 'Present' : 'Missing'}</span></div>
        </div>
      </div>
    );
  }

  // Navigation Filter
  const ownerTabs: MiniAppFeature[] = [
    'overview',
    'welcome_goodbye',
    'ai_conversation',
    'permissions',
    'members',
    'schedules',
    'slowmode',
    'abuse_words',
    'activity',
    'backup'
  ];

  const moderationTabs: MiniAppFeature[] = [
    'general',
    'moderation',
    'content_protection',
    'rich_post',
    'mention_all',
    'lust_mode',
    'stickers',
    'auto_engine',
    'moderators',
    'commands'
  ];

  const currentTabsToDisplay = isOwnerOrException
    ? (navCategory === 'owner' ? ownerTabs : moderationTabs).filter(f => allowedFeatures.includes(f))
    : moderationTabs.filter(f => allowedFeatures.includes(f));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-16 font-sans">
      {/* 1. Header with Group Context and Role Badge */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-white truncate flex items-center gap-1.5">
              <span>{chatTitle}</span>
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-400 font-mono">ID: {chatId}</span>
              {renderRoleBadge()}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-xs text-slate-300 font-medium">
              {user?.first_name || user?.username ? `@${user?.username || user?.first_name}` : `User ${user?.id}`}
            </div>
            <div className="text-[10px] text-emerald-400 flex items-center justify-end gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Verified
            </div>
          </div>
        </div>

        {/* Floating Notification */}
        {notice && (
          <div className={`mt-2 p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
            notice.type === 'error'
              ? 'bg-red-950/80 border-red-500/40 text-red-200'
              : notice.type === 'info'
              ? 'bg-blue-950/80 border-blue-500/40 text-blue-200'
              : 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
          }`}>
            {notice.type === 'error' ? <AlertTriangle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
            <span className="flex-1">{notice.message}</span>
          </div>
        )}

        {/* Role Separation Category Switcher (Owner & Exception Admin only) */}
        {isOwnerOrException && (
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => {
                setNavCategory('owner');
                if (!ownerTabs.includes(activeTab)) setActiveTab(ownerTabs[0]);
              }}
              className={`py-1 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 ${
                navCategory === 'owner'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              👑 Owner Controls
            </button>
            <button
              onClick={() => {
                setNavCategory('moderation');
                if (!moderationTabs.includes(activeTab)) setActiveTab(moderationTabs[0]);
              }}
              className={`py-1 rounded-lg font-semibold transition-all flex items-center justify-center gap-1.5 ${
                navCategory === 'moderation'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🛡️ Moderation & Engagement
            </button>
          </div>
        )}

        {/* Admin Guidance Banner */}
        {role === 'GROUP_ADMIN' && (
          <div className="mt-2 p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-[11px] text-cyan-200 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Administrator View: Moderation and engagement modules enabled.</span>
          </div>
        )}

        {/* 2. Scrollable Feature Navigation */}
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {currentTabsToDisplay.map(feat => {
            const meta = tabMetadata[feat];
            if (!meta) return null;
            const Icon = meta.icon;
            const isActive = activeTab === feat;

            return (
              <button
                key={feat}
                onClick={() => setActiveTab(feat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors flex-shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/30'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* 3. Tab Body Container */}
      <main className="flex-1 p-4 max-w-xl mx-auto w-full">
        {tabLoading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
            <span className="text-xs text-slate-400">Loading {tabMetadata[activeTab]?.label || activeTab}...</span>
          </div>
        ) : (
          <>
            {/* TAB: OVERVIEW */}
            {activeTab === 'overview' && overviewData && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-cyan-400" /> Community Overview
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                      <div className="text-2xl font-bold text-white">{overviewData.memberCount || '—'}</div>
                      <div className="text-xs text-slate-400">Members</div>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                      <div className="text-2xl font-bold text-cyan-400">{overviewData.settings?.abuseWordsCount || 0}</div>
                      <div className="text-xs text-slate-400">Banned Words</div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Modules</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-slate-800">
                      <span>Anti-Flood</span>
                      <span className={overviewData.settings?.floodEnabled ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {overviewData.settings?.floodEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-slate-800">
                      <span>Anti-Raid</span>
                      <span className={overviewData.settings?.raidEnabled ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {overviewData.settings?.raidEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-slate-800">
                      <span>Join CAPTCHA</span>
                      <span className={overviewData.settings?.captchaEnabled ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {overviewData.settings?.captchaEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-slate-800">
                      <span>Lust Mode</span>
                      <span className={overviewData.settings?.lustMode ? 'text-pink-400 font-bold' : 'text-slate-500'}>
                        {overviewData.settings?.lustMode ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-slate-800">
                      <span>AI Chatbot</span>
                      <span className={overviewData.settings?.chatbotEnabled ? 'text-purple-400 font-bold' : 'text-slate-500'}>
                        {overviewData.settings?.chatbotEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-slate-800">
                      <span>Auto Engine</span>
                      <span className={overviewData.settings?.autoEngineMode !== 'off' ? 'text-indigo-400 font-bold' : 'text-slate-500'}>
                        {overviewData.settings?.autoEngineMode?.toUpperCase() || 'OFF'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: WELCOME & GOODBYE */}
            {activeTab === 'welcome_goodbye' && (
              <div className="space-y-4">
                {/* Sub-tab navigation */}
                <div className="flex gap-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl text-xs font-semibold">
                  {[
                    { id: 'welcome' as const, label: '👥 Group Welcome' },
                    { id: 'goodbye' as const, label: '👋 Group Goodbye' },
                    { id: 'dm' as const, label: '✉️ Welcome DM' }
                  ].map(st => (
                    <button
                      key={st.id}
                      onClick={() => setWelcomeSubTab(st.id)}
                      className={`flex-1 py-2 rounded-xl transition-all cursor-pointer ${
                        welcomeSubTab === st.id
                          ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                {/* Subtab Body */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                  {welcomeSubTab === 'welcome' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-white">Enable Group Welcome</h4>
                          <p className="text-[11px] text-slate-400">Broadcasted in group when a real human joins</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(welcomeData.groupWelcome.enabled)}
                          onChange={e => {
                            const updated = { ...welcomeData.groupWelcome, enabled: e.target.checked };
                            setWelcomeData({ ...welcomeData, groupWelcome: updated });
                            handleSaveWelcome({ groupWelcome: updated });
                          }}
                          className="w-5 h-5 accent-cyan-500 rounded"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">
                          Welcome Text ({`{user}, {groupname}, {chat}`})
                        </label>
                        <textarea
                          rows={3}
                          value={welcomeData.groupWelcome.text || ''}
                          onChange={e => setWelcomeData({
                            ...welcomeData,
                            groupWelcome: { ...welcomeData.groupWelcome, text: e.target.value }
                          })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white"
                        />
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleSaveWelcome()}
                          disabled={welcomeSaving}
                          className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" /> {welcomeSaving ? 'Saving...' : 'Save Welcome'}
                        </button>
                        <button
                          onClick={() => handleTestWelcome('groupWelcome')}
                          disabled={welcomeTesting}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" /> Test to Group
                        </button>
                      </div>
                    </div>
                  )}

                  {welcomeSubTab === 'goodbye' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-white">Enable Group Goodbye</h4>
                          <p className="text-[11px] text-slate-400">Broadcasted in group when a member leaves</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(welcomeData.groupGoodbye.enabled)}
                          onChange={e => {
                            const updated = { ...welcomeData.groupGoodbye, enabled: e.target.checked };
                            setWelcomeData({ ...welcomeData, groupGoodbye: updated });
                            handleSaveWelcome({ groupGoodbye: updated });
                          }}
                          className="w-5 h-5 accent-cyan-500 rounded"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">
                          Goodbye Text ({`{user}, {groupname}`})
                        </label>
                        <textarea
                          rows={3}
                          value={welcomeData.groupGoodbye.text || ''}
                          onChange={e => setWelcomeData({
                            ...welcomeData,
                            groupGoodbye: { ...welcomeData.groupGoodbye, text: e.target.value }
                          })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white"
                        />
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleSaveWelcome()}
                          disabled={welcomeSaving}
                          className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" /> {welcomeSaving ? 'Saving...' : 'Save Goodbye'}
                        </button>
                        <button
                          onClick={() => handleTestWelcome('groupGoodbye')}
                          disabled={welcomeTesting}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" /> Test to Group
                        </button>
                      </div>
                    </div>
                  )}

                  {welcomeSubTab === 'dm' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-white">Enable Private Welcome DM</h4>
                          <p className="text-[11px] text-slate-400">Sent to user in private chat upon join</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(welcomeData.welcomeDm.enabled)}
                          onChange={e => {
                            const updated = { ...welcomeData.welcomeDm, enabled: e.target.checked };
                            setWelcomeData({ ...welcomeData, welcomeDm: updated });
                            handleSaveWelcome({ welcomeDm: updated });
                          }}
                          className="w-5 h-5 accent-cyan-500 rounded"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">DM Text</label>
                        <textarea
                          rows={3}
                          value={welcomeData.welcomeDm.text || ''}
                          onChange={e => setWelcomeData({
                            ...welcomeData,
                            welcomeDm: { ...welcomeData.welcomeDm, text: e.target.value }
                          })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white"
                        />
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Telegram User ID for test"
                          value={testDmUserId}
                          onChange={e => setTestDmUserId(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                        />
                        <button
                          onClick={() => handleTestWelcome('welcomeDm')}
                          disabled={welcomeTesting}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-semibold flex items-center gap-1"
                        >
                          <Send className="w-3.5 h-3.5" /> Test DM
                        </button>
                      </div>

                      <button
                        onClick={() => handleSaveWelcome()}
                        disabled={welcomeSaving}
                        className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" /> {welcomeSaving ? 'Saving...' : 'Save Welcome DM'}
                      </button>
                    </div>
                  )}

                  {/* Auto-Delete Join/Leave Messages Toggle */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-white">Auto-Delete Join/Leave Service Messages</div>
                      <div className="text-[10px] text-slate-500">Purges "user joined the group" notifications</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(welcomeData.autoDeleteJoinLeave)}
                      onChange={e => {
                        const updatedVal = e.target.checked;
                        setWelcomeData({ ...welcomeData, autoDeleteJoinLeave: updatedVal });
                        handleSaveWelcome({ autoDeleteJoinLeave: updatedVal });
                      }}
                      className="w-5 h-5 accent-cyan-500 rounded"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB: GENERAL SETTINGS */}
            {activeTab === 'general' && settings && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Sliders className="w-4 h-4 text-cyan-400" /> General Group Configuration
                </h3>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Warning Threshold Before Action</label>
                    <select
                      value={settings.warnLimit ?? 3}
                      onChange={e => handleUpdateSettings({ warnLimit: Number(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                    >
                      <option value={1}>1 Warning</option>
                      <option value={3}>3 Warnings (Standard)</option>
                      <option value={5}>5 Warnings</option>
                      <option value={10}>10 Warnings</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Action on Warning Threshold</label>
                    <select
                      value={settings.warnAction || 'mute'}
                      onChange={e => handleUpdateSettings({ warnAction: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                    >
                      <option value="mute">Mute User</option>
                      <option value="kick">Kick User</option>
                      <option value="ban">Ban User</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Warning Expiry</label>
                    <select
                      value={settings.warnExpireSeconds ?? 0}
                      onChange={e => handleUpdateSettings({ warnExpireSeconds: Number(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                    >
                      <option value={0}>Never Expire</option>
                      <option value={86400}>1 Day</option>
                      <option value={604800}>7 Days</option>
                      <option value={2592000}>30 Days</option>
                    </select>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">Anti-Flood Protection</div>
                      <div className="text-slate-500 text-[11px]">Automatically mute message spammers</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.floodEnabled)}
                      onChange={e => handleUpdateSettings({ floodEnabled: e.target.checked })}
                      className="w-5 h-5 accent-cyan-500 rounded"
                    />
                  </div>

                  {settings.floodEnabled && (
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div>
                        <label className="text-slate-400 text-[10px] block mb-0.5">Burst Limit</label>
                        <select
                          value={settings.floodCount || 5}
                          onChange={e => handleUpdateSettings({ floodCount: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-white text-xs"
                        >
                          <option value={3}>3 msgs</option>
                          <option value={5}>5 msgs</option>
                          <option value={10}>10 msgs</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 text-[10px] block mb-0.5">Window</label>
                        <select
                          value={settings.floodWindow || 5}
                          onChange={e => handleUpdateSettings({ floodWindow: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-white text-xs"
                        >
                          <option value={3}>3s</option>
                          <option value={5}>5s</option>
                          <option value={10}>10s</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">Join CAPTCHA</div>
                      <div className="text-slate-500 text-[11px]">Require new members to verify identity</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.captchaEnabled)}
                      onChange={e => handleUpdateSettings({ captchaEnabled: e.target.checked })}
                      className="w-5 h-5 accent-cyan-500 rounded"
                    />
                  </div>

                  {settings.captchaEnabled && (
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div>
                        <label className="text-slate-400 text-[10px] block mb-0.5">Mode</label>
                        <select
                          value={settings.captchaMode || 'button'}
                          onChange={e => handleUpdateSettings({ captchaMode: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-white text-xs"
                        >
                          <option value="button">Button Click</option>
                          <option value="math">Math Puzzle</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 text-[10px] block mb-0.5">Timeout</label>
                        <select
                          value={settings.captchaTimeout || 120}
                          onChange={e => handleUpdateSettings({ captchaTimeout: Number(e.target.value) })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-white text-xs"
                        >
                          <option value={60}>60s</option>
                          <option value={120}>120s</option>
                          <option value={300}>300s</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">Auto-Accept Join Requests</div>
                      <div className="text-slate-500 text-[11px]">Approve pending group join requests automatically</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.autoAcceptEnabled)}
                      onChange={e => handleUpdateSettings({ autoAcceptEnabled: e.target.checked })}
                      className="w-5 h-5 accent-cyan-500 rounded"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB: MODERATION */}
            {activeTab === 'moderation' && settings && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Shield className="w-4 h-4 text-cyan-400" /> Moderation & Anti-Spam Engines
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {[
                      { key: 'stopSpamEnabled', label: '🛑 Master Anti-Spam', desc: 'Global filter for spam patterns' },
                      { key: 'floodEnabled', label: '🌊 Anti-Flood Engine', desc: 'Limit rapid-fire message bursts' },
                      { key: 'raidEnabled', label: '🛡️ Anti-Raid Defense', desc: 'Lockdown group on mass joins' },
                      { key: 'stopAbusiveEnabled', label: '🤬 Abuse Filter', desc: 'Enforce custom & core abuse lists' },
                      { key: 'stopPromotionEnabled', label: '📢 Promo Filter', desc: 'Block channel adverts & invites' },
                      { key: 'automodEnabled', label: '🤖 Auto-Moderator', desc: 'Automated warnings & escalation' },
                      { key: 'reportsEnabled', label: '🚩 Member Reports', desc: 'Allow @admin report triggers' },
                      { key: 'securityEnabled', label: '🔒 Deep Security', desc: 'Enhanced link & forward analysis' }
                    ].map(m => (
                      <div key={m.key} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-slate-800">
                        <div>
                          <div className="font-semibold text-white">{m.label}</div>
                          <div className="text-[10px] text-slate-400">{m.desc}</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(settings[m.key])}
                          onChange={e => handleUpdateSettings({ [m.key]: e.target.checked })}
                          className="w-5 h-5 accent-cyan-500 rounded"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Active Warnings Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center justify-between">
                    <span>Active Warnings in Group ({groupWarnings.length})</span>
                    <button
                      onClick={() => loadTabData('moderation')}
                      className="text-slate-400 hover:text-white"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </h4>

                  {groupWarnings.length === 0 ? (
                    <div className="text-xs text-slate-500 py-4 text-center">No active member warnings recorded.</div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {groupWarnings.map((w: any, idx: number) => (
                        <div key={idx} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                          <div>
                            <div className="font-mono text-white">User ID: {w.userId}</div>
                            <div className="text-[11px] text-slate-400">{w.reason || 'Violation'} • {new Date(w.timestamp).toLocaleDateString()}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded font-bold font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 text-[10px]">
                              {w.count} / {settings.warnLimit || 3}
                            </span>
                            <button
                              onClick={() => handleClearWarning(w.userId)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-rose-300 rounded-lg text-[10px]"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: CONTENT PROTECTION */}
            {activeTab === 'content_protection' && settings && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Lock className="w-4 h-4 text-emerald-400" /> Content & Media Protection
                </h3>

                <div className="space-y-3 text-xs">
                  {[
                    { key: 'linksProtection', label: '🔗 Links Protection', desc: 'Block unauthorized URLs' },
                    { key: 'promotionalSpamProtection', label: '🛡️ Promotional Link Spam Defense', desc: 'Detects and purges automated broadcast bots' },
                    { key: 'stickerProtection', label: '🎨 Sticker Protection', desc: 'Restrict oversized sticker spam' },
                    { key: 'fileProtection', label: '📁 File Protection', desc: 'Block downloadable executables/docs' },
                    { key: 'imageProtection', label: '🖼️ Image Protection', desc: 'Restrict mass image uploads' },
                    { key: 'gifProtection', label: '🎬 GIF/Animation Protection', desc: 'Block looping GIF spam' },
                    { key: 'voiceProtection', label: '🎤 Voice Message Protection', desc: 'Block voice notes from non-admins' }
                  ].map(p => (
                    <div key={p.key} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-slate-800">
                      <div>
                        <div className="text-white font-medium">{p.label}</div>
                        <div className="text-slate-500 text-[11px]">{p.desc}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(settings[p.key] ?? (p.key === 'promotionalSpamProtection' ? true : false))}
                        onChange={e => handleUpdateSettings({ [p.key]: e.target.checked })}
                        className="w-5 h-5 accent-cyan-500 rounded"
                      />
                    </div>
                  ))}

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-slate-800">
                    <div>
                      <div className="text-white font-medium">Block Forwarded Messages</div>
                      <div className="text-slate-500 text-[11px]">Stop channel forward spam</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.locks?.forwards)}
                      onChange={e => handleUpdateSettings({ locks: { ...(settings.locks || {}), forwards: e.target.checked } })}
                      className="w-5 h-5 accent-cyan-500 rounded"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB: RICH POST */}
            {activeTab === 'rich_post' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Send className="w-4 h-4 text-cyan-400" /> Send Rich Message to Group
                </h3>

                <div className="space-y-3 text-xs">
                  {/* Content Type pills */}
                  <div>
                    <label className="text-slate-400 block mb-1">Content Type</label>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                      {(['text', 'photo', 'video', 'document', 'sticker'] as const).map(ct => (
                        <button
                          key={ct}
                          onClick={() => setPostContentType(ct)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition cursor-pointer ${
                            postContentType === ct
                              ? 'bg-cyan-500 text-slate-950 font-bold'
                              : 'bg-slate-950 border border-slate-800 text-slate-300'
                          }`}
                        >
                          {ct}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Media ID input if not text */}
                  {postContentType !== 'text' && (
                    <div>
                      <label className="text-slate-400 block mb-1">Telegram File ID or Public Media URL</label>
                      <input
                        type="text"
                        value={postMediaId}
                        onChange={e => setPostMediaId(e.target.value)}
                        placeholder="Telegram file_id or https://... image URL"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                      />
                    </div>
                  )}

                  {/* Message / Caption */}
                  <div>
                    <label className="text-slate-400 block mb-1">
                      {postContentType === 'text' ? 'Message Content (Markdown supported)' : 'Caption (Optional)'}
                    </label>
                    <textarea
                      rows={4}
                      value={postContent}
                      onChange={e => setPostContent(e.target.value)}
                      placeholder="Write your announcement or formatted message here..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* Interactive Button Builder */}
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="text-white font-medium flex items-center justify-between">
                      <span>Inline URL Buttons</span>
                      <span className="text-[10px] text-slate-400 font-mono">{postButtons.length} Added</span>
                    </div>

                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        placeholder="Button Label"
                        value={newBtnText}
                        onChange={e => setNewBtnText(e.target.value)}
                        className="w-1/2 bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs"
                      />
                      <input
                        type="text"
                        placeholder="https://..."
                        value={newBtnUrl}
                        onChange={e => setNewBtnUrl(e.target.value)}
                        className="w-1/2 bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs"
                      />
                    </div>
                    <button
                      onClick={handleAddPostButton}
                      disabled={!newBtnText.trim() || !newBtnUrl.trim()}
                      className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-cyan-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Button
                    </button>

                    {postButtons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {postButtons.map((b, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-cyan-950/40 border border-cyan-500/30 text-cyan-300">
                            <span>{b.text}</span>
                            <button onClick={() => handleRemovePostButton(idx)} className="text-cyan-400 hover:text-white">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={postPin}
                        onChange={e => setPostPin(e.target.checked)}
                        className="w-4 h-4 accent-cyan-500 rounded"
                      />
                      <span className="text-white text-xs">Pin Message</span>
                    </label>
                    <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={postProtect}
                        onChange={e => setPostProtect(e.target.checked)}
                        className="w-4 h-4 accent-cyan-500 rounded"
                      />
                      <span className="text-white text-xs">Protect Content</span>
                    </label>
                  </div>

                  {/* Post Library Integration (Feature 1 & 2) */}
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={handleOpenPostLibrary}
                      className="py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <Bookmark className="w-3.5 h-3.5" /> Library
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLoadPostFromIdInput('');
                        setLoadPostFromIdError(null);
                        setShowLoadPostFromIdModal(true);
                      }}
                      className="py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                      title="Load saved post by ID"
                    >
                      <Copy className="w-3.5 h-3.5" /> From ID
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSavePostModal(true)}
                      disabled={!postContent.trim()}
                      className="py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-40"
                    >
                      <Save className="w-3.5 h-3.5" /> Save
                    </button>
                  </div>

                  {/* Send Button */}
                  <button
                    onClick={handleSendRichPost}
                    disabled={postSending || !postContent.trim()}
                    className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Send className="w-4 h-4" /> {postSending ? 'Sending...' : 'Send Rich Post'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB: MENTION ALL */}
            {activeTab === 'mention_all' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Radio className="w-4 h-4 text-cyan-400" /> Mention All (@all) Broadcast
                  </h3>
                  {mentionAllStatus?.active ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                      Broadcasting ({mentionAllStatus.progress || 'Active'})
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">
                      Idle
                    </span>
                  )}
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Broadcast Reason / Announcement</label>
                    <input
                      type="text"
                      value={mentionReason}
                      onChange={e => setMentionReason(e.target.value)}
                      placeholder="e.g. Important announcement for all members"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Custom Template (Optional: {`{mention}, {name}`})</label>
                    <input
                      type="text"
                      value={mentionTemplate}
                      onChange={e => setMentionTemplate(e.target.value)}
                      placeholder="{mention} Check the pinned message!"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                    />
                  </div>

                  {/* Telemetry card */}
                  {mentionAllStatus && (
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                      <div className="flex justify-between text-slate-400 text-[11px]">
                        <span>Processed: {mentionAllStatus.processedMembers || 0} / {mentionAllStatus.totalMembers || '—'}</span>
                        <span className="text-emerald-400">Success: {mentionAllStatus.successfulMentions || 0}</span>
                      </div>
                      {mentionAllStatus.active && (
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-cyan-500 h-full w-1/2 animate-pulse" />
                        </div>
                      )}
                    </div>
                  )}

                  {mentionAllStatus?.active ? (
                    <button
                      onClick={handleStopMentionAll}
                      className="w-full bg-red-500 hover:bg-red-400 text-white font-bold py-2.5 rounded-xl transition cursor-pointer"
                    >
                      Stop Current Broadcast
                    </button>
                  ) : (
                    <button
                      onClick={handleStartMentionAll}
                      className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Radio className="w-4 h-4" /> Start @all Mention Broadcast
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* TAB: LUST MODE */}
            {activeTab === 'lust_mode' && settings && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-pink-400 flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Flame className="w-4 h-4" /> Lust Mode & Flirtatious Intelligence
                </h3>

                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">Enable Lust Mode</div>
                      <div className="text-slate-500 text-[11px]">Roxie uses spicy, teasing conversation style</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.lustMode)}
                      onChange={e => handleUpdateSettings({ lustMode: e.target.checked })}
                      className="w-5 h-5 accent-pink-500 rounded"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-400 mb-1.5">
                      <span>Group Base Intensity Level</span>
                      <span className="font-bold text-pink-400">Level {settings.lustLevel ?? 0} / 4</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[0, 1, 2, 3, 4].map(lvl => (
                        <button
                          key={lvl}
                          onClick={() => handleUpdateSettings({ lustLevel: lvl })}
                          className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                            (settings.lustLevel ?? 0) === lvl
                              ? 'bg-pink-600 text-white shadow-sm'
                              : 'bg-slate-950 border border-slate-800 text-slate-300 hover:text-pink-400'
                          }`}
                        >
                          Lvl {lvl}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={handleResetGroupLust}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-xl text-xs transition cursor-pointer"
                    >
                      Reset Group State (0)
                    </button>
                    <button
                      onClick={handleResetUsersLust}
                      className="bg-red-950/40 border border-red-500/30 text-red-300 hover:bg-red-900/40 py-2 rounded-xl text-xs transition cursor-pointer"
                    >
                      Reset All Users
                    </button>
                  </div>

                  {/* User Lust Levels */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <h4 className="text-xs font-bold text-pink-400 uppercase tracking-wider">
                      User Lust Levels in this Group ({lustUsers.length})
                    </h4>
                    {lustUsers.length === 0 ? (
                      <p className="text-slate-500 text-center py-3">No individual user lust records yet.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {lustUsers.map((u: any, idx: number) => (
                          <div key={idx} className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 flex justify-between items-center text-xs">
                            <span className="font-mono text-slate-300">ID: {u.userId}</span>
                            <span className="px-2 py-0.5 rounded font-bold font-mono bg-pink-500/10 text-pink-400 text-[10px]">
                              Lvl {u.level}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: STICKERS */}
            {activeTab === 'stickers' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 flex-wrap gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Smile className="w-4 h-4 text-amber-400" /> Group Sticker Pack Management
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleCopyAllStickerPackLinks}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      title="Copy All Sticker Pack Links"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy All Links
                    </button>
                    <button
                      onClick={() => setShowStickerModal(true)}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Pack
                    </button>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  {(!stickersData?.packs || stickersData.packs.length === 0) ? (
                    <div className="text-center py-8 space-y-2 border border-dashed border-slate-800 rounded-xl">
                      <Smile className="w-8 h-8 text-slate-600 mx-auto" />
                      <p className="text-slate-400">No sticker packs configured for this group.</p>
                      <button
                        onClick={() => setShowStickerModal(true)}
                        className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium cursor-pointer"
                      >
                        Add First Sticker Pack
                      </button>
                    </div>
                  ) : (
                    stickersData.packs.map((pack: any, idx: number) => {
                      const isEnabled = pack.enabled !== false;
                      return (
                        <div key={idx} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-bold text-white">{pack.title || pack.name}</div>
                              <div className="text-[11px] font-mono text-slate-400">
                                {pack.name} • {pack.stickerCount || pack.stickers?.length || 0} Stickers
                              </div>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isEnabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {isEnabled ? '🟢 Enabled' : '🔴 Disabled'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                            <button
                              onClick={() => setPreviewPack(pack)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" /> Preview
                            </button>
                            <button
                              onClick={() => handleToggleStickerPack(pack.name, !isEnabled)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${
                                isEnabled ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                              }`}
                            >
                              {isEnabled ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => handleRemoveStickerPack(pack.name)}
                              className="px-2.5 py-1 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-lg text-[11px] ml-auto flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" /> Remove
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB: AUTO ENGINE */}
            {activeTab === 'auto_engine' && settings && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Autonomous Auto Engine
                  </h3>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    settings.autoEngine?.enabled && settings.autoEngine?.mode !== 'off'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {settings.autoEngine?.enabled && settings.autoEngine?.mode !== 'off' ? 'Active' : 'Disabled'}
                  </span>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Master Switch */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div>
                      <div className="text-white font-medium">Auto Engine Master Switch</div>
                      <div className="text-slate-500 text-[11px]">Proactive AI message and sticker conversation participation</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.autoEngine?.enabled && settings.autoEngine?.mode !== 'off')}
                      onChange={e => {
                        const enabled = e.target.checked;
                        const newMode = enabled ? (settings.autoEngine?.mode === 'off' ? 'messages_and_stickers' : settings.autoEngine?.mode || 'messages_and_stickers') : 'off';
                        handleUpdateSettings({
                          autoEngine: { ...(settings.autoEngine || {}), enabled, mode: newMode }
                        });
                      }}
                      className="w-5 h-5 accent-indigo-500 rounded"
                    />
                  </div>

                  {/* Mode selector */}
                  <div>
                    <label className="text-slate-400 block mb-1">Operating Mode</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'off', label: 'Off', desc: 'Disabled' },
                        { id: 'messages_only', label: 'Messages Only', desc: 'Text only' },
                        { id: 'stickers_only', label: 'Stickers Only', desc: 'Stickers only' },
                        { id: 'messages_and_stickers', label: 'Both', desc: 'Full participation' }
                      ].map(m => (
                        <button
                          key={m.id}
                          onClick={() => handleUpdateSettings({
                            autoEngine: {
                              ...(settings.autoEngine || {}),
                              enabled: m.id !== 'off',
                              mode: m.id
                            }
                          })}
                          className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                            settings.autoEngine?.mode === m.id
                              ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-300'
                          }`}
                        >
                          <div className="font-semibold">{m.label}</div>
                          <div className="text-[10px] text-slate-500">{m.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Presets */}
                  <div>
                    <label className="text-slate-400 block mb-1">Frequency Preset</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'very_low', label: 'Very Low (30-60m)' },
                        { id: 'low', label: 'Low (15-30m)' },
                        { id: 'normal', label: 'Normal (8-15m)' },
                        { id: 'high', label: 'High (3-8m)' },
                        { id: 'custom', label: 'Custom' }
                      ].map(p => (
                        <button
                          key={p.id}
                          onClick={() => handleUpdateSettings({
                            autoEngine: {
                              ...(settings.autoEngine || {}),
                              messages: { ...(settings.autoEngine?.messages || {}), preset: p.id },
                              stickers: { ...(settings.autoEngine?.stickers || {}), preset: p.id }
                            }
                          })}
                          className={`p-2 rounded-xl border text-center transition cursor-pointer text-xs ${
                            settings.autoEngine?.messages?.preset === p.id || (!settings.autoEngine?.messages?.preset && p.id === 'normal')
                              ? 'bg-cyan-500 text-slate-950 font-bold'
                              : 'bg-slate-950 border border-slate-800 text-slate-300'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Telemetry Cooldown Status */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-400 text-[10px]">Message Cooldown</div>
                      <div className="text-xs font-mono font-bold text-cyan-400 mt-0.5">
                        {settings.autoEngineMessageNextSeconds > 0 ? `⏳ in ~${settings.autoEngineMessageNextSeconds}s` : '🟢 Ready'}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-slate-400 text-[10px]">Sticker Cooldown</div>
                      <div className="text-xs font-mono font-bold text-amber-400 mt-0.5">
                        {settings.autoEngineStickerNextSeconds > 0 ? `⏳ in ~${settings.autoEngineStickerNextSeconds}s` : '🟢 Ready'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: AI CHAT */}
            {activeTab === 'ai_conversation' && settings && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Bot className="w-4 h-4" /> Roxie AI Chatbot & Personality
                </h3>

                <div className="space-y-3.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">Enable AI Chatbot</div>
                      <div className="text-slate-500 text-[11px]">Roxie replies naturally when mentioned or replied to</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.chatbotEnabled ?? true)}
                      onChange={e => handleUpdateSettings({ chatbotEnabled: e.target.checked })}
                      className="w-5 h-5 accent-purple-500 rounded"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">Brother-Zone Filter</div>
                      <div className="text-slate-500 text-[11px]">Playful response when members call Roxie 'didi' or 'sister'</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.brotherZoneEnabled)}
                      onChange={e => handleUpdateSettings({ brotherZoneEnabled: e.target.checked })}
                      className="w-5 h-5 accent-purple-500 rounded"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">AI Personality Style</label>
                    <select
                      value={settings.personality || 'normal'}
                      onChange={e => handleUpdateSettings({ personality: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                    >
                      <option value="normal">😊 Sweet & Helpful (Normal)</option>
                      <option value="tsundere">😤 Tsundere (Feisty & Proud)</option>
                      <option value="affectionate">🥰 Affectionate (Warm & Caring)</option>
                      <option value="strict">🧐 Strict (Disciplined Moderator)</option>
                      <option value="sarcastic">😏 Sarcastic (Witty & Teasing)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Preferred Language</label>
                    <select
                      value={settings.language || 'hinglish'}
                      onChange={e => handleUpdateSettings({ language: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                    >
                      <option value="hinglish">🇮🇳 Hinglish (Natural Indian Mix)</option>
                      <option value="hindi">🇮🇳 Hindi (Shuddh / Devanagari / Roman)</option>
                      <option value="english">🌐 English (Global)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: MEMBERS */}
            {activeTab === 'members' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyan-400" /> Group Members Console ({membersList.length})
                  </h3>
                  <button
                    onClick={() => loadTabData('members')}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="Search by name, @username, or ID..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white pl-8"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3" />
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {membersList
                    .filter(m => {
                      if (!memberSearch) return true;
                      const s = memberSearch.toLowerCase();
                      return (
                        String(m.userId).includes(s) ||
                        (m.firstName && m.firstName.toLowerCase().includes(s)) ||
                        (m.username && m.username.toLowerCase().includes(s))
                      );
                    })
                    .map((m, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-bold text-white">{m.firstName || m.name || `User ${m.userId}`}</div>
                            <div className="text-[11px] font-mono text-slate-400">
                              {m.username ? `@${m.username}` : `ID: ${m.userId}`}
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded font-bold uppercase text-[10px] bg-slate-800 text-slate-300">
                            {m.role || 'Member'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-800/80">
                          <button
                            onClick={() => handleMemberAction('ban', m.userId, m.firstName || String(m.userId))}
                            className="px-2 py-1 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 rounded-lg text-[10px] font-semibold cursor-pointer"
                          >
                            🚫 Ban
                          </button>
                          <button
                            onClick={() => handleMemberAction('unban', m.userId, m.firstName || String(m.userId))}
                            className="px-2 py-1 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-semibold cursor-pointer"
                          >
                            🔓 Unban
                          </button>
                          <button
                            onClick={() => handleMemberAction('restrict', m.userId, m.firstName || String(m.userId))}
                            className="px-2 py-1 bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-500/20 rounded-lg text-[10px] font-semibold cursor-pointer"
                          >
                            🔇 Mute
                          </button>
                          <button
                            onClick={() => handleMemberAction('promote', m.userId, m.firstName || String(m.userId))}
                            className="px-2 py-1 bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/20 rounded-lg text-[10px] font-semibold cursor-pointer"
                          >
                            👮 Promote
                          </button>
                          <button
                            onClick={() => handleMemberAction('demote', m.userId, m.firstName || String(m.userId))}
                            className="px-2 py-1 bg-slate-800 text-slate-300 hover:bg-slate-700 rounded-lg text-[10px] font-semibold cursor-pointer"
                          >
                            🔻 Demote
                          </button>
                        </div>
                      </div>
                    ))}
                  {membersList.length === 0 && (
                    <div className="text-slate-500 text-center py-6">No member records loaded.</div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: PERMISSIONS */}
            {activeTab === 'permissions' && permissionsData && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Lock className="w-4 h-4 text-cyan-400" /> Telegram Permissions Matrix
                </h3>

                <div className="space-y-4 text-xs">
                  {/* Roxie's Bot Permissions */}
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                    <div className="font-semibold text-white flex items-center justify-between">
                      <span>Roxie Administrator Status</span>
                      <span className="text-cyan-400 font-bold">{permissionsData.roxieRole}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      {Object.entries(permissionsData.roxiePermissions || {}).map(([pk, pv]) => (
                        <div key={pk} className="flex justify-between items-center p-1.5 rounded-lg bg-slate-900">
                          <span className="font-mono text-slate-400">{pk.replace('can_', '')}</span>
                          <span className={pv ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {pv ? 'ALLOWED' : 'DENIED'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Default Member Permissions */}
                  <div className="space-y-2">
                    <div className="font-semibold text-white">Default Group Member Permissions</div>
                    <p className="text-[11px] text-slate-400">Controls what regular non-admin members can do in this group</p>

                    <div className="space-y-2">
                      {Object.entries(permissionsData.defaultMemberPermissions || {}).map(([pk, pv]) => (
                        <div key={pk} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/40 border border-slate-800">
                          <span className="font-mono text-white capitalize">{pk.replace(/_/g, ' ')}</span>
                          <input
                            type="checkbox"
                            checked={Boolean(pv)}
                            onChange={() => handleTogglePermission(pk)}
                            className="w-5 h-5 accent-cyan-500 rounded"
                          />
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={handleSavePermissions}
                      className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer mt-2"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Telegram Permissions
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SCHEDULES */}
            {activeTab === 'schedules' && (
              <div className="space-y-4">
                {/* Scheduled Messages */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 flex-wrap gap-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-cyan-400" /> Scheduled Messages ({schedulesData.length})
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setCopyScheduleFromIdInput('');
                          setCopyScheduleFromIdError(null);
                          setShowCopyScheduleFromIdModal(true);
                        }}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        title="Copy configuration from an existing schedule ID"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy From ID
                      </button>
                      <button
                        onClick={handleOpenNewSchedule}
                        className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> New Schedule
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    {schedulesData.length === 0 ? (
                      <p className="text-slate-500 text-center py-4">No scheduled messages configured.</p>
                    ) : (
                      schedulesData.map((s: any) => (
                        <div key={s.id} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-bold text-white">{s.name || 'Schedule'}</div>
                              <div className="text-[11px] text-slate-400 line-clamp-1">{s.message || s.messageText}</div>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              s.enabled !== false ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {s.enabled !== false ? 'Active' : 'Paused'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800/80 pt-1.5 flex-wrap gap-2">
                            <span>Interval: {s.intervalFormatted || 'Custom'}</span>
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              <button
                                onClick={async () => {
                                  const ok = await copyTextToClipboard(s.id);
                                  if (ok) {
                                    showNotification('Schedule ID copied', 'success');
                                  } else {
                                    showNotification('Failed to copy ID to clipboard', 'error');
                                  }
                                }}
                                className="px-2 py-1 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/60 rounded-lg flex items-center gap-1 cursor-pointer"
                                title="Copy Schedule ID"
                              >
                                <Copy className="w-3 h-3" /> Copy ID
                              </button>
                              <button
                                onClick={() => handleCopyScheduleCode(s)}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1 cursor-pointer"
                                title="Export Schedule Code & JSON"
                              >
                                <Code className="w-3 h-3" /> Code
                              </button>
                              <button
                                onClick={() => handleOpenEditSchedule(s)}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center gap-1 cursor-pointer"
                                title="Edit Schedule"
                              >
                                <Edit2 className="w-3 h-3" /> Edit
                              </button>
                              <button
                                onClick={() => handleToggleSchedule(s.id, s.enabled !== false)}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                              >
                                {s.enabled !== false ? 'Pause' : 'Enable'}
                              </button>
                              <button
                                onClick={() => handleDeleteSchedule(s.id, s.name || s.id)}
                                className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Automation Rules */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" /> Automation Rules ({automationsData.length})
                    </h3>
                    <button
                      onClick={() => setShowAutomationModal(true)}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Rule
                    </button>
                  </div>

                  <div className="space-y-2 text-xs">
                    {automationsData.length === 0 ? (
                      <p className="text-slate-500 text-center py-2">No automation rules configured.</p>
                    ) : (
                      automationsData.map((a: any) => (
                        <div key={a.id} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex justify-between items-center">
                          <div>
                            <span className="font-semibold text-blue-400">{a.trigger}</span>
                            <span className="text-slate-500 mx-1">➔</span>
                            <span className="font-semibold text-amber-400">{a.action}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleToggleAutomation(a.id, a.enabled !== false)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${a.enabled !== false ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}
                            >
                              {a.enabled !== false ? 'Active' : 'Off'}
                            </button>
                            <button
                              onClick={() => handleDeleteAutomation(a.id)}
                              className="text-rose-400 hover:text-white p-1"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Group Rules */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Group Rules (/rules text)</h4>
                  <textarea
                    rows={4}
                    value={rulesText}
                    onChange={e => setRulesText(e.target.value)}
                    placeholder="Enter official group rules..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white"
                  />
                  <button
                    onClick={handleSaveRules}
                    className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Rules
                  </button>
                </div>
              </div>
            )}

            {/* TAB: ACTIVITY */}
            {activeTab === 'activity' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" /> Activity Log ({activityLogs.length})
                  </h3>
                  <button
                    onClick={() => loadTabData('activity')}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={activitySearch}
                    onChange={e => setActivitySearch(e.target.value)}
                    placeholder="Filter audit logs..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white pl-8"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3" />
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {activityLogs
                    .filter(l => {
                      if (!activitySearch) return true;
                      const s = activitySearch.toLowerCase();
                      return (
                        (l.action && l.action.toLowerCase().includes(s)) ||
                        (l.details && l.details.toLowerCase().includes(s)) ||
                        (l.adminUsername && l.adminUsername.toLowerCase().includes(s))
                      );
                    })
                    .map((l: any, idx: number) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-cyan-300 uppercase text-[10px] bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">
                            {l.action}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {new Date(l.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-white text-[11px]">{l.details || l.reason || 'Event executed'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">By: @{l.adminUsername || 'system'}</div>
                      </div>
                    ))}
                  {activityLogs.length === 0 && (
                    <div className="text-slate-500 text-center py-6 text-xs">No activity logs recorded.</div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: ABUSE WORDS */}
            {activeTab === 'abuse_words' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-sm font-bold text-red-400 flex items-center gap-2">
                    <Ban className="w-4 h-4" /> Custom Banned Words ({abuseWords.length})
                  </h3>
                  {abuseWords.length > 0 && (
                    <button
                      onClick={handleClearAllAbuseWords}
                      className="px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg text-[10px] font-semibold cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAbuseWord}
                    onChange={e => setNewAbuseWord(e.target.value)}
                    placeholder="Add banned word..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                  <button
                    onClick={handleAddAbuseWord}
                    className="bg-red-500 hover:bg-red-400 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-60 overflow-y-auto">
                  {abuseWords.length === 0 ? (
                    <div className="text-xs text-slate-500 py-4 text-center w-full">No custom abuse words added yet.</div>
                  ) : (
                    abuseWords.map(w => (
                      <span
                        key={w}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-red-950/40 border border-red-500/30 text-red-300"
                      >
                        <span>{w}</span>
                        <button onClick={() => handleRemoveAbuseWord(w)} className="text-red-400 hover:text-white cursor-pointer">
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB: MODERATORS */}
            {activeTab === 'moderators' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Users className="w-4 h-4 text-cyan-400" /> Group Administrators ({moderatorsList.length})
                </h3>

                <div className="space-y-2">
                  {moderatorsList.map(mod => (
                    <div
                      key={mod.userId}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-white">{mod.name}</div>
                        <div className="text-slate-500 font-mono text-[11px]">{mod.username ? `@${mod.username}` : `ID: ${mod.userId}`}</div>
                        {mod.customTitle && (
                          <div className="text-[10px] text-slate-400 mt-0.5">Title: {mod.customTitle}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-cyan-300 border border-slate-700">
                          {mod.role}
                        </span>
                        {isOwnerOrException && mod.status !== 'creator' && (
                          <button
                            onClick={() => {
                              setRoleModalTarget(mod);
                              setSelectedRoleToAssign(mod.customRole || 'MODERATOR');
                              setShowRoleModal(true);
                            }}
                            className="px-2 py-1 bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 rounded-lg text-[10px] font-semibold cursor-pointer"
                          >
                            Edit Role
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: SLOWMODE */}
            {activeTab === 'slowmode' && settings && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-blue-400 flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Clock className="w-4 h-4" /> Telegram Slowmode Control
                </h3>

                <div className="space-y-3 text-xs">
                  <p className="text-slate-400">
                    Controls how frequently members can send messages in this group.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Off', sec: 0 },
                      { label: '10 Seconds', sec: 10 },
                      { label: '30 Seconds', sec: 30 },
                      { label: '1 Minute', sec: 60 },
                      { label: '5 Minutes', sec: 300 },
                      { label: '15 Minutes', sec: 900 }
                    ].map(opt => (
                      <button
                        key={opt.sec}
                        onClick={async () => {
                          const res = await tmaFetch(`/api/tma/groups/${chatId}/slowmode`, {
                            method: 'PUT',
                            body: JSON.stringify({ seconds: opt.sec })
                          });
                          if (res.ok) {
                            showNotification(`Slowmode set to ${opt.label}`, 'success');
                            setSettings({ ...settings, slowModeSeconds: opt.sec });
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                          settings.slowModeSeconds === opt.sec
                            ? 'bg-blue-600 border-blue-500 text-white font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: BACKUP & RESTORE */}
            {activeTab === 'backup' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Download className="w-4 h-4 text-cyan-400" /> Group Configuration Backup
                </h3>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <a
                    href={`/api/tma/groups/${chatId}/backup/export-json?token=${token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-center flex flex-col items-center justify-center gap-1.5 transition text-slate-200 cursor-pointer"
                  >
                    <Download className="w-5 h-5 text-cyan-400" />
                    <span className="font-semibold">Export JSON</span>
                  </a>
                  <a
                    href={`/api/tma/groups/${chatId}/backup/export-csv?token=${token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-center flex flex-col items-center justify-center gap-1.5 transition text-slate-200 cursor-pointer"
                  >
                    <FileText className="w-5 h-5 text-emerald-400" />
                    <span className="font-semibold">Export CSV</span>
                  </a>
                </div>

                <div className="space-y-2 pt-2">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Safety Snapshots</h4>
                  {safetyBackups.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 text-center">No safety backups recorded yet.</div>
                  ) : (
                    safetyBackups.slice(0, 5).map(snap => (
                      <div
                        key={snap.filename}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
                      >
                        <span className="font-mono text-slate-300 text-[11px] truncate max-w-[200px]">{snap.filename}</span>
                        <button
                          onClick={async () => {
                            const res = await tmaFetch(`/api/tma/groups/${chatId}/backup/restore-history`, {
                              method: 'POST',
                              body: JSON.stringify({ filename: snap.filename })
                            });
                            if (res.ok) showNotification('Snapshot restored', 'success');
                          }}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-[11px] cursor-pointer"
                        >
                          Restore
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB: COMMANDS REFERENCE */}
            {activeTab === 'commands' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                  <ListChecks className="w-4 h-4 text-cyan-400" /> Bot Commands Reference
                </h3>

                <div className="relative">
                  <input
                    type="text"
                    value={commandSearch}
                    onChange={e => setCommandSearch(e.target.value)}
                    placeholder="Search commands..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white pl-8"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3" />
                </div>

                <div className="space-y-2 text-xs max-h-96 overflow-y-auto">
                  {(commandsList.length > 0 ? commandsList : [
                    { command: '/help', description: 'Display bot command catalog and instructions', permission: 'ALL' },
                    { command: '/status', description: 'Display group security & health summary', permission: 'ADMIN' },
                    { command: '/ban [user]', description: 'Permanently ban a member from the group', permission: 'ADMIN' },
                    { command: '/mute [user]', description: 'Mute member from speaking', permission: 'ADMIN' },
                    { command: '/warn [user]', description: 'Issue formal warning to member', permission: 'ADMIN' },
                    { command: '/all [message]', description: 'Broadcast @all mention to members', permission: 'ADMIN' },
                    { command: '/dashboard', description: 'Open this Telegram Mini App dashboard', permission: 'ADMIN' },
                    { command: '/lustmode [on|off]', description: 'Toggle Roxie lust conversation mode', permission: 'ADMIN' }
                  ])
                    .filter(c => {
                      if (!commandSearch) return true;
                      const s = commandSearch.toLowerCase();
                      return c.command.toLowerCase().includes(s) || c.description.toLowerCase().includes(s);
                    })
                    .map(c => (
                      <div key={c.command} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-cyan-300 font-bold">{c.command}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">{c.permission}</span>
                        </div>
                        <div className="text-slate-400 text-[11px]">{c.description}</div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <h3 className="text-base font-bold text-white">{confirmModal.title}</h3>
            <p className="text-xs text-slate-300">{confirmModal.description}</p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmModal.action();
                  setConfirmModal({ ...confirmModal, isOpen: false });
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Sticker Pack Modal */}
      {showStickerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Add Telegram Sticker Pack</h3>
              <button onClick={() => setShowStickerModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Enter the sticker pack name or link (e.g. <code>https://t.me/addstickers/Animals</code> or <code>Animals</code>):
            </p>
            <input
              type="text"
              placeholder="Pack name or URL"
              value={stickerPackInput}
              onChange={e => setStickerPackInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"
            />
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowStickerModal(false)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAddStickerPack}
                disabled={!stickerPackInput.trim()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Add Pack
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Sticker Pack Modal */}
      {previewPack && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">{previewPack.title || previewPack.name}</h3>
                <span className="text-[11px] text-slate-400 font-mono">{previewPack.stickers?.length || 0} stickers</span>
              </div>
              <button onClick={() => setPreviewPack(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-2 p-1">
              {(previewPack.stickers || []).map((s: any, idx: number) => (
                <div key={idx} className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-center">
                  <span className="text-xl mb-1">{s.emoji || '✨'}</span>
                  <span className="text-[9px] font-mono text-slate-500 truncate w-full">{s.fileId ? s.fileId.slice(-6) : 'sticker'}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setPreviewPack(null)}
              className="w-full py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}

      {/* Add Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{editingSchedule ? 'Edit Scheduled Broadcast' : 'Create Scheduled Broadcast'}</h3>
              <button onClick={() => { setShowScheduleModal(false); setEditingSchedule(null); }} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Schedule Name</label>
                <input
                  type="text"
                  placeholder="e.g. Daily Reminder"
                  value={scheduleForm.name}
                  onChange={e => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Message Text</label>
                <textarea
                  rows={3}
                  placeholder="Broadcast message..."
                  value={scheduleForm.message}
                  onChange={e => setScheduleForm({ ...scheduleForm, message: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Schedule Type</label>
                  <select
                    value={scheduleForm.scheduleType}
                    onChange={e => setScheduleForm({ ...scheduleForm, scheduleType: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                  >
                    <option value="interval">Recurring Interval</option>
                    <option value="daily">Daily at Time</option>
                    <option value="weekly">Weekly</option>
                    <option value="one_time">One Time</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Interval (e.g. 1h, 30m)</label>
                  <input
                    type="text"
                    value={scheduleForm.intervalStr}
                    onChange={e => setScheduleForm({ ...scheduleForm, intervalStr: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Date</label>
                  <input
                    type="date"
                    value={scheduleForm.nextRunDate}
                    onChange={e => setScheduleForm({ ...scheduleForm, nextRunDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Time</label>
                  <input
                    type="time"
                    value={scheduleForm.nextRunTime}
                    onChange={e => setScheduleForm({ ...scheduleForm, nextRunTime: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleForm.pinAfterSend}
                    onChange={e => setScheduleForm({ ...scheduleForm, pinAfterSend: e.target.checked })}
                    className="w-4 h-4 accent-cyan-500 rounded"
                  />
                  <span className="text-slate-300">Pin after sending</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleForm.replyToLatest}
                    onChange={e => setScheduleForm({ ...scheduleForm, replyToLatest: e.target.checked })}
                    className="w-4 h-4 accent-cyan-500 rounded"
                  />
                  <span className="text-slate-300">Reply to latest</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => { setShowScheduleModal(false); setEditingSchedule(null); }}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSchedule}
                disabled={scheduleSaving}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {scheduleSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                {scheduleSaving ? 'Saving...' : editingSchedule ? 'Save Changes' : 'Create Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Schedule From ID Modal */}
      {showCopyScheduleFromIdModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Copy className="w-4 h-4 text-cyan-400" /> Copy Schedule From ID
              </h3>
              <button
                onClick={() => {
                  setShowCopyScheduleFromIdModal(false);
                  setCopyScheduleFromIdInput('');
                  setCopyScheduleFromIdError(null);
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Enter an existing schedule ID to duplicate its configuration as a draft. The original schedule remains untouched, and a new ID will be created when saved.
            </p>

            <div>
              <label className="text-slate-300 text-xs block mb-1 font-semibold">Schedule ID</label>
              <input
                type="text"
                placeholder="e.g. A76935"
                value={copyScheduleFromIdInput}
                onChange={e => {
                  setCopyScheduleFromIdInput(e.target.value);
                  if (copyScheduleFromIdError) setCopyScheduleFromIdError(null);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono text-xs uppercase"
              />
              {copyScheduleFromIdError && (
                <p className="text-rose-400 text-[11px] mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {copyScheduleFromIdError}
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => {
                  setShowCopyScheduleFromIdModal(false);
                  setCopyScheduleFromIdInput('');
                  setCopyScheduleFromIdError(null);
                }}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCopyScheduleFromIdSubmit}
                disabled={!copyScheduleFromIdInput.trim()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" /> Duplicate to Draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Post From ID Modal */}
      {showLoadPostFromIdModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Copy className="w-4 h-4 text-cyan-400" /> Load Saved Post From ID
              </h3>
              <button
                onClick={() => {
                  setShowLoadPostFromIdModal(false);
                  setLoadPostFromIdInput('');
                  setLoadPostFromIdError(null);
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Enter a saved post ID (e.g. <code>POST-XXXXX</code>) to load its content, buttons, and settings directly into the composer.
            </p>

            <div>
              <label className="text-slate-300 text-xs block mb-1 font-semibold">Post ID</label>
              <input
                type="text"
                placeholder="e.g. POST-12345"
                value={loadPostFromIdInput}
                onChange={e => {
                  setLoadPostFromIdInput(e.target.value);
                  if (loadPostFromIdError) setLoadPostFromIdError(null);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono text-xs uppercase"
              />
              {loadPostFromIdError && (
                <p className="text-rose-400 text-[11px] mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {loadPostFromIdError}
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => {
                  setShowLoadPostFromIdModal(false);
                  setLoadPostFromIdInput('');
                  setLoadPostFromIdError(null);
                }}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLoadPostFromIdSubmit}
                disabled={!loadPostFromIdInput.trim()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Load into Composer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Schedule Code Modal */}
      {copyScheduleModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Copy className="w-4 h-4 text-cyan-400" /> Copy Schedule Code
                </h3>
                <p className="text-[11px] text-slate-400 truncate max-w-xs">
                  {copyScheduleModal.schedule.name || copyScheduleModal.schedule.id}
                </p>
              </div>
              <button
                onClick={() => setCopyScheduleModal(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-300 font-semibold">Ready-to-use Command</span>
                  <button
                    onClick={async () => {
                      const ok = await copyTextToClipboard(copyScheduleModal.command);
                      if (ok) {
                        setCopyScheduleModal({ ...copyScheduleModal, copiedField: 'command' });
                        showNotification('Command copied to clipboard!', 'success');
                      } else {
                        showNotification('Clipboard access unavailable. Please select and copy text manually.', 'error');
                      }
                    }}
                    className="text-cyan-400 hover:text-cyan-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {copyScheduleModal.copiedField === 'command' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copyScheduleModal.copiedField === 'command' ? 'Copied!' : 'Copy Command'}
                  </button>
                </div>
                <div
                  onClick={async () => {
                    const ok = await copyTextToClipboard(copyScheduleModal.command);
                    if (ok) {
                      setCopyScheduleModal({ ...copyScheduleModal, copiedField: 'command' });
                      showNotification('Command copied to clipboard!', 'success');
                    }
                  }}
                  className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-cyan-300 break-all select-all cursor-pointer hover:border-cyan-500/50"
                  title="Click to copy"
                >
                  {copyScheduleModal.command}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-300 font-semibold">Reusable JSON Configuration</span>
                  <button
                    onClick={async () => {
                      const ok = await copyTextToClipboard(JSON.stringify(copyScheduleModal.jsonConfig, null, 2));
                      if (ok) {
                        setCopyScheduleModal({ ...copyScheduleModal, copiedField: 'json' });
                        showNotification('JSON config copied to clipboard!', 'success');
                      } else {
                        showNotification('Clipboard access unavailable. Please select and copy text manually.', 'error');
                      }
                    }}
                    className="text-cyan-400 hover:text-cyan-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    {copyScheduleModal.copiedField === 'json' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copyScheduleModal.copiedField === 'json' ? 'Copied!' : 'Copy JSON'}
                  </button>
                </div>
                <pre
                  onClick={async () => {
                    const ok = await copyTextToClipboard(JSON.stringify(copyScheduleModal.jsonConfig, null, 2));
                    if (ok) {
                      setCopyScheduleModal({ ...copyScheduleModal, copiedField: 'json' });
                      showNotification('JSON config copied to clipboard!', 'success');
                    }
                  }}
                  className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[10px] text-slate-300 max-h-36 overflow-y-auto cursor-pointer hover:border-cyan-500/50"
                  title="Click to copy"
                >
                  {JSON.stringify(copyScheduleModal.jsonConfig, null, 2)}
                </pre>
              </div>

              <div className="p-2.5 bg-cyan-950/40 border border-cyan-800/40 rounded-xl text-[11px] text-cyan-200/90 space-y-1">
                <div className="font-semibold text-cyan-300">ℹ️ Reusability & Format Guidance:</div>
                <ul className="list-disc pl-4 space-y-0.5 text-cyan-300/80 text-[10px]">
                  <li><b>Ready Command:</b> Best for instant chat execution. Note: Bot command syntax cannot represent complex settings like custom inline URL buttons.</li>
                  <li><b>JSON Configuration:</b> Complete canonical representation containing all supported options (buttons, pin, reply, auto-delete). Replace <code>&lt;REPLACE_WITH_DESTINATION_CHAT_ID&gt;</code> before importing.</li>
                  <li><b>Zero Duplicates:</b> Copying code is strictly read-only and never creates, activates, pauses, or modifies any schedules.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setCopyScheduleModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Automation Modal */}
      {showAutomationModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{editingAutomation ? 'Edit Reactive Rule' : 'Add Reactive Rule'}</h3>
              <button onClick={() => { setShowAutomationModal(false); setEditingAutomation(null); }} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Trigger Event</label>
                <select
                  value={autoRuleForm.trigger}
                  onChange={e => setAutoRuleForm({ ...autoRuleForm, trigger: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="spam_detected">Spam Detected</option>
                  <option value="link_detected">Unauthorized Link</option>
                  <option value="flood_detected">Message Flood</option>
                  <option value="abuse_detected">Banned Word</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Action</label>
                <select
                  value={autoRuleForm.action}
                  onChange={e => setAutoRuleForm({ ...autoRuleForm, action: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="delete_message">Delete Message</option>
                  <option value="warn_user">Warn User</option>
                  <option value="mute_user">Mute User</option>
                  <option value="kick_user">Kick User</option>
                  <option value="ban_user">Ban User</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Parameters (Optional)</label>
                <input
                  type="text"
                  placeholder="Optional rule params"
                  value={autoRuleForm.parameters}
                  onChange={e => setAutoRuleForm({ ...autoRuleForm, parameters: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => { setShowAutomationModal(false); setEditingAutomation(null); }}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAutomation}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                {editingAutomation ? 'Save Changes' : 'Add Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Sticker Packs Modal (Feature 3) */}
      {showCopyStickersModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Copy className="w-4 h-4 text-cyan-400" /> Copy Sticker Packs Between Groups
              </h3>
              <button onClick={() => setShowCopyStickersModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Select a source group and the sticker packs you want to copy into this group.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Source Group</label>
                <select
                  value={selectedSourceGroupId}
                  onChange={e => {
                    setSelectedSourceGroupId(e.target.value);
                    setSelectedPacksToCopy([]);
                    setCopyStickerResults(null);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  {stickerSources.map(s => (
                    <option key={s.chatId} value={s.chatId}>
                      {s.chatTitle} ({s.packs.length} packs)
                    </option>
                  ))}
                </select>
              </div>

              {/* Pack list */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-400 font-semibold">Configured Packs</label>
                  {(() => {
                    const src = stickerSources.find(s => String(s.chatId) === String(selectedSourceGroupId));
                    if (!src || src.packs.length === 0) return null;
                    const allSelected = selectedPacksToCopy.length === src.packs.length;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          if (allSelected) {
                            setSelectedPacksToCopy([]);
                          } else {
                            setSelectedPacksToCopy(src.packs.map((p: any) => p.name));
                          }
                        }}
                        className="text-[11px] text-cyan-400 hover:underline cursor-pointer"
                      >
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    );
                  })()}
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto p-1">
                  {(() => {
                    const src = stickerSources.find(s => String(s.chatId) === String(selectedSourceGroupId));
                    if (!src || src.packs.length === 0) {
                      return <p className="text-slate-500 py-3 text-center">No packs configured in selected group.</p>;
                    }
                    return src.packs.map((p: any) => {
                      const isChecked = selectedPacksToCopy.includes(p.name);
                      return (
                        <label
                          key={p.name}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer hover:border-slate-700"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedPacksToCopy(selectedPacksToCopy.filter(n => n !== p.name));
                                } else {
                                  setSelectedPacksToCopy([...selectedPacksToCopy, p.name]);
                                }
                              }}
                              className="w-4 h-4 accent-cyan-500 rounded"
                            />
                            <div>
                              <div className="font-semibold text-white truncate max-w-[170px]">{p.title || p.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{p.name}</div>
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">{p.count} stickers</span>
                        </label>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Progress and Results */}
              {copyStickerResults && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-white text-[11px]">Copy Results:</div>
                  <div className="space-y-1">
                    {copyStickerResults.map((r, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-slate-300 truncate max-w-[160px]">{r.packName}</span>
                        <span className={`px-1.5 py-0.2 rounded font-bold uppercase text-[9px] ${
                          r.status === 'copied' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          r.status === 'already_exists' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {r.status === 'copied' ? 'Copied' : r.status === 'already_exists' ? 'Exists' : 'Failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowCopyStickersModal(false)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={handleExecuteCopyStickers}
                disabled={isCopyingStickers || selectedPacksToCopy.length === 0}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5"
              >
                {isCopyingStickers ? 'Copying...' : `Copy (${selectedPacksToCopy.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post Library Modal (Feature 1 & 2) */}
      {showPostLibraryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-3.5 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-cyan-400" /> Saved Posts Library
              </h3>
              <button onClick={() => setShowPostLibraryModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                value={postLibrarySearch}
                onChange={e => {
                  setPostLibrarySearch(e.target.value);
                  handleLoadSavedPosts(e.target.value);
                }}
                placeholder="Search saved posts by ID, title, text..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white pl-8"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3" />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 text-xs pr-1">
              {postLibraryLoading ? (
                <div className="text-center py-6 text-slate-500">Loading saved posts...</div>
              ) : savedPostsData.length === 0 ? (
                <div className="text-center py-6 text-slate-500">No saved posts found.</div>
              ) : (
                savedPostsData.map(p => (
                  <div key={p.id} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-white truncate max-w-[180px]">{p.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-cyan-400 font-bold text-[10px]">{p.id}</span>
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[9px] text-slate-300 font-semibold uppercase">{p.contentType}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteSavedPost(p.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                        title="Delete post"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {p.text && (
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed bg-slate-900/50 p-1.5 rounded-lg border border-slate-800/60 font-sans">
                        {p.text}
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800/80">
                      <button
                        onClick={async () => {
                          const ok = await copyTextToClipboard(p.id);
                          if (ok) {
                            showNotification(`Post ID ${p.id} copied!`, 'success');
                          } else {
                            showNotification('Failed to copy ID to clipboard', 'error');
                          }
                        }}
                        className="flex-1 py-1 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-800/60 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                        title="Copy Post ID"
                      >
                        <Copy className="w-3 h-3" /> Copy ID
                      </button>
                      <button
                        onClick={() => handleInsertPostReference(p.id)}
                        className="flex-1 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-lg text-[10px] font-semibold cursor-pointer"
                      >
                        Insert
                      </button>
                      <button
                        onClick={() => handleLoadPostIntoComposer(p)}
                        className="flex-1 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-semibold cursor-pointer"
                      >
                        Load
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowPostLibraryModal(false)}
              className="w-full py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Save Post to Library Modal */}
      {showSavePostModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-indigo-400" /> Save Post to Library
              </h3>
              <button onClick={() => setShowSavePostModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Save your current rich post into the persistent Post Library so it can be reused in broadcasts, schedules, and welcome messages.
            </p>

            <div className="space-y-2 text-xs">
              <label className="text-slate-400 block font-semibold">Post Title / Name</label>
              <input
                type="text"
                placeholder="e.g. Official Community Rules Broadcast"
                value={newPostTitle}
                onChange={e => setNewPostTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowSavePostModal(false)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePostToLibrary}
                disabled={isSavingPostToLib || !newPostTitle.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                {isSavingPostToLib ? 'Saving...' : 'Save Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Assignment Modal (Owner Only) */}
      {showRoleModal && roleModalTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Assign Role ({roleModalTarget.name})</h3>
              <button onClick={() => setShowRoleModal(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <label className="text-slate-400 block mb-1">Authoritative Custom Role</label>
              <select
                value={selectedRoleToAssign}
                onChange={e => setSelectedRoleToAssign(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
              >
                <option value="MODERATOR">🔧 Moderator</option>
                <option value="EXCEPTION_ADMIN">⚡ Exception Admin (Owner Privileges)</option>
                <option value="NONE">Standard Group Admin (None)</option>
              </select>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Exception Admins inherit full access to owner dashboard controls while preserving group safety boundaries.
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowRoleModal(false)}
                className="px-3.5 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignRole}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Save Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TelegramMiniApp;
