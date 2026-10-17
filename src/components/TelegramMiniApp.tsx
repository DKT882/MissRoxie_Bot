import React, { useState, useEffect, useCallback } from 'react';
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
  FileText
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
  const [abuseWords, setAbuseWords] = useState<string[]>([]);
  const [newAbuseWord, setNewAbuseWord] = useState<string>('');
  const [stickersData, setStickersData] = useState<any>(null);
  const [schedulesData, setSchedulesData] = useState<any[]>([]);
  const [rulesText, setRulesText] = useState<string>('');
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [safetyBackups, setSafetyBackups] = useState<any[]>([]);
  const [mentionAllStatus, setMentionAllStatus] = useState<any>(null);
  const [mentionReason, setMentionReason] = useState<string>('');
  const [mentionTemplate, setMentionTemplate] = useState<string>('');

  // Rich Post State
  const [postContent, setPostContent] = useState<string>('');
  const [postPin, setPostPin] = useState<boolean>(false);

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

        // Pick initial active tab: prefer overview if allowed, otherwise first allowed feature
        if (data.allowedFeatures.includes('overview')) {
          setActiveTab('overview');
        } else if (data.allowedFeatures.length > 0) {
          setActiveTab(data.allowedFeatures[0]);
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
      } else if (['general', 'moderation', 'content_protection', 'ai_conversation', 'auto_engine'].includes(tab)) {
        const res = await tmaFetch(`/api/tma/groups/${chatId}/settings`);
        if (res.ok) {
          const d = await res.json();
          setSettings(d);
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
        const res = await tmaFetch(`/api/tma/groups/${chatId}/schedules`);
        if (res.ok) {
          const d = await res.json();
          setSchedulesData(d.schedules || []);
          setRulesText(d.rules || '');
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

  // Handlers for Members
  const handleBanMember = (targetUserId: number, userName: string) => {
    setConfirmModal({
      isOpen: true,
      title: `Ban ${userName}?`,
      description: `Are you sure you want to ban user ${targetUserId} from this group?`,
      action: async () => {
        try {
          const res = await tmaFetch(`/api/tma/groups/${chatId}/members/${targetUserId}/ban`, { method: 'POST' });
          if (res.ok) {
            showNotification(`User ${userName} banned`, 'success');
            loadTabData('members');
          } else {
            showNotification('Failed to ban user', 'error');
          }
        } catch (err: any) {
          showNotification(err.message, 'error');
        }
      }
    });
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
  const handleSendRichPost = async () => {
    if (!chatId || !postContent.trim()) {
      showNotification('Please enter message text to send', 'error');
      return;
    }
    try {
      const res = await tmaFetch(`/api/tma/groups/${chatId}/rich-post/send`, {
        method: 'POST',
        body: JSON.stringify({
          post: {
            text: postContent,
            mode: 'rich'
          },
          pinMessage: postPin
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('Rich post sent to group!', 'success');
        setPostContent('');
      } else {
        showNotification(data.error || 'Failed to send post', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
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

  // Define tab navigation metadata
  const tabMetadata: Record<MiniAppFeature, { label: string; icon: any }> = {
    overview: { label: 'Overview', icon: Layers },
    general: { label: 'General', icon: Sliders },
    moderation: { label: 'Moderation', icon: Shield },
    content_protection: { label: 'Protection', icon: Lock },
    rich_post: { label: 'Rich Post', icon: Send },
    mention_all: { label: 'Mention All', icon: Radio },
    lust_mode: { label: 'Lust Mode', icon: Flame },
    stickers: { label: 'Stickers', icon: Sparkles },
    auto_engine: { label: 'Auto Engine', icon: Zap },
    moderators: { label: 'Moderators', icon: Users },
    commands: { label: 'Commands', icon: ListChecks },
    ai_conversation: { label: 'AI Chat', icon: Bot },
    slowmode: { label: 'Slowmode', icon: Clock },
    abuse_words: { label: 'Abuse Words', icon: Ban },
    members: { label: 'Members', icon: Users },
    permissions: { label: 'Permissions', icon: Lock },
    schedules: { label: 'Schedules', icon: Clock },
    activity: { label: 'Activity', icon: Database },
    backup: { label: 'Backup', icon: Download },
    welcome_goodbye: { label: 'Welcome', icon: FileText }
  };

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

        <div className="text-xs text-slate-500 bg-slate-900/40 border border-slate-800 rounded-xl p-3 max-w-xs text-left w-full">
          <strong className="text-slate-400">Troubleshooting:</strong>
          <ul className="list-disc pl-4 mt-1 space-y-1 text-slate-500 text-[11px]">
            <li>Ensure you are an active Administrator or Owner in this group.</li>
            <li>Launch the app using the <code>/dashboard</code> command inside the group.</li>
            <li>Telegram authentication expires after 24 hours. Reopen from Telegram.</li>
          </ul>
        </div>
      </div>
    );
  }

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
              {user?.first_name || user?.username ? `@${user?.username}` : `User ${user?.id}`}
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

        {/* 2. Scrollable Feature Navigation (Filtered by Allowed Features) */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {allowedFeatures.map(feat => {
            const meta = tabMetadata[feat];
            if (!meta) return null;
            const Icon = meta.icon;
            const isActive = activeTab === feat;

            return (
              <button
                key={feat}
                onClick={() => setActiveTab(feat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors flex-shrink-0 ${
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
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-slate-800/80">
                      <span>Anti-Flood</span>
                      <span className={overviewData.settings?.floodEnabled ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {overviewData.settings?.floodEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-slate-800/80">
                      <span>Anti-Raid</span>
                      <span className={overviewData.settings?.raidEnabled ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {overviewData.settings?.raidEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-slate-800/80">
                      <span>CAPTCHA</span>
                      <span className={overviewData.settings?.captchaEnabled ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {overviewData.settings?.captchaEnabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/40 border border-slate-800/80">
                      <span>Lust Mode</span>
                      <span className={overviewData.settings?.lustMode ? 'text-pink-400 font-bold' : 'text-slate-500'}>
                        {overviewData.settings?.lustMode ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: GENERAL SETTINGS */}
            {activeTab === 'general' && settings && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Sliders className="w-4 h-4 text-cyan-400" /> General Moderation Settings
                </h3>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Warning Limit Before Action</label>
                    <select
                      value={settings.warnLimit || 3}
                      onChange={e => handleUpdateSettings({ warnLimit: Number(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                    >
                      <option value={1}>1 Warning</option>
                      <option value={3}>3 Warnings (Standard)</option>
                      <option value={5}>5 Warnings</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Action on Warning Limit</label>
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

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">Join CAPTCHA</div>
                      <div className="text-slate-500 text-[11px]">Require new members to click button</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.captchaEnabled)}
                      onChange={e => handleUpdateSettings({ captchaEnabled: e.target.checked })}
                      className="w-5 h-5 accent-cyan-500 rounded"
                    />
                  </div>
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
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">Block Unauthorized Links</div>
                      <div className="text-slate-500 text-[11px]">Delete links not on group whitelist</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.linksProtection)}
                      onChange={e => handleUpdateSettings({ linksProtection: e.target.checked })}
                      className="w-5 h-5 accent-cyan-500 rounded"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">Promotional Link Spam Defense</div>
                      <div className="text-slate-500 text-[11px]">Detects and purges automated broadcast bots</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.promotionalSpamProtection ?? true)}
                      onChange={e => handleUpdateSettings({ promotionalSpamProtection: e.target.checked })}
                      className="w-5 h-5 accent-cyan-500 rounded"
                    />
                  </div>

                  <div className="flex items-center justify-between">
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
                  <div>
                    <label className="text-slate-400 block mb-1">Message Content (Markdown supported)</label>
                    <textarea
                      rows={5}
                      value={postContent}
                      onChange={e => setPostContent(e.target.value)}
                      placeholder="Write your announcement or formatted message here..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-white">Pin message after delivery</span>
                    <input
                      type="checkbox"
                      checked={postPin}
                      onChange={e => setPostPin(e.target.checked)}
                      className="w-4 h-4 accent-cyan-500 rounded"
                    />
                  </div>

                  <button
                    onClick={handleSendRichPost}
                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition"
                  >
                    <Send className="w-4 h-4" /> Send Post
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
                  {mentionAllStatus?.active && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Broadcasting ({mentionAllStatus.progress || '0%'})
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

                  {mentionAllStatus?.active ? (
                    <button
                      onClick={handleStopMentionAll}
                      className="w-full bg-red-500 hover:bg-red-400 text-white font-bold py-2.5 rounded-xl transition"
                    >
                      Stop Current Broadcast
                    </button>
                  ) : (
                    <button
                      onClick={handleStartMentionAll}
                      className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
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
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Intensity Level</span>
                      <span className="font-bold text-pink-400">{settings.lustLevel ?? 1} / 4</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={4}
                      value={settings.lustLevel ?? 1}
                      onChange={e => handleUpdateSettings({ lustLevel: Number(e.target.value) })}
                      className="w-full accent-pink-500"
                    />
                  </div>

                  <button
                    onClick={() => {
                      setConfirmModal({
                        isOpen: true,
                        title: 'Reset Lust Memory?',
                        description: 'This will reset conversation intimacy memory for this group.',
                        action: async () => {
                          const res = await tmaFetch(`/api/tma/groups/${chatId}/lust/reset-group`, { method: 'POST' });
                          if (res.ok) showNotification('Lust memory reset', 'success');
                        }
                      });
                    }}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-xl text-xs transition"
                  >
                    Reset Group Memory
                  </button>
                </div>
              </div>
            )}

            {/* TAB: ABUSE WORDS (Owner & Exception Admin) */}
            {activeTab === 'abuse_words' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-red-400 flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Ban className="w-4 h-4" /> Custom Banned Words ({abuseWords.length})
                </h3>

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
                    className="bg-red-500 hover:bg-red-400 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1"
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
                        <button onClick={() => handleRemoveAbuseWord(w)} className="text-red-400 hover:text-white">
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
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-white">{mod.name}</div>
                        <div className="text-slate-500">{mod.username ? `@${mod.username}` : `ID: ${mod.userId}`}</div>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-cyan-300 border border-slate-700">
                        {mod.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: SLOWMODE (Owner & Exception Admin) */}
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
                        className={`p-2.5 rounded-xl border text-xs font-medium transition ${
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

            {/* TAB: AI CONVERSATION (Owner & Exception Admin) */}
            {activeTab === 'ai_conversation' && settings && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Bot className="w-4 h-4" /> Roxie AI Conversation & Persona
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">Enable AI Chatbot</div>
                      <div className="text-slate-500 text-[11px]">Roxie replies when mentioned or replied to</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(settings.chatbotEnabled ?? true)}
                      onChange={e => handleUpdateSettings({ chatbotEnabled: e.target.checked })}
                      className="w-5 h-5 accent-purple-500 rounded"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Personality Mode</label>
                    <select
                      value={settings.chatbotMode || 'auto'}
                      onChange={e => handleUpdateSettings({ chatbotMode: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                    >
                      <option value="auto">Auto Adaptive</option>
                      <option value="friendly">Friendly & Warm</option>
                      <option value="playful">Playful & Teasing</option>
                      <option value="sarcastic">Sarcastic & Witty</option>
                      <option value="flirty">Flirty & Charming</option>
                      <option value="serious">Serious & Professional</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: BACKUP & RESTORE (Owner & Exception Admin) */}
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
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-center flex flex-col items-center justify-center gap-1.5 transition text-slate-200"
                  >
                    <Download className="w-5 h-5 text-cyan-400" />
                    <span className="font-semibold">Export JSON</span>
                  </a>
                  <a
                    href={`/api/tma/groups/${chatId}/backup/export-csv?token=${token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-center flex flex-col items-center justify-center gap-1.5 transition text-slate-200"
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
                        <span className="font-mono text-slate-300">{snap.filename}</span>
                        <button
                          onClick={async () => {
                            const res = await tmaFetch(`/api/tma/groups/${chatId}/backup/restore-history`, {
                              method: 'POST',
                              body: JSON.stringify({ filename: snap.filename })
                            });
                            if (res.ok) showNotification('Snapshot restored', 'success');
                          }}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-[11px]"
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
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                  <ListChecks className="w-4 h-4 text-cyan-400" /> Bot Commands Reference
                </h3>
                <div className="space-y-2 text-xs">
                  {[
                    { cmd: '/help', desc: 'Display bot command catalog and instructions' },
                    { cmd: '/status', desc: 'Display group security & health summary' },
                    { cmd: '/ban [user]', desc: 'Permanently ban a member from the group' },
                    { cmd: '/mute [user]', desc: 'Mute member from speaking' },
                    { cmd: '/warn [user]', desc: 'Issue formal warning to member' },
                    { cmd: '/all [message]', desc: 'Broadcast @all mention to members' },
                    { cmd: '/dashboard', desc: 'Open this Telegram Mini App dashboard' },
                    { cmd: '/lustmode [on|off]', desc: 'Toggle Roxie lust conversation mode' }
                  ].map(c => (
                    <div key={c.cmd} className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div className="font-mono text-cyan-300 font-bold">{c.cmd}</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">{c.desc}</div>
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
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmModal.action();
                  setConfirmModal({ ...confirmModal, isOpen: false });
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TelegramMiniApp;
