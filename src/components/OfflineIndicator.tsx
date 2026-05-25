import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Cloud, CloudOff } from 'lucide-react';

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [isSynced, setIsSynced] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setIsSynced(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setIsOnline(navigator.onLine);

    const syncInterval = setInterval(() => {
      if (navigator.onLine) {
        setIsSynced(Math.random() > 0.1);
      }
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(syncInterval);
    };
  }, []);

  if (isOnline && isSynced) {
    return (
      <div className="fixed top-3 left-3 z-50 w-7 h-7 bg-green-50 rounded-full flex items-center justify-center shadow-sm">
        <Cloud className="w-3.5 h-3.5 text-green-600" strokeWidth={2} />
      </div>
    );
  }

  if (isOnline && !isSynced) {
    return (
      <div className="fixed top-3 left-3 z-50 w-7 h-7 bg-amber-50 rounded-full flex items-center justify-center shadow-sm">
        <Cloud className="w-3.5 h-3.5 text-amber-600 animate-pulse" strokeWidth={2} />
      </div>
    );
  }

  return (
    <div className="fixed top-3 left-3 z-50 w-7 h-7 bg-red-50 rounded-full flex items-center justify-center shadow-sm">
      <CloudOff className="w-3.5 h-3.5 text-red-600" strokeWidth={2} />
    </div>
  );
}
