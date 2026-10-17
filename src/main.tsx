import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import TelegramMiniApp from './components/TelegramMiniApp.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import './index.css';

// Detect whether running in Telegram Mini App mode
const isMiniAppMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (window.location.pathname.startsWith('/miniapp')) return true;
  const search = window.location.search;
  const hash = window.location.hash;
  if (search.includes('tgWebApp') || search.includes('startapp') || search.includes('chat_id') || search.includes('chatId') || search.includes('mode=tma')) return true;
  if (hash.includes('tgWebAppData')) return true;
  if (Boolean((window as any).Telegram?.WebApp?.initData)) return true;
  return false;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isMiniAppMode() ? <TelegramMiniApp /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);

