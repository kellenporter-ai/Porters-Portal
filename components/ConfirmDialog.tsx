import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmOptions {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'info';
}

interface ConfirmContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const useConfirm = (): ConfirmContextType => {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
    return ctx;
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<{
        isOpen: boolean;
        options: ConfirmOptions;
    }>({ isOpen: false, options: { message: '' } });

    const resolveRef = useRef<((value: boolean) => void) | null>(null);
    const confirmBtnRef = useRef<HTMLButtonElement>(null);

    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            resolveRef.current = resolve;
            setState({ isOpen: true, options });
        });
    }, []);

    const handleConfirm = useCallback(() => {
        resolveRef.current?.(true);
        resolveRef.current = null;
        setState((s) => ({ ...s, isOpen: false }));
    }, []);

    const handleCancel = useCallback(() => {
        resolveRef.current?.(false);
        resolveRef.current = null;
        setState((s) => ({ ...s, isOpen: false }));
    }, []);

    // Focus confirm button when dialog opens
    useEffect(() => {
        if (state.isOpen) {
            const timer = setTimeout(() => {
                confirmBtnRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [state.isOpen]);

    // Handle escape and enter keys
    useEffect(() => {
        if (!state.isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleCancel();
            if (e.key === 'Enter') handleConfirm();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [state.isOpen, handleCancel, handleConfirm]);

    const { variant = 'danger' } = state.options;
    const variantStyles = {
        danger: { bg: 'bg-red-600 hover:bg-red-500', icon: 'text-red-400', border: 'border-red-500/30' },
        warning: { bg: 'bg-amber-600 hover:bg-amber-500', icon: 'text-amber-400', border: 'border-amber-500/30' },
        info: { bg: 'bg-purple-600 hover:bg-purple-500', icon: 'text-purple-400', border: 'border-purple-500/30' },
    }[variant];

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {state.isOpen && (
                <div 
                    className="fixed inset-0 flex items-center justify-center p-4"
                    style={{ zIndex: 99999 }}
                    role="dialog" 
                    aria-modal="true"
                    aria-label="Confirmation dialog"
                >
                    <div 
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
                        onClick={handleCancel} 
                    />
                    <div className={`relative bg-gray-900 border ${variantStyles.border} rounded-2xl p-6 max-w-sm w-full shadow-2xl`}
                        style={{ animation: 'confirmIn 150ms ease-out' }}
                    >
                        <div className="flex items-start gap-4 mb-5">
                            <div className={`p-2 rounded-xl bg-white/5 ${variantStyles.icon} shrink-0`}>
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                                {state.options.title && (
                                    <h3 className="font-bold text-white text-sm mb-1">{state.options.title}</h3>
                                )}
                                <p className="text-gray-300 text-sm leading-relaxed">{state.options.message}</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handleCancel}
                                className="flex-1 py-2.5 bg-white/5 border border-white/10 text-gray-300 rounded-xl text-sm font-bold hover:bg-white/10 transition"
                            >
                                {state.options.cancelLabel || 'Cancel'}
                            </button>
                            <button
                                ref={confirmBtnRef}
                                onClick={handleConfirm}
                                className={`flex-1 py-2.5 ${variantStyles.bg} text-white rounded-xl text-sm font-bold transition`}
                            >
                                {state.options.confirmLabel || 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <style>{`
                @keyframes confirmIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </ConfirmContext.Provider>
    );
};
