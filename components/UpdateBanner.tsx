import React from 'react';
import { RefreshCw, X } from 'lucide-react';

interface UpdateBannerProps {
  onReload: () => void;
  onDismiss: () => void;
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({ onReload, onDismiss }) => {
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500/90 dark:bg-amber-600/90 text-white px-4 py-2.5 flex items-center justify-center gap-3 backdrop-blur-sm shadow-lg animate-in slide-in-from-top-full duration-300">
      <span className="text-sm font-semibold">
        An update is available — refresh to get the latest version.
      </span>
      <button
        onClick={onReload}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Refresh Now
      </button>
      <button
        onClick={onDismiss}
        className="p-1.5 hover:bg-white/20 rounded-lg transition-colors ml-1"
        aria-label="Dismiss update notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
