
import React from 'react';

const RouteSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-6 p-2" role="status" aria-label="Loading content">
    {/* Page header skeleton */}
    <div className="space-y-3">
      <div className="h-8 bg-white/5 rounded-xl w-64" />
      <div className="h-4 bg-white/5 rounded-lg w-96 max-w-full" />
    </div>

    {/* Stat cards row skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 bg-white/5 rounded-2xl border border-white/5" />
      ))}
    </div>

    {/* Content area skeleton */}
    <div className="bg-white/5 rounded-2xl border border-white/5 p-6 space-y-4">
      <div className="h-5 bg-white/5 rounded w-48" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white/5 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-white/5 rounded w-3/4" />
            <div className="h-3 bg-white/5 rounded w-1/2" />
          </div>
          <div className="h-6 bg-white/5 rounded w-16 shrink-0" />
        </div>
      ))}
    </div>

    <span className="sr-only">Loading...</span>
  </div>
);

export default React.memo(RouteSkeleton);
