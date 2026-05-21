import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 font-mono fixed inset-0 overflow-auto z-[99999]">
          <h2 className="text-lg font-bold mb-2">渲染崩溃 (Render Crash)</h2>
          <pre className="text-xs whitespace-pre-wrap bg-black/5 dark:bg-white/5 p-4 rounded-lg border border-red-200 dark:border-red-900/30">
            {this.state.error?.stack || this.state.error?.message}
          </pre>
          <button 
            type="button"
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 active:scale-95 transition-all text-xs"
          >
            重新加载页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
