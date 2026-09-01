import React, { useState, useEffect, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

export function ErrorBoundary({ children }: Props) {
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      console.error('[Dashboard Error Handler] Uncaught error:', event.error);
      setError(event.error || new Error(event.message || 'Unknown dashboard error'));
    };

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      console.error('[Dashboard Rejection Handler] Unhandled promise rejection:', event.reason);
      setError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
    };

    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);
    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-stone-900 border border-stone-800 rounded-2xl p-8 space-y-6 shadow-2xl text-center">
          <div className="w-14 h-14 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Dashboard Encountered an Error</h2>
            <p className="text-xs text-stone-400">
              A runtime error occurred. All backend bot services and group memory remain safe and active.
            </p>
          </div>
          <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 text-left overflow-auto max-h-40">
            <p className="text-xs font-mono text-red-400 font-semibold">{error.message}</p>
            {error.stack && (
              <pre className="text-[10px] font-mono text-stone-500 mt-2 whitespace-pre-wrap">{error.stack}</pre>
            )}
          </div>
          <button
            onClick={() => { setError(null); window.location.reload(); }}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-600/20"
          >
            <RefreshCw className="w-4 h-4" /> Reload Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
