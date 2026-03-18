import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { reportError } from '../lib/errorReporting';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/** Errors caused by browser translation extensions mutating the DOM. */
function isTranslationExtensionError(error: Error): boolean {
    const msg = error.message || '';
    return (
        msg.includes("Failed to execute 'removeChild'") ||
        msg.includes("Failed to execute 'insertBefore'") ||
        msg.includes('The node to be removed is not a child') ||
        msg.includes('Node was not found')
    );
}

class ErrorBoundary extends React.Component<Props, State> {
    private translationRetries = 0;

    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        // Auto-recover from translation extension errors (up to 3 times)
        if (isTranslationExtensionError(error) && this.translationRetries < 3) {
            this.translationRetries++;
            console.warn('[PorterPortal] Recovered from translation extension DOM conflict', error.message);
            this.setState({ hasError: false, error: null });
            return;
        }
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)] p-6">
                    <div className="max-w-md w-full bg-white/5 backdrop-blur-xl border border-white/10 p-10 rounded-3xl text-center shadow-2xl">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
                            <span className="text-3xl">⚠️</span>
                        </div>
                        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-3">System Malfunction</h1>
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

// ─── Lightweight inline error boundary for individual features ───
// Falls back to a small inline error card instead of taking down the whole page.

interface FeatureProps {
    children: React.ReactNode;
    feature: string;
}

interface FeatureState {
    hasError: boolean;
    error: Error | null;
}

export class FeatureErrorBoundary extends React.Component<FeatureProps, FeatureState> {
    private translationRetries = 0;

    constructor(props: FeatureProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): FeatureState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        // Auto-recover from translation extension errors (up to 3 times per feature)
        if (isTranslationExtensionError(error) && this.translationRetries < 3) {
            this.translationRetries++;
            console.warn(`[PorterPortal] Recovered from translation extension DOM conflict in ${this.props.feature}`, error.message);
            this.setState({ hasError: false, error: null });
            return;
        }
        console.error(`FeatureErrorBoundary [${this.props.feature}]:`, error, errorInfo);
        reportError(error, { feature: this.props.feature, componentStack: errorInfo.componentStack });
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 text-center" role="alert">
                    <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-white mb-1">{this.props.feature} failed to load</h3>
                    <p className="text-xs text-gray-400 mb-4">
                        {this.state.error?.message || 'An unexpected error occurred.'}
                    </p>
                    <button
                        onClick={this.handleRetry}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-2"
                    >
                        <RefreshCw className="w-3 h-3" />
                        Retry
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
