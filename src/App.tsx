import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Bot, 
  ExternalLink,
  Radio,
  Send,
  MessageSquare,
  Sparkles,
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
  Terminal,
  Settings,
  ListChecks,
  Lock
} from 'lucide-react';

interface BotInfo {
  id: number;
  username: string;
  firstName: string;
  canJoinGroups?: boolean;
  canReadGroupMessages?: boolean;
  supportsInlineQueries?: boolean;
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

interface TelegramBotStatus {
  variableName: string;
  isConfigured: boolean;
  isValidFormat: boolean;
  isPolling: boolean;
  botInfo: BotInfo | null;
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

export default function App() {
  const [status, setStatus] = useState<TelegramBotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; bot?: BotInfo; error?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'commands' | 'logs' | 'checklist'>('overview');

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/telegram/status');
      if (res.ok) {
        const data: TelegramBotStatus = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch bot status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/telegram/test-connection', { method: 'POST' });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        fetchStatus();
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Network error while contacting server'
      });
    } finally {
      setTestingConnection(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const botUsername = status?.botInfo?.username || testResult?.bot?.username || 'MissRoxie_Bot';
  const botFirstName = status?.botInfo?.firstName || testResult?.bot?.firstName || 'Roxie';
  const botId = status?.botInfo?.id || testResult?.bot?.id;

  return (
    <div id="app-container" className="min-h-screen bg-stone-100 text-stone-900 flex flex-col items-center justify-start py-8 px-4 sm:px-6 lg:px-8">
      <main id="main-content" className="w-full max-w-4xl space-y-6">
        
        {/* Main Header Bar */}
        <header id="header-card" className="bg-white border border-stone-200 rounded-xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-stone-900">Roxie Group Moderation Console</h1>
                {status?.isPolling ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Long Polling Active
                  </span>
                ) : status?.isConfigured ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-full">
                    Configured
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                    Secret Missing
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 mt-1">
                Connected to Telegram bot <strong>@{botUsername}</strong> (ID: {botId})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="test-connection-btn"
              onClick={handleTestConnection}
              disabled={testingConnection || !status?.isConfigured}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {testingConnection ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Radio className="w-3.5 h-3.5" />
                  Verify Telegram API
                </>
              )}
            </button>
            <button
              id="refresh-btn"
              onClick={fetchStatus}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Sync
            </button>
          </div>
        </header>

        {/* Live Metrics Grid */}
        <section id="metrics-grid" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
              <span>Bans / Kicks</span>
              <Ban className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-xl font-bold text-stone-900">
              {(status?.stats?.totalBans || 0) + (status?.stats?.totalKicks || 0)}
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              {status?.stats?.totalBans || 0} bans, {status?.stats?.totalKicks || 0} kicks
            </p>
          </div>

          <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
              <span>Warnings Issued</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl font-bold text-stone-900">
              {status?.stats?.totalWarns || 0}
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">Threshold auto-ban ready</p>
          </div>

          <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
              <span>Filtered Content</span>
              <LinkIcon className="w-4 h-4 text-sky-500" />
            </div>
            <div className="text-xl font-bold text-stone-900">
              {(status?.stats?.totalDeletedLinks || 0) + (status?.stats?.totalDeletedStickers || 0)}
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              {status?.stats?.totalDeletedLinks || 0} links, {status?.stats?.totalDeletedStickers || 0} stickers
            </p>
          </div>

          <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
              <span>Automations</span>
              <Calendar className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-xl font-bold text-stone-900">
              {status?.stats?.activeSchedules || 0}
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">Active message schedules</p>
          </div>
        </section>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'overview'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
            }`}
          >
            Setup & Verification
          </button>
          <button
            onClick={() => setActiveTab('commands')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'commands'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
            }`}
          >
            Moderation Commands (17)
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'logs'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
            }`}
          >
            Audit Logs ({status?.recentLogs?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('checklist')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'checklist'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
            }`}
          >
            Test Checklist
          </button>
        </div>

        {/* Tab 1: Overview & Setup */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Action Link to Bot */}
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-sky-950 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-sky-700" />
                  Add @{botUsername} as Group Administrator
                </h2>
                <p className="text-xs text-sky-900 leading-relaxed max-w-xl">
                  To enable full moderation features (kick, ban, link deletion, sticker filtering, automated broadcast), add <strong>@{botUsername}</strong> to your Telegram group and grant it Administrator permissions with <strong>Delete Messages</strong> and <strong>Ban Users</strong>.
                </p>
              </div>
              <a
                href={`https://t.me/${botUsername}?startgroup=true`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg transition-colors shrink-0"
              >
                Add Bot to Group
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Architecture Highlights */}
            <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-xs space-y-4">
              <h2 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Phase 2 Architecture & Security Guarantees
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70 space-y-1">
                  <p className="font-semibold text-stone-900">🛡️ Permission Middleware</p>
                  <p className="text-stone-600 leading-relaxed">
                    Every admin command verifies group context (<code className="font-mono">requireGroup</code>), sender admin status (<code className="font-mono">requireAdmin</code>), and bot execution rights (<code className="font-mono">requireBotPermission</code>). Normal members can never execute admin actions.
                  </p>
                </div>
                <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70 space-y-1">
                  <p className="font-semibold text-stone-900">👑 Hierarchy Protection</p>
                  <p className="text-stone-600 leading-relaxed">
                    Admins cannot ban/kick other administrators or the group owner. The bot validates hierarchy before calling Telegram restriction APIs.
                  </p>
                </div>
                <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70 space-y-1">
                  <p className="font-semibold text-stone-900">💾 Persistent Multi-Group Storage</p>
                  <p className="text-stone-600 leading-relaxed">
                    Settings (links, stickers, warn limit), active warnings, sticker permissions (<code className="font-mono">/free</code>), and scheduled messages persist across server restarts with zero data loss.
                  </p>
                </div>
                <div className="p-3 bg-stone-50 rounded-lg border border-stone-200/70 space-y-1">
                  <p className="font-semibold text-stone-900">🔒 Token Safety</p>
                  <p className="text-stone-600 leading-relaxed">
                    <code className="font-mono">TELEGRAM_BOT_TOKEN</code> is strictly read from <code className="font-mono">process.env</code> server-side. It is never logged, never returned in API responses, and never exposed in browser bundles.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Commands Cheat Sheet */}
        {activeTab === 'commands' && (
          <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-xs space-y-5">
            <h2 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-stone-700" />
              Complete Telegram Command Reference
            </h2>

            <div className="space-y-4 text-xs">
              {/* Member Management */}
              <div>
                <h3 className="font-bold text-stone-900 uppercase tracking-wider text-[11px] text-stone-400 mb-2">
                  1. Member Management (Admins Only)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-sky-700">/kick @username</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Removes user from group (they can re-join via link). Also works via reply.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-rose-700">/ban @username [reason]</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Permanently bans target user from the group. Also works via reply.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-emerald-700">/unban @username</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Unbans target user so they can join back with an invite link.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-amber-700">/demote @username</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Revokes administrator privileges from a promoted administrator.</p>
                  </div>
                </div>
              </div>

              {/* Warning System */}
              <div>
                <h3 className="font-bold text-stone-900 uppercase tracking-wider text-[11px] text-stone-400 mb-2">
                  2. Warning & Threshold System
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-amber-700">/warn @user [reason]</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Issues a warning. Automatically bans if user reaches the warning limit.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-stone-700">/warnings [@user]</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Displays active warnings, reasons, and timestamps for target user.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-emerald-700">/resetwarns @user</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Resets warning count for target member.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-indigo-700">/setwarnlimit &lt;number&gt;</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Configures group warning limit (default: 3). e.g. <code className="font-mono">/setwarnlimit 5</code></p>
                  </div>
                </div>
              </div>

              {/* Protection & Filters */}
              <div>
                <h3 className="font-bold text-stone-900 uppercase tracking-wider text-[11px] text-stone-400 mb-2">
                  3. Link & Sticker Protection
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-sky-700">/links on | off</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">When ON, deletes unauthorized links from normal members and warns them.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-sky-700">/stickers on | off</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">When ON, deletes stickers from normal members unless whitelisted with /free.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-emerald-700">/free [@user | reply]</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Grants a member sticker exemption so their stickers aren't deleted.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-rose-700">/unfree @user</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Revokes sticker exemption from user.</p>
                  </div>
                </div>
              </div>

              {/* Automation & Broadcast */}
              <div>
                <h3 className="font-bold text-stone-900 uppercase tracking-wider text-[11px] text-stone-400 mb-2">
                  4. Automated Scheduling & Broadcast
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-indigo-700">/schedule &lt;30m|2h|1d&gt; &lt;msg&gt;</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Creates recurring broadcast message. Survives server restarts!</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-stone-700">/listSchedules</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Lists all active recurring schedules in the current group.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-rose-700">/deleteSchedule &lt;id&gt;</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Deletes recurring schedule by its ID.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-stone-700">/say &lt;message&gt;</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Admin broadcast message directly as the bot with flood prevention.</p>
                  </div>
                </div>
              </div>

              {/* Member Tools */}
              <div>
                <h3 className="font-bold text-stone-900 uppercase tracking-wider text-[11px] text-stone-400 mb-2">
                  5. Member Tools & Utilities
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-amber-700">/report [reason]</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Reply to any message to file a report with anti-spam rate limiting.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-stone-700">/live</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Guidance on initiating Telegram Group voice/video live calls.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-stone-700">/status</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Displays active group settings, filter state, and uptime stats.</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded border border-stone-200">
                    <span className="font-bold text-stone-700">/help</span>
                    <p className="font-sans text-[11px] text-stone-600 mt-1">Comprehensive interactive command guide.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Moderation Audit Stream */}
        {activeTab === 'logs' && (
          <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h2 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-stone-700" />
                Moderation Audit Trail
              </h2>
              <span className="text-[11px] text-stone-500 font-mono">
                Auto-refreshed live
              </span>
            </div>

            {status?.recentLogs && status.recentLogs.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {status.recentLogs.slice().reverse().map((log) => (
                  <div 
                    key={log.id}
                    className="p-3 rounded-lg border border-stone-200/80 bg-stone-50 text-xs flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-medium">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold ${
                          log.action === 'ban' || log.action === 'auto_ban' || log.action === 'kick'
                            ? 'bg-rose-100 text-rose-800'
                            : log.action === 'warn'
                            ? 'bg-amber-100 text-amber-800'
                            : log.action === 'delete_link' || log.action === 'delete_sticker'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-stone-200 text-stone-800'
                        }`}>
                          {log.action.replace('_', ' ')}
                        </span>
                        <span className="text-stone-900 font-semibold">{log.chatTitle || 'Group'}</span>
                      </div>
                      <p className="text-stone-700">
                        {log.targetUsername ? (
                          <span>Target: <strong>@{log.targetUsername}</strong> · </span>
                        ) : null}
                        {log.adminUsername ? (
                          <span>Admin: <strong>@{log.adminUsername}</strong> · </span>
                        ) : null}
                        {log.reason ? <span>Reason: <i>"{log.reason}"</i></span> : null}
                        {log.details ? <span>{log.details}</span> : null}
                      </p>
                    </div>
                    <span className="text-[10px] text-stone-400 font-mono shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-stone-400 text-xs space-y-2">
                <Shield className="w-8 h-8 mx-auto opacity-30 text-stone-500" />
                <p>No moderation actions logged yet.</p>
                <p className="text-[11px] text-stone-500">
                  Moderation events (warnings, kicks, bans, link deletions, scheduled posts) will appear here in real-time.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Step-by-Step Test Checklist */}
        {activeTab === 'checklist' && (
          <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-emerald-600" />
              Phase 2 Telegram Test Checklist
            </h2>
            <p className="text-xs text-stone-600 leading-relaxed">
              Verify all 17 commands and moderation mechanisms in your Telegram test group:
            </p>

            <div className="divide-y divide-stone-100 text-xs border border-stone-200 rounded-lg overflow-hidden">
              <div className="p-3 bg-stone-50 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">1. /kick @username</p>
                  <p className="text-stone-500 text-[11px]">Removes user; user can re-join with link.</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
              <div className="p-3 bg-white flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">2. /ban @username [reason]</p>
                  <p className="text-stone-500 text-[11px]">Permanently bans target user.</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
              <div className="p-3 bg-stone-50 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">3. /unban @username</p>
                  <p className="text-stone-500 text-[11px]">Unbans user from the group.</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
              <div className="p-3 bg-white flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">4. /demote @username</p>
                  <p className="text-stone-500 text-[11px]">Demotes an administrator (protects owner & checks rights).</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
              <div className="p-3 bg-stone-50 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">5. /warn @username [reason] & /warnings</p>
                  <p className="text-stone-500 text-[11px]">Issues warning, stores reasons, tracks count.</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
              <div className="p-3 bg-white flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">6. /resetwarns @username</p>
                  <p className="text-stone-500 text-[11px]">Clears user's warnings.</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
              <div className="p-3 bg-stone-50 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">7. /setwarnlimit &lt;number&gt;</p>
                  <p className="text-stone-500 text-[11px]">Custom threshold per group (default 3); auto-bans upon reaching.</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
              <div className="p-3 bg-white flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">8. /links on & /links off</p>
                  <p className="text-stone-500 text-[11px]">Auto-deletes links from non-admins and issues warnings.</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
              <div className="p-3 bg-stone-50 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">9. /stickers on & /stickers off</p>
                  <p className="text-stone-500 text-[11px]">Auto-deletes stickers from normal members.</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
              <div className="p-3 bg-white flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">10. /free & /unfree</p>
                  <p className="text-stone-500 text-[11px]">Grants / revokes sticker exemption for trusted members.</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
              <div className="p-3 bg-stone-50 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">11. /report [reason]</p>
                  <p className="text-stone-500 text-[11px]">Reply to message to report with rate-limiting.</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
              <div className="p-3 bg-white flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">12. /say &lt;message&gt;</p>
                  <p className="text-stone-500 text-[11px]">Admin broadcast directly as the bot.</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
              <div className="p-3 bg-stone-50 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">13. /schedule, /listSchedules, /deleteSchedule</p>
                  <p className="text-stone-500 text-[11px]">Persistent recurring messages (e.g. /schedule 30m Welcome!).</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
              <div className="p-3 bg-white flex items-center justify-between">
                <div>
                  <p className="font-semibold text-stone-900">14. /live, /status, /help</p>
                  <p className="text-stone-500 text-[11px]">Explains Telegram voice chats, shows group uptime & configuration.</p>
                </div>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Ready</span>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
