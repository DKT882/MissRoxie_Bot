import React, { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import './index.css';

// Early signal to Telegram WebApp client to reveal webview immediately
try {
  const tg = (window as any).Telegram?.WebApp;
  if (tg) {
    tg.ready?.();
    tg.expand?.();
  }
} catch {}

// Detect whether running in Telegram Mini App mode
const isMiniAppMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (window.location.pathname.startsWith('/miniapp')) return true;
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  if (search.includes('tgWebApp') || search.includes('startapp') || search.includes('chat_id') || search.includes('chatId') || search.includes('mode=tma')) return true;
  if (hash.includes('tgWebAppData') || hash.includes('tgWebAppStartParam') || hash.includes('chat_id') || hash.includes('startapp')) return true;
  if (Boolean((window as any).Telegram?.WebApp?.initData)) return true;
  if (Boolean((window as any).TelegramWebviewProxy)) return true;
  return false;
};

// Resilient dynamic import helper with automatic retry for network glitches or post-deployment chunk hash transitions
const lazyWithRetry = (importFn: () => Promise<any>) =>
  lazy(async () => {
    try {
      return await importFn();
    } catch (err: any) {
      console.warn('[Dynamic Import] Initial chunk fetch failed, retrying once...', err?.message);
      await new Promise(r => setTimeout(r, 300));
      return await importFn();
    }
  });

// Code-split entry points to eliminate loading the 9,200-line desktop dashboard inside Telegram Mini App
const App = lazyWithRetry(() => import('./App.tsx'));
const TelegramMiniApp = lazyWithRetry(() => import('./components/TelegramMiniApp.tsx'));

const FallbackLoader = () => (
  <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center font-sans text-xs">
    <div className="flex items-center gap-2.5">
      <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
      <span className="font-semibold text-slate-300">Loading Miss Roxie...</span>
    </div>
  </div>
);

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <Suspense fallback={<FallbackLoader />}>
          {isMiniAppMode() ? <TelegramMiniApp /> : <App />}
        </Suspense>
      </ErrorBoundary>
    </StrictMode>,
  );
}
