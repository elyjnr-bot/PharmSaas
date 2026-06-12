import SyncIndicator from './SyncIndicator';
import AlertsBell from './AlertsBell';
import { useUserSettings } from '../lib/userSettings';
import { LogoIcon } from './LogoIcon';

interface HeaderProps {
  onSettingsClick: () => void;
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
          <LogoIcon size={32} />
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
