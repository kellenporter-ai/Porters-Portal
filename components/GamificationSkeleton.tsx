import React from 'react';

/** Spy-themed skeleton loader for gamification panels */
const GamificationSkeleton: React.FC<{ lines?: number }> = ({ lines = 4 }) => (
  <div className="animate-pulse space-y-4 p-4">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-white/[0.06]" />
      <div className="space-y-2 flex-1">
        <div className="h-3 bg-gray-200 dark:bg-white/[0.06] rounded-full w-1/3" />
        <div className="h-2 bg-gray-100 dark:bg-white/[0.04] rounded-full w-1/2" />
      </div>
    </div>
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="h-12 bg-gray-100 dark:bg-white/[0.04] rounded-xl border border-gray-100 dark:border-white/[0.03]" />
    ))}
    <div className="h-8 bg-gray-100 dark:bg-white/[0.03] rounded-lg w-1/4 mx-auto" />
  </div>
);

export default GamificationSkeleton;
