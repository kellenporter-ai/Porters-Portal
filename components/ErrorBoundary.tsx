import React from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-[#0f0720] p-6">
                    <div className="max-w-md w-full bg-white/5 backdrop-blur-xl border border-white/10 p-10 rounded-3xl text-center shadow-2xl">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
                            <span className="text-3xl">⚠️</span>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-3">System Malfunction</h1>
                        <p className="text-gray-400 mb-6 text-sm">
                            Something unexpected happened. Your data is safe — try reloading.
                        </p>
                        {this.state.error && (
                            <pre className="text-[10px] text-red-400/60 bg-black/40 p-3 rounded-xl mb-6 text-left overflow-auto max-h-24 font-mono">
                                {this.state.error.message}
                            </pre>
                        )}
                        <button
                            onClick={this.handleReload}
                            className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold transition flex items-center justify-center gap-2"
                        >
                            <RefreshCw className="w-5 h-5" />
                            Reload Portal
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
