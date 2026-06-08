import SyncIndicator from './SyncIndicator';
import AlertsBell from './AlertsBell';
import { useUserSettings } from '../lib/userSettings';

interface HeaderProps {
  onSettingsClick: () => void;
}

function HexagonLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 1L29.856 8.5V23.5L16 31L2.144 23.5V8.5L16 1Z"
        fill="#059669"
      />
      <path
        d="M16 8C16 8 12 14 12 18C12 20.2 13.8 22 16 22C18.2 22 20 20.2 20 18C20 14 16 8 16 8Z"
        fill="white"
        stroke="white"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      <line x1="16" y1="22" x2="16" y2="25" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function SettingsGearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="3.5" stroke="#64748b" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="8" stroke="#64748b" strokeWidth="1.5" strokeDasharray="2 4.56" />
    </svg>
  );
}

export default function Header({ onSettingsClick }: HeaderProps) {
  const { settings } = useUserSettings();
  const pharmacyName = settings.pharmacy_name && settings.pharmacy_name !== 'Ma Pharmacie'
    ? settings.pharmacy_name
    : null;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 glass-white safe-area-top"
    >
      <div className="flex items-center justify-between px-4 h-[56px]">
        <div className="flex-shrink-0">
          <SyncIndicator />
        </div>

        <div className="flex items-center gap-2">
          <HexagonLogo />
          <h1 style={{ fontSize: '1.15rem', letterSpacing: '-0.03em', lineHeight: 1, fontFamily: 'Inter, sans-serif', fontWeight: 800 }}>
            {pharmacyName ? (
              <span className="text-slate-900">{pharmacyName}</span>
            ) : (
              <>
                <span className="text-slate-900">Jungle</span>
                <span className="text-emerald-600">Pharm</span>
              </>
            )}
          </h1>
        </div>

        <div className="flex items-center gap-1">
          <AlertsBell size={16} iconColor="#64748b" />
          <button
            onClick={onSettingsClick}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-all duration-150 active:scale-90 hover:bg-slate-100"
          >
            <SettingsGearIcon />
          </button>
        </div>
      </div>
    </header>
  );
}
