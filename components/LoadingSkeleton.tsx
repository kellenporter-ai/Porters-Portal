import React from 'react';

interface LoadingSkeletonProps {
    rows?: number;
    type?: 'list' | 'card' | 'table';
}

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ rows = 3, type = 'list' }) => {
    if (type === 'card') {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 animate-pulse">
                        <div className="h-4 bg-white/10 rounded w-3/4 mb-3" />
                        <div className="h-3 bg-white/5 rounded w-full mb-2" />
                        <div className="h-3 bg-white/5 rounded w-2/3" />
                    </div>
                ))}
            </div>
        );
    }

    if (type === 'table') {
        return (
            <div className="space-y-3">
                <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="flex gap-4 animate-pulse">
                        <div className="h-8 bg-white/5 rounded flex-1" />
                        <div className="h-8 bg-white/5 rounded w-24" />
                        <div className="h-8 bg-white/5 rounded w-20" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 animate-pulse">
                    <div className="w-10 h-10 rounded-xl bg-white/5 shrink-0" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 bg-white/10 rounded w-2/3" />
                        <div className="h-3 bg-white/5 rounded w-1/3" />
                    </div>
                </div>
            ))}
        </div>
    );
};

export default LoadingSkeleton;
