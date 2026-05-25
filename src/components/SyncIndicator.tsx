import { CloudOff, Cloud, Upload, RefreshCw, WifiOff } from 'lucide-react';
import { useSyncManager } from '../lib/syncManager';

export default function SyncIndicator() {
  const { syncStatus, isOnline, unsyncedCount, syncNow } = useSyncManager();

  if (syncStatus === 'offline') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 border border-red-200">
        <WifiOff className="w-3.5 h-3.5 text-red-600" />
        <span className="text-xs font-semibold text-red-700">Hors ligne</span>
        {unsyncedCount > 0 && (
          <span className="text-xs font-bold text-red-600 bg-red-200 rounded-full px-1.5 leading-4">
            {unsyncedCount}
          </span>
        )}
      </div>
    );
  }

  if (syncStatus === 'syncing') {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
        style={{ background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.2)' }}
      >
        <div className="relative w-3.5 h-3.5 flex items-center justify-center">
          <span
            className="absolute inset-0 rounded-full animate-pulse-ring"
            style={{ background: 'rgba(13,148,136,0.35)' }}
          />
          <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: '#0d9488' }} />
        </div>
        <span className="text-xs font-medium" style={{ color: '#0f766e' }}>Sync...</span>
      </div>
    );
  }

  if (syncStatus === 'pending') {
    return (
      <button
        onClick={syncNow}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 hover:bg-amber-100 active:scale-95 transition-all"
        title="Cliquer pour synchroniser"
      >
        <div className="relative">
          <Upload className="w-3.5 h-3.5 text-amber-600" />
          <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        </div>
        <span className="text-xs font-semibold text-amber-700">
          {unsyncedCount} en attente
        </span>
      </button>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{ background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)' }}
    >
      <Cloud className="w-3.5 h-3.5" style={{ color: '#059669' }} />
      <span className="text-xs font-medium" style={{ color: '#047857' }}>Synchronise</span>
    </div>
  );
}
