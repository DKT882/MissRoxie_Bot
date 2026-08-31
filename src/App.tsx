import React, { useState, useEffect, useMemo } from 'react';
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
  ExternalLink
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
  const [groupDetailTab, setGroupDetailTab] = useState<'overview' | 'messages' | 'moderators' | 'stickers' | 'settings' | 'permissions' | 'commands' | 'activity'>('overview');

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

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
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

  // Primary Data Fetcher
  const fetchData = async () => {
    try {
      const [overviewRes, groupsRes, cmdsRes, statusRes, healthRes, dmsRes, stickersRes] = await Promise.all([
        fetch('/api/dashboard/overview'),
        fetch('/api/dashboard/groups'),
        fetch('/api/commands'),
        fetch('/api/telegram/status'),
        fetch('/api/health'),
        fetch('/api/dashboard/private-chats'),
        fetch('/api/dashboard/stickers')
      ]);

      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (groupsRes.ok) setGroups(await groupsRes.json());
      if (cmdsRes.ok) setCommands(await cmdsRes.json());
      if (statusRes.ok) setTelegramStatus(await statusRes.json());
      if (healthRes.ok) setHealthData(await healthRes.json());
      if (dmsRes.ok) setPrivateChats(await dmsRes.json());
      if (stickersRes.ok) setGlobalStickersData(await stickersRes.json());

      // Fetch group details if a group is open or selected
      const targetDetailId = activeGroupDetailId || (selectedChatId !== 'all' ? selectedChatId : null);
      if (targetDetailId) {
        const [detailRes, modsRes, permsRes, groupStickersRes] = await Promise.all([
          fetch(`/api/dashboard/groups/${targetDetailId}`),
          fetch(`/api/dashboard/groups/${targetDetailId}/moderators`),
          fetch(`/api/dashboard/groups/${targetDetailId}/permissions`),
          fetch(`/api/dashboard/groups/${targetDetailId}/stickers`)
        ]);
        if (detailRes.ok) setGroupDetails(await detailRes.json());
        if (modsRes.ok) setGroupModerators(await modsRes.json());
        if (permsRes.ok) setGroupPermissionsData(await permsRes.json());
        if (groupStickersRes.ok) setGroupStickersData(await groupStickersRes.json());
      } else {
        setGroupDetails(null);
        setGroupModerators(null);
        setGroupPermissionsData(null);
        setGroupStickersData(null);
      }

      // Fetch active private chat conversation
      if (activePrivateChatId) {
        const pRes = await fetch(`/api/dashboard/private-chats/${activePrivateChatId}/messages`);
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
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
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
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setLeavingGroup(false);
    }
  };

  // Send Message Execution
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendTargetId || !sendMessageContent.trim()) return;
    setSendingMessage(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/dashboard/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: sendTargetType,
          targetId: sendTargetId,
          message: sendMessageContent.trim()
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

  // Send Private Reply
  const handleSendPrivateReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePrivateChatId || !privateReplyText.trim()) return;
    setSendingPrivateReply(true);
    try {
      const res = await fetch('/api/dashboard/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'private',
          targetId: activePrivateChatId,
          message: privateReplyText.trim()
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

  // Broadcast Execution
  const handleBroadcast = async () => {
    if (broadcastSelectedGroups.length === 0 || !broadcastContent.trim()) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    setShowBroadcastConfirm(false);
    try {
      const res = await fetch('/api/dashboard/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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

  // Update Group Setting Helper
  const updateSetting = async (key: string, value: any) => {
    if (!activeGroupDetailId) return;
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(`⚠️ Setting update failed: ${data.error || 'Validation error'}`);
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const botInfo = overview?.botStatus?.botInfo;
  const isPolling = overview?.botStatus?.isPolling;
  const stats = overview?.stats || { totalBans: 0, totalKicks: 0, totalWarns: 0, totalReports: 0, activeSchedules: 0 };

  // Filter logs based on search & group selection
  const rawLogs = selectedChatId === 'all' 
    ? overview?.recentLogs || [] 
    : groupDetails?.logs || [];

  const filteredLogs = rawLogs.filter((l: ModerationLog) => {
    const matchesSearch = searchQuery === '' || 
      l.action?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.targetUsername?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.adminUsername?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.details?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.chatTitle?.toLowerCase().includes(searchQuery.toLowerCase());

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

              {/* ACTIONS Category */}
              <div className="space-y-1">
                <div className={`px-3 text-[10px] font-bold uppercase tracking-wider ${themeMutedText}`}>Actions</div>
                {[
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
                          <span className={`w-2 h-2 rounded-full ${g.botLeft ? 'bg-stone-500' : 'bg-emerald-500'}`} />
                          <h4 className="text-xs font-bold">{g.chatTitle}</h4>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                            g.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500' :
                            g.status === 'Bot Left' ? 'bg-stone-500/10 text-stone-400' : 'bg-amber-500/10 text-amber-500'
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
                      <button
                        onClick={() => { setLeaveModalGroup(g); setLeaveConfirmInput(''); }}
                        className="px-3 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/20 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
                        title="Leave Group"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Leave
                      </button>
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
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-lg font-bold">{groupDetails.chatTitle}</h2>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        groupDetails.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                        groupDetails.status === 'Bot Left' ? 'bg-stone-500/10 text-stone-400 border border-stone-500/20' :
                        'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                      }`}>
                        {groupDetails.status}
                      </span>
                    </div>
                    <p className={`text-xs ${themeMutedText} font-mono mt-0.5`}>
                      Chat ID: {groupDetails.chatId} • Authority: {groupDetails.botRole || '🛡️ Administrator'}
                    </p>
                  </div>
                </div>

                {/* Inner Tabs Navigation */}
                <div className={`flex items-center gap-1.5 ${themeInnerCardBg} p-1.5 rounded-xl border ${themeBorder} flex-wrap text-xs font-semibold`}>
                  {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'messages', label: `Messages (${groupDetails.storedMessages?.length || 0})` },
                    { id: 'moderators', label: 'Moderators' },
                    { id: 'stickers', label: `Stickers (${groupStickersData?.packs?.length || 0})` },
                    { id: 'settings', label: 'Settings' },
                    { id: 'permissions', label: 'Permissions' },
                    { id: 'commands', label: 'Commands' },
                    { id: 'activity', label: 'Activity' }
                  ].map((tab: any) => (
                    <button
                      key={tab.id}
                      onClick={() => setGroupDetailTab(tab.id)}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${
                        groupDetailTab === tab.id
                          ? 'bg-blue-600 text-white shadow-sm'
                          : `${themeMutedText} hover:opacity-80`
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
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" /> Stored Group Messages ({groupDetails.storedMessages?.length || 0})
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>Real messages received & recorded in group memory by Roxie.</p>
                  </div>

                  <div className="space-y-3">
                    {(groupDetails.storedMessages || []).map((msg: any, idx: number) => (
                      <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-start gap-3`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          msg.role === 'assistant' ? 'bg-blue-600 text-white' : 'bg-purple-600/20 text-purple-400'
                        }`}>
                          {msg.role === 'assistant' ? 'R' : (msg.name?.slice(0, 1) || 'U')}
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">{msg.name || (msg.role === 'assistant' ? 'Roxie' : 'User')}</span>
                            <span className={`text-[10px] font-mono ${themeMutedText}`}>
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-xs">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    {(!groupDetails.storedMessages || groupDetails.storedMessages.length === 0) && (
                      <p className={`text-xs ${themeMutedText} text-center py-8`}>No messages stored for this group yet.</p>
                    )}
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

              {/* INNER TAB: GROUP SETTINGS */}
              {groupDetailTab === 'settings' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <Settings className="w-4 h-4 text-blue-500" /> Group Settings & Automation Controls
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Configure Auto-Response, Auto-Sticker frequencies, and Content Protections.</p>
                    </div>
                    {savingSettings && <span className="text-xs text-blue-500 animate-pulse font-semibold">Saving changes...</span>}
                  </div>

                  {/* 🤖 AUTO RESPONSE SECTION */}
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-5 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-blue-500 flex items-center gap-1.5">
                          <Bot className="w-4 h-4" /> Auto Response Frequency
                        </h4>
                        <p className={`text-[11px] ${themeMutedText}`}>
                          Control how frequently Roxie may automatically respond with conversational AI text in this group.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                            groupDetails.autoResponseNextAvailableSeconds > 0 
                              ? 'bg-amber-500/10 text-amber-500' 
                              : 'bg-emerald-500/10 text-emerald-500'
                          }`}>
                            {groupDetails.autoResponseNextAvailableSeconds > 0 
                              ? `⏳ Cooldown: ~${groupDetails.autoResponseNextAvailableSeconds}s` 
                              : '🟢 Ready'}
                          </span>
                          {curAutoResponse.mode === 'random' && (
                            <span className={`text-[9px] font-mono ${themeMutedText} mt-0.5`}>
                              🎲 Range: {curAutoResponse.minSeconds || 30}s – {curAutoResponse.maxSeconds || 120}s
                            </span>
                          )}
                        </div>
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(curAutoResponse.enabled)}
                            onChange={(e) => updateSetting('autoResponse', { ...curAutoResponse, enabled: e.target.checked })}
                            className="w-4 h-4 rounded text-blue-600"
                          />
                          <span className="text-xs font-semibold ml-2">{curAutoResponse.enabled ? 'ON' : 'OFF'}</span>
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
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
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>
                          Cooldown (seconds)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="10"
                            max="86400"
                            value={curAutoResponse.cooldownSeconds || 30}
                            onChange={(e) => updateSetting('autoResponse', { ...curAutoResponse, cooldownSeconds: Number(e.target.value) })}
                            className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-mono`}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>
                          Random Interval Range
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            placeholder="Min"
                            min="10"
                            max="86400"
                            value={curAutoResponse.minSeconds || 30}
                            onChange={(e) => updateSetting('autoResponse', { ...curAutoResponse, minSeconds: Number(e.target.value) })}
                            className={`w-1/2 ${themeCardBg} border ${themeBorder} rounded-xl px-2.5 py-2 text-xs font-mono`}
                          />
                          <span className="text-xs text-stone-400">-</span>
                          <input
                            type="number"
                            placeholder="Max"
                            min="10"
                            max="86400"
                            value={curAutoResponse.maxSeconds || 120}
                            onChange={(e) => updateSetting('autoResponse', { ...curAutoResponse, maxSeconds: Number(e.target.value) })}
                            className={`w-1/2 ${themeCardBg} border ${themeBorder} rounded-xl px-2.5 py-2 text-xs font-mono`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 🎨 AUTO STICKER SECTION */}
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-5 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                          <Smile className="w-4 h-4" /> Auto Sticker Frequency (Independent)
                        </h4>
                        <p className={`text-[11px] ${themeMutedText}`}>
                          Control how frequently Roxie may automatically append or send stickers in this group without spamming.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                            groupDetails.autoStickerNextAvailableSeconds > 0 
                              ? 'bg-amber-500/10 text-amber-500' 
                              : 'bg-emerald-500/10 text-emerald-500'
                          }`}>
                            {groupDetails.autoStickerNextAvailableSeconds > 0 
                              ? `⏳ Cooldown: ~${groupDetails.autoStickerNextAvailableSeconds}s` 
                              : '🟢 Ready'}
                          </span>
                          {curAutoSticker.mode === 'random' && (
                            <span className={`text-[9px] font-mono ${themeMutedText} mt-0.5`}>
                              🎲 Range: {curAutoSticker.minSeconds || 60}s – {curAutoSticker.maxSeconds || 300}s
                            </span>
                          )}
                        </div>
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(curAutoSticker.enabled)}
                            onChange={(e) => updateSetting('autoSticker', { ...curAutoSticker, enabled: e.target.checked })}
                            className="w-4 h-4 rounded text-amber-600"
                          />
                          <span className="text-xs font-semibold ml-2">{curAutoSticker.enabled ? 'ON' : 'OFF'}</span>
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Sticker Mode</label>
                        <select
                          value={curAutoSticker.mode || 'cooldown'}
                          onChange={(e) => updateSetting('autoSticker', { ...curAutoSticker, mode: e.target.value })}
                          className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                        >
                          <option value="every_message">Every Eligible Message</option>
                          <option value="cooldown">Cooldown Interval</option>
                          <option value="random">Randomized Interval</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>
                          Sticker Cooldown (seconds)
                        </label>
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
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>
                          Random Sticker Interval Range
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            placeholder="Min"
                            min="10"
                            max="86400"
                            value={curAutoSticker.minSeconds || 60}
                            onChange={(e) => updateSetting('autoSticker', { ...curAutoSticker, minSeconds: Number(e.target.value) })}
                            className={`w-1/2 ${themeCardBg} border ${themeBorder} rounded-xl px-2.5 py-2 text-xs font-mono`}
                          />
                          <span className="text-xs text-stone-400">-</span>
                          <input
                            type="number"
                            placeholder="Max"
                            min="10"
                            max="86400"
                            value={curAutoSticker.maxSeconds || 300}
                            onChange={(e) => updateSetting('autoSticker', { ...curAutoSticker, maxSeconds: Number(e.target.value) })}
                            className={`w-1/2 ${themeCardBg} border ${themeBorder} rounded-xl px-2.5 py-2 text-xs font-mono`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Content Protection Section */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-500">Content Protection</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { key: 'linksProtection', label: '🔗 Links Protection' },
                        { key: 'stickerProtection', label: '🎨 Sticker Protection' },
                        { key: 'fileProtection', label: '📁 File Protection' },
                        { key: 'imageProtection', label: '🖼️ Image Protection' },
                        { key: 'gifProtection', label: '🎬 GIF Protection' },
                        { key: 'stopSpamEnabled', label: '🛑 Stop Spam' },
                        { key: 'floodEnabled', label: '🌊 Anti-Flood' },
                        { key: 'stopAbusiveEnabled', label: '🤬 Abuse Filter' },
                        { key: 'stopPromotionEnabled', label: '📢 Promo Filter' },
                      ].map((s) => {
                        const isChecked = Boolean(groupDetails.settings?.[s.key]);
                        return (
                          <label key={s.key} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex items-center justify-between cursor-pointer`}>
                            <span className="text-xs font-medium">{s.label}</span>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => updateSetting(s.key, e.target.checked)}
                              className="w-4 h-4 rounded text-blue-600"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* AI & Personality Section */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-purple-500">AI & Personality</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between cursor-pointer`}>
                        <div>
                          <span className="text-xs font-bold block">AI Chatbot</span>
                          <span className={`text-[11px] ${themeMutedText}`}>Roxie converses casually with group members</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(groupDetails.settings?.chatbotEnabled)}
                          onChange={(e) => updateSetting('chatbotEnabled', e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600"
                        />
                      </label>

                      <label className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between cursor-pointer`}>
                        <div>
                          <span className="text-xs font-bold block text-pink-500">❤️ Lust Mode</span>
                          <span className={`text-[11px] ${themeMutedText}`}>Flirty, affectionate adult personality</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(groupDetails.settings?.lustMode)}
                          onChange={(e) => updateSetting('lustMode', e.target.checked)}
                          className="w-4 h-4 rounded text-pink-600"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP PERMISSIONS */}
              {groupDetailTab === 'permissions' && (
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
                              <p className="whitespace-pre-wrap">{m.content}</p>
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
                  <ListChecks className="w-4 h-4 text-blue-500" /> Command Registry ({commands.length} Commands)
                </h3>
                <p className={`text-xs ${themeMutedText}`}>Live registered Telegram commands and syntax.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {commands.map((cmd, idx) => (
                  <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-2`}>
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 bg-blue-500/10 text-blue-500 font-mono text-xs font-bold rounded-lg border border-blue-500/20">
                        {cmd.command}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                        cmd.permission === 'Owner' ? 'bg-red-500/20 text-red-500' :
                        cmd.permission === 'Admin' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'
                      }`}>
                        {cmd.permission}
                      </span>
                    </div>
                    <p className="text-xs">{cmd.description}</p>
                    <div className={`${themeCardBg} rounded-lg p-2.5 text-[11px] font-mono space-y-0.5 ${themeMutedText}`}>
                      <div><strong>Syntax:</strong> {cmd.syntax}</div>
                      <div><strong>Example:</strong> {cmd.example}</div>
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
                  { name: 'Storage / DB', status: healthData?.components?.storage?.connected ? 'Connected' : 'Connected', ok: true }
                ].map((comp, idx) => (
                  <div key={idx} className={`${themeCardBg} border rounded-2xl p-4 space-y-2`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${themeMutedText}`}>{comp.name}</span>
                      <span className={`w-2 h-2 rounded-full ${comp.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    </div>
                    <div className="text-sm font-bold">{comp.status}</div>
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
              All automated moderation, AI conversation, and protections will cease immediately for this group.
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

    </div>
  );
}
