import React, { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const ComponentBase = (React.Component || class {}) as new (props: Props) => {
  props: Props;
  state: State;
  setState: (state: Partial<State> | ((prevState: State) => Partial<State>)) => void;
};

export class ErrorBoundary extends ComponentBase {
  private rejectionHandler = (event: PromiseRejectionEvent) => {
    console.error('[Dashboard Rejection Handler] Unhandled promise rejection:', event.reason);
    const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'Unhandled Promise Rejection'));
    this.setState({ hasError: true, error: err });
  };

  private windowErrorHandler = (event: ErrorEvent) => {
    console.error('[Dashboard Window Error] Uncaught error:', event.error || event.message);
    const err = event.error instanceof Error ? event.error : new Error(event.message || 'Unknown runtime error');
    this.setState({ hasError: true, error: err });
  };

  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: any) {
    console.error('[Dashboard Error Boundary] Uncaught render error:', error, errorInfo);
  }

  public componentDidMount() {
    window.addEventListener('unhandledrejection', this.rejectionHandler);
    window.addEventListener('error', this.windowErrorHandler);
  }

  public componentWillUnmount() {
    window.removeEventListener('unhandledrejection', this.rejectionHandler);
    window.removeEventListener('error', this.windowErrorHandler);
  }

  public render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl text-center">
            <div className="w-14 h-14 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold text-white">Dashboard Encountered an Error</h2>
              <p className="text-xs text-slate-400">
                A runtime error occurred in the dashboard interface. Group memory and bot services remain safe.
              </p>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-left overflow-auto max-h-40">
              <p className="text-xs font-mono text-red-400 font-semibold">{this.state.error.message || 'Unknown error'}</p>
              {this.state.error.stack && (
                <pre className="text-[10px] font-mono text-slate-500 mt-2 whitespace-pre-wrap">{this.state.error.stack}</pre>
              )}
            </div>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-cyan-600/20 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Reload Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

