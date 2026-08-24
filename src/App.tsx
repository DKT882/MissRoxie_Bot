import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  KeyRound, 
  Server, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Bot, 
  ExternalLink,
  Lock,
  Terminal,
  HelpCircle
} from 'lucide-react';

interface TelegramStatus {
  variableName: string;
  isConfigured: boolean;
  isValidFormat: boolean;
  configuredLength: number;
  maskedPreview: string | null;
  environment: string;
}

interface BotInfo {
  id: number;
  username: string;
  firstName: string;
  canJoinGroups?: boolean;
  canReadGroupMessages?: boolean;
  supportsInlineQueries?: boolean;
}

export default function App() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setTestError(null);
    try {
      const res = await fetch('/api/telegram/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestError(null);
    setBotInfo(null);
    try {
      const res = await fetch('/api/telegram/test-connection', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.bot) {
        setBotInfo(data.bot);
      } else {
        setTestError(data.error || 'Failed to authenticate with Telegram Bot API');
      }
    } catch (err: any) {
      setTestError(err.message || 'Network error while contacting server');
    } finally {
      setTestingConnection(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div id="app-container" className="min-h-screen bg-stone-50 text-stone-900 flex flex-col items-center justify-start py-12 px-4 sm:px-6 lg:px-8">
      <main id="main-card" className="w-full max-w-2xl bg-white border border-stone-200 rounded-xl shadow-xs p-6 sm:p-8">
        {/* Header */}
        <header id="header-section" className="border-b border-stone-100 pb-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-stone-900 text-white flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-stone-900">Telegram Bot Environment</h1>
                <p className="text-sm text-stone-500">Server-side secret configuration</p>
              </div>
            </div>
            <button
              id="refresh-status-btn"
              onClick={fetchStatus}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </header>

        {/* Environment Variable Status */}
        <section id="status-section" className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">
            Variable Status
          </h2>
          
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-stone-600" />
                  <code className="text-sm font-mono font-semibold text-stone-800">
                    TELEGRAM_BOT_TOKEN
                  </code>
                </div>
                <p className="text-xs text-stone-500">
                  Target: Server environment (<code className="font-mono">process.env.TELEGRAM_BOT_TOKEN</code>)
                </p>
              </div>

              {loading ? (
                <span className="inline-flex items-center gap-1 text-xs text-stone-500 bg-stone-200/60 px-2.5 py-1 rounded-full">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Checking...
                </span>
              ) : status?.isConfigured ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-100/80 px-2.5 py-1 rounded-full">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Not Set
                </span>
              )}
            </div>

            {status?.isConfigured && (
              <div className="mt-4 pt-3 border-t border-stone-200/60 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500">Masked Token:</span>
                  <code className="font-mono text-stone-700 bg-stone-100 px-2 py-0.5 rounded">
                    {status.maskedPreview}
                  </code>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-500">Format check:</span>
                  <span className={status.isValidFormat ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                    {status.isValidFormat ? 'Valid bot token format' : 'Unusual format (verify from BotFather)'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Test connection button if configured */}
          {status?.isConfigured && (
            <div className="mt-3">
              <button
                id="test-telegram-btn"
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-50"
              >
                {testingConnection ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Testing connection to Telegram API...
                  </>
                ) : (
                  <>
                    <Bot className="w-4 h-4" />
                    Verify Bot with Telegram API (getMe)
                  </>
                )}
              </button>
            </div>
          )}

          {/* Bot test result */}
          {botInfo && (
            <div id="bot-info-card" className="mt-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1.5 text-emerald-950">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-900 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                Bot Connected Successfully
              </div>
              <p><span className="font-medium text-emerald-900">Name:</span> {botInfo.firstName}</p>
              <p><span className="font-medium text-emerald-900">Username:</span> @{botInfo.username}</p>
              <p><span className="font-medium text-emerald-900">Bot ID:</span> {botInfo.id}</p>
            </div>
          )}

          {testError && (
            <div id="bot-error-card" className="mt-3 p-4 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-rose-950">
                <AlertCircle className="w-4 h-4 text-rose-700" />
                Connection Verification Failed
              </div>
              <p>{testError}</p>
            </div>
          )}
        </section>

        {/* Security & Configuration Guide */}
        <section id="guide-section" className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            How to configure TELEGRAM_BOT_TOKEN
          </h2>

          <div className="border border-stone-200 rounded-lg divide-y divide-stone-100 text-sm">
            <div className="p-4 flex gap-3.5">
              <div className="w-6 h-6 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center text-xs font-semibold shrink-0">
                1
              </div>
              <div>
                <p className="font-medium text-stone-900 mb-0.5">Get your Bot Token from Telegram</p>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-blue-600 underline inline-flex items-center gap-0.5">@BotFather <ExternalLink className="w-3 h-3 inline" /></a> on Telegram, create a new bot with <code className="bg-stone-100 px-1 py-0.5 rounded font-mono text-xs">/newbot</code>, and copy the HTTP API token.
                </p>
              </div>
            </div>

            <div className="p-4 flex gap-3.5">
              <div className="w-6 h-6 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center text-xs font-semibold shrink-0">
                2
              </div>
              <div>
                <p className="font-medium text-stone-900 mb-0.5">Set the Secret in AI Studio</p>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Open the <strong>Settings</strong> panel (or <strong>Secrets</strong> panel) in the Google AI Studio menu. Add a secret with key:
                </p>
                <div className="mt-2 bg-stone-900 text-stone-100 px-3 py-1.5 rounded font-mono text-xs flex items-center justify-between">
                  <span>TELEGRAM_BOT_TOKEN</span>
                  <span className="text-stone-400 text-[11px]">Server secret</span>
                </div>
              </div>
            </div>

            <div className="p-4 flex gap-3.5">
              <div className="w-6 h-6 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center text-xs font-semibold shrink-0">
                3
              </div>
              <div>
                <p className="font-medium text-stone-900 mb-0.5">Automatic Server Injection</p>
                <p className="text-xs text-stone-600 leading-relaxed">
                  AI Studio securely injects the secret into the Cloud Run container at runtime. The Express backend accesses it via <code className="bg-stone-100 px-1 py-0.5 rounded font-mono text-xs">process.env.TELEGRAM_BOT_TOKEN</code> without ever shipping it to the client.
                </p>
              </div>
            </div>
          </div>

          {/* Security Guarantee Box */}
          <div id="security-notice" className="bg-stone-100/70 border border-stone-200/80 rounded-lg p-3.5 flex items-start gap-3 text-xs text-stone-600">
            <ShieldCheck className="w-4 h-4 text-stone-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-stone-900">Security Guarantee</p>
              <p className="text-stone-600 mt-0.5 leading-relaxed">
                Tokens and secrets are never committed into git, never hardcoded in source code, and never exposed in client bundles. All Telegram Bot API interactions execute securely server-side.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
