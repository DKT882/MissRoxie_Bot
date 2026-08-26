import React, { useState, useEffect } from 'react';
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
  Link as LinkIcon, 
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
  X
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

interface BotInfo {
  id: number;
  username: string;
  firstName: string;
  canJoinGroups?: boolean;
  canReadGroupMessages?: boolean;
}

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

export default function App() {
  const [activeNav, setActiveNav] = useState<string>('overview');
  const [selectedChatId, setSelectedChatId] = useState<number | 'all'>('all');
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [groupDetails, setGroupDetails] = useState<any | null>(null);
  const [overview, setOverview] = useState<any | null>(null);
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('24h');
  const [logFilterType, setLogFilterType] = useState<string>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<ModerationLog | null>(null);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<any | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<string>('Welcome {mention} to {chat_title}! 👋 Your ID is {id}.');
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

  const fetchData = async () => {
    try {
      const [overviewRes, groupsRes, cmdsRes, statusRes] = await Promise.all([
        fetch('/api/dashboard/overview'),
        fetch('/api/groups'),
        fetch('/api/commands'),
        fetch('/api/telegram/status')
      ]);

      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (groupsRes.ok) setGroups(await groupsRes.json());
      if (cmdsRes.ok) setCommands(await cmdsRes.json());
      if (statusRes.ok) setTelegramStatus(await statusRes.json());

      if (selectedChatId !== 'all') {
        const detailRes = await fetch(`/api/groups/${selectedChatId}`);
        if (detailRes.ok) setGroupDetails(await detailRes.json());
      } else {
        setGroupDetails(null);
      }
    } catch (err) {
      console.warn('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [selectedChatId]);

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

  const exportData = (format: 'json' | 'csv') => {
    const logs = selectedChatId === 'all' 
      ? overview?.recentLogs || [] 
      : groupDetails?.logs || [];

    if (format === 'json') {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
      const dlAnchor = document.createElement('a');
      dlAnchor.setAttribute("href", dataStr);
      dlAnchor.setAttribute("download", `roxie_audit_logs_${selectedChatId}.json`);
      dlAnchor.click();
    } else {
      let csv = "ID,Timestamp,Group,Action,Actor,Target,Reason\n";
      logs.forEach((l: any) => {
        csv += `"${l.id}","${l.timestamp}","${l.chatTitle || l.chatId}","${l.action}","${l.adminUsername || l.adminUserId || ''}","${l.targetUsername || l.targetUserId || ''}","${(l.reason || '').replace(/"/g, '""')}"\n`;
      });
      const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      const dlAnchor = document.createElement('a');
      dlAnchor.setAttribute("href", dataStr);
      dlAnchor.setAttribute("download", `roxie_audit_logs_${selectedChatId}.csv`);
      dlAnchor.click();
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
      l.chatTitle?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = logFilterType === 'ALL' || l.action?.toLowerCase() === logFilterType.toLowerCase();
    return matchesSearch && matchesType;
  });

  return (
    <div className="h-screen overflow-hidden bg-stone-900 text-stone-100 flex flex-col font-sans">
      
      {/* Top Banner / Global Header */}
      <header className="bg-stone-950 border-b border-stone-800 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              ROXIE GROUP MODERATION CONSOLE
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-normal">v4.5 Pro</span>
            </h1>
            <p className="text-xs text-stone-400">Advanced Telegram Security, Policy Engine & Multi-Group Control Center</p>
          </div>
        </div>

        {/* Status Indicators & Test Button */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 bg-stone-900 px-3 py-1.5 rounded-lg border border-stone-800 text-xs">
            <span className={`w-2.5 h-2.5 rounded-full ${isPolling ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-stone-300 font-medium">
              {isPolling ? '🟢 Telegram Connected & Polling' : '🟡 Polling Inactive / Token Required'}
            </span>
          </div>

          <button
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
            {testingConnection ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-73px)] overflow-hidden">
        
        {/* Sidebar Navigation - Fixed, non-scrolling */}
        <aside className="w-full lg:w-72 bg-stone-950 border-r border-stone-800 p-4 space-y-6 flex flex-col justify-between h-full overflow-hidden shrink-0">
          <div className="space-y-6">
            
            {/* Group Selector */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Group Scope Selector
              </label>
              <select
                value={selectedChatId}
                onChange={(e) => setSelectedChatId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-200 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="all">🟢 [ All Groups ] ({groups.length} Connected)</option>
                {groups.map((g) => (
                  <option key={g.chatId} value={g.chatId}>
                    🟢 {g.chatTitle} ({g.chatId})
                  </option>
                ))}
              </select>
            </div>

            {/* Navigation Menu */}
            <nav className="space-y-1 overflow-y-auto max-h-[calc(100vh-250px)] pr-1">
              {[
                { id: 'overview', label: 'Overview', icon: Activity },
                { id: 'live', label: 'Live Activity', icon: Terminal },
                { id: 'live-verify', label: 'Live Telegram Verification', icon: ShieldCheck },
                { id: 'live-checklist', label: 'Live Test Checklist (46)', icon: ListChecks },
                { id: 'variables', label: 'Welcome / Goodbye Vars', icon: Smile },
                { id: 'commands', label: 'Command Center', icon: ListChecks },
                { id: 'bans', label: 'Banned Users', icon: Ban },
                { id: 'kicks', label: 'Kicked Users', icon: UserX },
                { id: 'mutes', label: 'Muted Users', icon: Volume2 },
                { id: 'warnings', label: 'Warning Center', icon: AlertTriangle },
                { id: 'reports', label: 'Report Center', icon: Flag },
                { id: 'filters', label: 'Filter Center', icon: Search },
                { id: 'locks', label: 'Content Locks', icon: Lock },
                { id: 'automations', label: 'Automations', icon: Calendar },
                { id: 'security', label: 'Security & Anti-Raid', icon: Shield },
                { id: 'audit', label: 'Audit Logs', icon: Database },
                { id: 'system', label: 'System Logs', icon: Sliders },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveNav(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                      isActive 
                        ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' 
                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900'
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
            </nav>
          </div>

          {/* Sidebar Footer info */}
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-3 text-[11px] text-stone-400 space-y-1.5 shrink-0">
            <div className="flex justify-between">
              <span>Bot Username:</span>
              <span className="text-stone-200 font-mono">@{botInfo?.username || 'MissRoxie_Bot'}</span>
            </div>
            <div className="flex justify-between">
              <span>Connected Groups:</span>
              <span className="text-stone-200 font-bold">{groups.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Security Engine:</span>
              <span className="text-emerald-400 font-semibold">Active</span>
            </div>
          </div>
        </aside>

        {/* Content Area - Scrollable */}
        <main className="flex-1 p-6 space-y-6 overflow-y-auto h-full">
          
          {/* Global Search & Export Header - Sticky at top */}
          <div className="sticky top-0 z-30 bg-stone-900/95 backdrop-blur-md border border-stone-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search events, users, groups..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-stone-900 border border-stone-800 rounded-xl pl-9 pr-4 py-2 text-xs text-stone-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-300 focus:outline-none"
              >
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="all">All Time</option>
              </select>

              <button
                onClick={() => exportData('json')}
                className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 hover:bg-stone-800 border border-stone-800 rounded-xl text-xs text-stone-300 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export JSON
              </button>
              <button
                onClick={() => exportData('csv')}
                className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 hover:bg-stone-800 border border-stone-800 rounded-xl text-xs text-stone-300 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
          </div>

          {/* ACTIVE TAB: OVERVIEW */}
          {activeNav === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Bans', count: stats.totalBans, icon: Ban, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
                  { label: 'Total Kicks', count: stats.totalKicks, icon: UserX, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                  { label: 'Warnings Issued', count: stats.totalWarns, icon: AlertTriangle, color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
                  { label: 'Security Reports', count: stats.totalReports, icon: Flag, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
                ].map((s, idx) => {
                  const Icon = s.icon;
                  return (
                    <div key={idx} className="bg-stone-950 border border-stone-800 rounded-2xl p-5 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-stone-400 font-medium">{s.label}</p>
                        <h3 className="text-2xl font-bold text-white mt-1">{s.count}</h3>
                      </div>
                      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${s.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Connected Groups Section */}
              <div className="bg-stone-950 border border-stone-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-400" /> Connected Telegram Groups ({groups.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groups.map((g) => (
                    <div key={g.chatId} className="bg-stone-900 border border-stone-800 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          {g.chatTitle}
                        </h4>
                        <p className="text-[11px] text-stone-400 mt-1 font-mono">Chat ID: {g.chatId}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setSelectedChatId(g.chatId); setActiveNav('audit'); }}
                          className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-medium transition-colors"
                        >
                          Inspect Logs
                        </button>
                      </div>
                    </div>
                  ))}
                  {groups.length === 0 && (
                    <p className="text-xs text-stone-500 col-span-2 py-4 text-center">No groups discovered yet. Add Roxie to a Telegram group to begin monitoring.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ACTIVE TAB: LIVE ACTIVITY TERMINAL */}
          {activeNav === 'live' && (
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" /> Terminal-Style Live Activity Console
                </h3>
                <div className="flex items-center gap-2">
                  {['ALL', 'BAN', 'KICK', 'WARN', 'REPORT', 'FILTER'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setLogFilterType(t)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                        logFilterType === t ? 'bg-emerald-600 text-white' : 'bg-stone-900 text-stone-400 hover:bg-stone-800'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs space-y-2 h-[500px] overflow-y-auto">
                <div className="text-stone-500 text-[11px]"># Roxie Security & Moderation Live Stream (Chat Scope: {selectedChatId})</div>
                {filteredLogs.map((l: ModerationLog, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 py-1 border-b border-stone-900/50 hover:bg-stone-900/30 px-2 rounded">
                    <span className="text-stone-500 shrink-0">{new Date(l.timestamp).toLocaleTimeString()}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                      l.action === 'ban' ? 'bg-red-500/20 text-red-400' :
                      l.action === 'kick' ? 'bg-amber-500/20 text-amber-400' :
                      l.action === 'warn' ? 'bg-yellow-500/20 text-yellow-400' :
                      l.action === 'report' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {l.action}
                    </span>
                    <span className="text-stone-300 font-semibold">[{l.chatTitle || l.chatId}]</span>
                    <span className="text-stone-400">Target: <strong className="text-stone-200">@{l.targetUsername || l.targetUserId || 'unknown'}</strong></span>
                    {l.reason && <span className="text-stone-500 italic">"{l.reason}"</span>}
                  </div>
                ))}
                {filteredLogs.length === 0 && (
                  <div className="text-stone-600 text-center py-20">No matching log entries found for current filter.</div>
                )}
              </div>
            </div>
          )}

          {/* ACTIVE TAB: COMMAND CENTER */}
          {activeNav === 'commands' && (
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-6 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-blue-400" /> Complete Telegram Command Center ({commands.length} Commands)
                </h3>
                <p className="text-xs text-stone-400 mt-1">Discovered directly from backend handlers and command registry.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {commands.map((cmd, idx) => (
                  <div key={idx} className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 bg-blue-600/10 text-blue-400 font-mono text-xs font-bold rounded-lg border border-blue-500/20">
                        {cmd.command}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                        cmd.permission === 'Owner' ? 'bg-red-500/20 text-red-400' :
                        cmd.permission === 'Admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {cmd.permission}
                      </span>
                    </div>

                    <p className="text-xs text-stone-300">{cmd.description}</p>

                    <div className="bg-stone-950 rounded-lg p-2.5 text-[11px] font-mono space-y-1 text-stone-400">
                      <div><strong className="text-stone-300">Syntax:</strong> {cmd.syntax}</div>
                      <div><strong className="text-stone-300">Example:</strong> {cmd.example}</div>
                      {cmd.telegramPermission && <div><strong className="text-stone-300">TG Perm:</strong> {cmd.telegramPermission}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTIVE TAB: BANNED USERS */}
          {activeNav === 'bans' && (
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Ban className="w-4 h-4 text-red-400" /> Banned Users Management
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-900 text-stone-400 border-b border-stone-800">
                    <tr>
                      <th className="p-3">User ID / Username</th>
                      <th className="p-3">Group</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3">Banned By</th>
                      <th className="p-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-900">
                    {rawLogs.filter((l: any) => l.action === 'ban' || l.action === 'auto_ban').map((l: any, idx: number) => (
                      <tr key={idx} className="hover:bg-stone-900/50">
                        <td className="p-3 font-mono font-semibold text-stone-200">@{l.targetUsername || l.targetUserId}</td>
                        <td className="p-3 text-stone-400">{l.chatTitle || l.chatId}</td>
                        <td className="p-3 text-stone-300">{l.reason || 'No reason specified'}</td>
                        <td className="p-3 text-stone-400">@{l.adminUsername || l.adminUserId || 'system'}</td>
                        <td className="p-3 text-stone-500">{new Date(l.timestamp).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ACTIVE TAB: KICKED USERS */}
          {activeNav === 'kicks' && (
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserX className="w-4 h-4 text-amber-400" /> Kicked Users History
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-900 text-stone-400 border-b border-stone-800">
                    <tr>
                      <th className="p-3">User ID / Username</th>
                      <th className="p-3">Group</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3">Kicked By</th>
                      <th className="p-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-900">
                    {rawLogs.filter((l: any) => l.action === 'kick').map((l: any, idx: number) => (
                      <tr key={idx} className="hover:bg-stone-900/50">
                        <td className="p-3 font-mono font-semibold text-stone-200">@{l.targetUsername || l.targetUserId}</td>
                        <td className="p-3 text-stone-400">{l.chatTitle || l.chatId}</td>
                        <td className="p-3 text-stone-300">{l.reason || 'No reason specified'}</td>
                        <td className="p-3 text-stone-400">@{l.adminUsername || l.adminUserId || 'system'}</td>
                        <td className="p-3 text-stone-500">{new Date(l.timestamp).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ACTIVE TAB: WARNINGS */}
          {activeNav === 'warnings' && (
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" /> Warning Center
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-900 text-stone-400 border-b border-stone-800">
                    <tr>
                      <th className="p-3">Target User</th>
                      <th className="p-3">Group</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3">Issued By</th>
                      <th className="p-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-900">
                    {rawLogs.filter((l: any) => l.action === 'warn').map((l: any, idx: number) => (
                      <tr key={idx} className="hover:bg-stone-900/50">
                        <td className="p-3 font-mono font-semibold text-stone-200">@{l.targetUsername || l.targetUserId}</td>
                        <td className="p-3 text-stone-400">{l.chatTitle || l.chatId}</td>
                        <td className="p-3 text-stone-300">{l.reason || 'Warning issued'}</td>
                        <td className="p-3 text-stone-400">@{l.adminUsername || l.adminUserId || 'system'}</td>
                        <td className="p-3 text-stone-500">{new Date(l.timestamp).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ACTIVE TAB: REPORTS */}
          {activeNav === 'reports' && (
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Flag className="w-4 h-4 text-blue-400" /> Report Center (Public /admin reports)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-900 text-stone-400 border-b border-stone-800">
                    <tr>
                      <th className="p-3">Group</th>
                      <th className="p-3">Reported Target</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-900">
                    {rawLogs.filter((l: any) => l.action === 'report').map((l: any, idx: number) => (
                      <tr key={idx} className="hover:bg-stone-900/50">
                        <td className="p-3 text-stone-400">{l.chatTitle || l.chatId}</td>
                        <td className="p-3 font-mono font-semibold text-stone-200">@{l.targetUsername || l.targetUserId}</td>
                        <td className="p-3 text-stone-300">{l.reason || 'Suspicious activity'}</td>
                        <td className="p-3 text-stone-500">{new Date(l.timestamp).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ACTIVE TAB: AUDIT LOGS */}
          {activeNav === 'audit' && (
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" /> Moderation Audit Log
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-900 text-stone-400 border-b border-stone-800">
                    <tr>
                      <th className="p-3">Time</th>
                      <th className="p-3">Group</th>
                      <th className="p-3">Actor</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Target</th>
                      <th className="p-3">Details / Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-900">
                    {filteredLogs.map((l: ModerationLog, idx: number) => (
                      <tr key={idx} onClick={() => setSelectedEvent(l)} className="hover:bg-stone-900/50 cursor-pointer">
                        <td className="p-3 text-stone-400 font-mono">{new Date(l.timestamp).toLocaleTimeString()}</td>
                        <td className="p-3 text-stone-300">{l.chatTitle || l.chatId}</td>
                        <td className="p-3 font-mono text-stone-300">@{l.adminUsername || l.adminUserId || 'system'}</td>
                        <td className="p-3 font-bold text-blue-400">{l.action}</td>
                        <td className="p-3 font-mono text-stone-200">@{l.targetUsername || l.targetUserId || '-'}</td>
                        <td className="p-3 text-stone-400 truncate max-w-xs">{l.reason || l.details || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ACTIVE TAB: SYSTEM LOGS */}
          {activeNav === 'system' && (
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-400" /> System & Polling Logs
              </h3>
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs space-y-2 h-[400px] overflow-y-auto text-stone-300">
                <div className="text-emerald-400">[SYSTEM] Roxie Control Center operational.</div>
                <div className="text-stone-400">[POLL] Telegram Long Polling Engine status: {isPolling ? 'ACTIVE' : 'IDLE'}</div>
                <div className="text-stone-400">[DB] Local JSON database loaded successfully.</div>
                <div className="text-stone-400">[SECURITY] Global sliding-window rate limiter active.</div>
                {overview?.recentLogs?.slice(-15).map((l: any, idx: number) => (
                  <div key={idx} className="text-stone-500">
                    [{l.timestamp}] [EVENT] {l.action} in group {l.chatId}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACTIVE TAB: LIVE TELEGRAM VERIFICATION */}
          {activeNav === 'live-verify' && (
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-stone-800 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" /> Live Telegram Verification & Status
                  </h3>
                  <p className="text-xs text-stone-400 mt-0.5">Real-time Telegram API connection, bot identity, and long-polling diagnostics.</p>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} /> Test Connection
                </button>
              </div>

              {!telegramStatus?.isConfigured && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-amber-300 text-xs flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>Live Telegram verification unavailable — configure TELEGRAM_BOT_TOKEN in environment variables.</span>
                </div>
              )}

              {testResult && (
                <div className={`p-4 rounded-xl text-xs border ${testResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
                  {testResult.success ? `✅ Successfully connected to bot @${testResult.bot?.username} (${testResult.bot?.first_name})` : `❌ Connection failed: ${testResult.error}`}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-1">
                  <span className="text-[11px] text-stone-400 font-medium">Connection State</span>
                  <div className="text-sm font-bold flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${telegramStatus?.isConfigured && telegramStatus?.isPolling ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                    <span className="text-white">{telegramStatus?.isPolling ? 'CONNECTED & POLLING' : telegramStatus?.isConfigured ? 'DISCONNECTED (Not Polling)' : 'UNCONFIGURED'}</span>
                  </div>
                </div>

                <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-1">
                  <span className="text-[11px] text-stone-400 font-medium">Bot Username</span>
                  <div className="text-sm font-bold text-white font-mono">
                    @{telegramStatus?.botInfo?.username || botInfo?.username || 'Not Authenticated'}
                  </div>
                </div>

                <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-1">
                  <span className="text-[11px] text-stone-400 font-medium">Last Telegram API Error</span>
                  <div className="text-xs font-mono text-red-400 truncate">
                    {telegramStatus?.pollingError || 'None'}
                  </div>
                </div>
              </div>

              <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-3 font-mono text-xs">
                <div className="text-stone-400 font-bold uppercase tracking-wider text-[10px]">Diagnostics Details</div>
                <div className="flex justify-between border-b border-stone-800 pb-2">
                  <span className="text-stone-400">Environment Variable:</span>
                  <span className="text-stone-200">TELEGRAM_BOT_TOKEN ({telegramStatus?.isConfigured ? 'Present' : 'Missing'})</span>
                </div>
                <div className="flex justify-between border-b border-stone-800 pb-2">
                  <span className="text-stone-400">Token Format:</span>
                  <span className={telegramStatus?.isValidFormat ? 'text-emerald-400' : 'text-amber-400'}>{telegramStatus?.isValidFormat ? 'Valid Format' : 'Invalid or Missing'}</span>
                </div>
                <div className="flex justify-between border-b border-stone-800 pb-2">
                  <span className="text-stone-400">Total Messages Processed:</span>
                  <span className="text-stone-200">{telegramStatus?.totalMessagesReceived || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Last Polled At:</span>
                  <span className="text-stone-200">{telegramStatus?.lastPolledAt ? new Date(telegramStatus.lastPolledAt).toLocaleString() : 'Never'}</span>
                </div>
              </div>
            </div>
          )}

          {/* ACTIVE TAB: LIVE TEST CHECKLIST */}
          {activeNav === 'live-checklist' && (
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-stone-800 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-blue-400" /> Live Test Checklist (LIVE-01 to LIVE-46)
                  </h3>
                  <p className="text-xs text-stone-400 mt-0.5">Manually record verification status for end-to-end Telegram bot behaviors.</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg">
                    Pass: {Object.values(liveTestStatus).filter(v => v === 'PASS').length}
                  </span>
                  <span className="px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg">
                    Fail: {Object.values(liveTestStatus).filter(v => v === 'FAIL').length}
                  </span>
                  <span className="px-2.5 py-1 bg-stone-900 text-stone-400 border border-stone-800 rounded-lg">
                    Total: 46
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-900 text-stone-400 border-b border-stone-800">
                    <tr>
                      <th className="p-3 w-28">Test ID</th>
                      <th className="p-3">Behavior / Feature Description</th>
                      <th className="p-3 w-40 text-right">Verification Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-900">
                    {LIVE_TESTS.map((test) => {
                      const status = liveTestStatus[test.id] || 'NOT TESTED';
                      return (
                        <tr key={test.id} className="hover:bg-stone-900/50">
                          <td className="p-3 font-mono font-bold text-blue-400">{test.id}</td>
                          <td className="p-3 text-stone-200">{test.title}</td>
                          <td className="p-3 text-right">
                            <select
                              value={status}
                              onChange={(e) => updateTestStatus(test.id, e.target.value as any)}
                              className={`px-3 py-1.5 rounded-xl font-medium text-xs focus:outline-none border ${
                                status === 'PASS' 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                                  : status === 'FAIL' 
                                  ? 'bg-red-500/10 text-red-400 border-red-500/30' 
                                  : 'bg-stone-900 text-stone-400 border-stone-800'
                              }`}
                            >
                              <option value="NOT TESTED" className="bg-stone-950 text-stone-300">NOT TESTED</option>
                              <option value="PASS" className="bg-stone-950 text-emerald-400">PASS</option>
                              <option value="FAIL" className="bg-stone-950 text-red-400">FAIL</option>
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

          {/* ACTIVE TAB: WELCOME & GOODBYE VARIABLES */}
          {activeNav === 'variables' && (
            <div className="bg-stone-950 border border-stone-800 rounded-2xl p-6 space-y-6">
              <div className="border-b border-stone-800 pb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Smile className="w-4 h-4 text-amber-400" /> Welcome & Goodbye Template Variables
                </h3>
                <p className="text-xs text-stone-400 mt-0.5">Customize greeting messages using real-time user and chat variables supported by Roxie.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { tag: '{mention}', desc: 'Clickable HTML user mention', example: '<a href="tg://user?id=123">John</a>' },
                  { tag: '{first_name}', desc: 'User first name', example: 'John' },
                  { tag: '{username}', desc: 'User @username or fallback display name', example: '@john_doe' },
                  { tag: '{chat_title}', desc: 'Title of the Telegram group', example: 'Roxie Community' },
                  { tag: '{id}', desc: 'Numeric Telegram user ID', example: '987654321' },
                ].map((v, idx) => (
                  <div key={idx} className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-1.5">
                    <span className="font-mono text-blue-400 font-bold text-xs">{v.tag}</span>
                    <p className="text-xs text-stone-300">{v.desc}</p>
                    <div className="text-[11px] text-stone-500 font-mono bg-stone-950 px-2 py-1 rounded">Example: {v.example}</div>
                  </div>
                ))}
              </div>

              <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-4">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Live Template Preview Sandbox</h4>
                <div className="space-y-2">
                  <label className="text-xs text-stone-400 block">Type custom template using variables:</label>
                  <input
                    type="text"
                    value={previewTemplate}
                    onChange={(e) => setPreviewTemplate(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-2.5 text-xs text-stone-200 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1 pt-2">
                  <span className="text-[11px] text-stone-400 block font-medium">Rendered Result Preview:</span>
                  <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 text-xs font-sans text-stone-200">
                    {previewTemplate
                      .replace(/{mention}/gi, '@JohnDoe')
                      .replace(/{first_name}/gi, 'John')
                      .replace(/{username}/gi, '@johndoe')
                      .replace(/{chat_title}/gi, 'My Test Group')
                      .replace(/{id}/gi, '123456789')}
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Event Details Drawer */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end">
          <div className="w-full max-w-md bg-stone-950 border-l border-stone-800 p-6 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-800 pb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" /> Event Details
              </h3>
              <button onClick={() => setSelectedEvent(null)} className="p-1 hover:bg-stone-900 rounded-lg text-stone-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div>
                <span className="text-stone-500 block">Event ID:</span>
                <span className="text-stone-200">{selectedEvent.id}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Action / Type:</span>
                <span className="text-blue-400 font-bold">{selectedEvent.action}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Chat ID / Group:</span>
                <span className="text-stone-200">{selectedEvent.chatTitle || selectedEvent.chatId}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Actor:</span>
                <span className="text-stone-200">@{selectedEvent.adminUsername || selectedEvent.adminUserId || 'system'}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Target User:</span>
                <span className="text-stone-200">@{selectedEvent.targetUsername || selectedEvent.targetUserId || 'none'}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Reason / Details:</span>
                <span className="text-stone-300">{selectedEvent.reason || selectedEvent.details || 'None'}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Timestamp:</span>
                <span className="text-stone-400">{new Date(selectedEvent.timestamp).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
