import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

const ConnectionStatus: React.FC = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [showReconnected, setShowReconnected] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setShowReconnected(true);
            setTimeout(() => setShowReconnected(false), 3000);
        };
        const handleOffline = () => {
            setIsOnline(false);
            setShowReconnected(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (isOnline && !showReconnected) return null;

    return (
        <div className={`fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-2 text-sm font-bold transition-all duration-300 ${
            isOnline 
                ? 'bg-green-600/90 text-white' 
                : 'bg-red-600/90 text-white'
        }`}>
            {isOnline ? (
                <>
                    <Wifi className="w-4 h-4" />
                    Connection restored
                </>
            ) : (
                <>
                    <WifiOff className="w-4 h-4" />
                    You are offline — changes will sync when reconnected
                </>
            )}
        </div>
    );
};

export default ConnectionStatus;
