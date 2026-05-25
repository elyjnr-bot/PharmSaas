import { MapPin, Check, User } from 'lucide-react';
import { useAuth } from '../lib/auth';

interface PharmacyIndicatorProps {
  pharmacyName?: string;
}

export default function PharmacyIndicator({ pharmacyName = 'Brazzaville' }: PharmacyIndicatorProps) {
  const { profile } = useAuth();

  return (
    <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between gap-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          <span className="text-sm font-medium">Pharmacie : {pharmacyName}</span>
        </div>
        <div className="h-4 w-px bg-blue-400"></div>
        <div className="flex items-center gap-1.5">
          <Check className="w-4 h-4" />
          <span className="text-sm">Stock à jour</span>
        </div>
      </div>
      {profile && (
        <div className="flex items-center gap-2">
          <User className="w-4 h-4" />
          <span className="text-xs font-medium">
            {profile.role === 'manager' ? 'Gérant' : 'Vendeur'}
          </span>
        </div>
      )}
    </div>
  );
}
