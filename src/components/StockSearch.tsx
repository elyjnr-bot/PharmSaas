import { useState, useEffect } from 'react';
import { Search, Package, Calendar, AlertTriangle } from 'lucide-react';
import { fetchAllMedications, Medication } from '../lib/supabase';

export default function StockSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [medications, setMedications] = useState<Medication[]>([]);
  const [filteredMedications, setFilteredMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMedications();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredMedications([]);
    } else {
      const filtered = medications.filter(med =>
        med.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (med.code_produit || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredMedications(filtered);
    }
  }, [searchQuery, medications]);

  const loadMedications = async () => {
    try {
      const data = await fetchAllMedications();
      setMedications(data);
    } catch (error) {
      console.error('Error loading medications:', error);
    } finally {
      setLoading(false);
    }
  };

  const isExpiringSoon = (expiryDate: string) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 30 && diffDays > 0;
  };

  const isExpired = (expiryDate: string) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    return expiry < today;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="pb-20 px-1 pt-4">
      <div>
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Recherche de Stock</h1>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par nom ou code-barres..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Chargement...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {searchQuery.trim() === '' ? (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Saisissez un nom ou un code-barres pour rechercher</p>
              </div>
            ) : filteredMedications.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Aucun médicament trouvé</p>
              </div>
            ) : (
              filteredMedications.map((med) => {
                const expired = isExpired(med.expiry_date);
                const expiringSoon = isExpiringSoon(med.expiry_date);
                const lowStock = med.quantity < 10;

                return (
                  <div
                    key={med.id}
                    className={`bg-white rounded-lg shadow-sm p-4 border-l-4 ${
                      expired
                        ? 'border-red-500'
                        : expiringSoon
                        ? 'border-orange-500'
                        : lowStock
                        ? 'border-yellow-500'
                        : 'border-green-500'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 text-lg">{med.name}</h3>
                        <p className="text-sm text-gray-500">Code: {med.barcode}</p>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${
                          med.quantity === 0
                            ? 'text-red-600'
                            : lowStock
                            ? 'text-orange-600'
                            : 'text-green-600'
                        }`}>
                          {med.quantity}
                        </div>
                        <p className="text-xs text-gray-500">unités</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-gray-600">
                        <Calendar className="w-4 h-4" />
                        <span>Exp: {formatDate(med.expiry_date)}</span>
                      </div>
                      <div className="font-semibold text-gray-900">
                        {med.price.toFixed(2)} FCFA
                      </div>
                    </div>

                    {(expired || expiringSoon || lowStock) && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className={`w-4 h-4 mt-0.5 ${
                            expired ? 'text-red-500' : expiringSoon ? 'text-orange-500' : 'text-yellow-500'
                          }`} />
                          <div className="text-sm">
                            {expired && (
                              <span className="text-red-600 font-medium">Produit expiré</span>
                            )}
                            {!expired && expiringSoon && (
                              <span className="text-orange-600 font-medium">Expire bientôt (moins de 30 jours)</span>
                            )}
                            {!expired && !expiringSoon && lowStock && (
                              <span className="text-yellow-600 font-medium">Stock faible (moins de 10 unités)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
