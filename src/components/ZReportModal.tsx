import { useState, useMemo } from 'react';
import { X, Share2, AlertTriangle, TrendingUp, Package, Check, Clock } from 'lucide-react';
import { Medication } from '../lib/supabase';
import { SalesJournalEntry } from '../lib/offlineStorage';

interface ZReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: SalesJournalEntry[];
  medications: Medication[];
  date: Date;
  onConfirmClosure?: () => Promise<void>;
}

export default function ZReportModal({ isOpen, onClose, entries, medications, date, onConfirmClosure }: ZReportModalProps) {
  const [step, setStep] = useState<'confirm' | 'report'>('confirm');
  const [isSharing, setIsSharing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const totalRevenue = useMemo(() => {
    return entries.reduce((sum, e) => sum + e.total_price, 0);
  }, [entries]);

  const totalItems = useMemo(() => {
    return entries.reduce((sum, e) => sum + e.quantity_sold, 0);
  }, [entries]);

  const salesCount = entries.length;

  const lowStockItems = useMemo(() => {
    return medications.filter(med => med.quantity <= med.minimum_stock && med.quantity > 0);
  }, [medications]);

  const outOfStockItems = useMemo(() => {
    return medications.filter(med => med.quantity === 0);
  }, [medications]);

  const bySeller = useMemo(() => {
    const map: Record<string, number> = {};
    entries.forEach(e => {
      const key = e.seller_name || 'Non attribue';
      map[key] = (map[key] || 0) + e.total_price;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const topProducts = useMemo(() => {
    const productSales: Record<string, { name: string; dosage: string; quantity: number; revenue: number }> = {};

    entries.forEach(entry => {
      const key = entry.medication_id;
      if (!productSales[key]) {
        productSales[key] = {
          name: entry.medication_name,
          dosage: entry.dosage || '',
          quantity: 0,
          revenue: 0
        };
      }
      productSales[key].quantity += entry.quantity_sold;
      productSales[key].revenue += entry.total_price;
    });

    return Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);
  }, [entries]);

  const formatDate = (d: Date) => {
    return d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = () => {
    return new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const generateReportText = () => {
    const separator = `--------------------`;

    let text = `📊 *RAPPORT Z - CLOTURE DE JOURNEE*\n`;
    text += `📅 ${formatDate(date)}\n`;
    text += `🕐 Cloture a ${formatTime()}\n\n`;

    text += `${separator}\n`;
    text += `💰 *CHIFFRE D'AFFAIRES*\n`;
    text += `${separator}\n\n`;
    text += `💵 Total: *${totalRevenue.toLocaleString()} FCFA*\n`;
    text += `🛒 Ventes: ${salesCount}\n`;
    text += `📦 Articles vendus: ${totalItems}\n\n`;

    if (bySeller.length > 1 || (bySeller.length === 1 && bySeller[0][0] !== 'Non attribue')) {
      text += `${separator}\n`;
      text += `👥 *CA PAR VENDEUR*\n`;
      text += `${separator}\n\n`;
      bySeller.forEach(([name, revenue]) => {
        text += `👤 ${name}: *${revenue.toLocaleString()} FCFA*\n`;
      });
      text += `\n`;
    }

    if (topProducts.length > 0) {
      text += `${separator}\n`;
      text += `🏆 *TOP 3 DES VENTES*\n`;
      text += `${separator}\n\n`;
      topProducts.forEach((product, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
        text += `${medal} ${product.name} ${product.dosage}\n`;
        text += `    ${product.quantity} vendus - ${product.revenue.toLocaleString()} FCFA\n`;
      });
      text += `\n`;
    }

    text += `${separator}\n`;
    if (lowStockItems.length > 0 || outOfStockItems.length > 0) {
      text += `⚠️ *ALERTES STOCK*\n`;
      text += `${separator}\n\n`;
      if (outOfStockItems.length > 0) {
        text += `🚫 *Rupture (${outOfStockItems.length}):*\n`;
        outOfStockItems.slice(0, 5).forEach(med => {
          text += `   ❌ ${med.name} ${med.dosage}\n`;
        });
        if (outOfStockItems.length > 5) {
          text += `   ... et ${outOfStockItems.length - 5} autres\n`;
        }
        text += `\n`;
      }
      if (lowStockItems.length > 0) {
        text += `📉 *Stock bas (${lowStockItems.length}):*\n`;
        lowStockItems.slice(0, 5).forEach(med => {
          text += `   ⚡ ${med.name} ${med.dosage}: ${med.quantity}/${med.minimum_stock}\n`;
        });
        if (lowStockItems.length > 5) {
          text += `   ... et ${lowStockItems.length - 5} autres\n`;
        }
      }
    } else {
      text += `📦 *STOCK*\n`;
      text += `${separator}\n\n`;
      text += `✅ Aucune alerte\n`;
    }

    text += `\n${separator}\n`;
    text += `_🌿 JunglePharm_`;
    return text;
  };

  const handleShareWhatsApp = async () => {
    setIsSharing(true);
    const text = encodeURIComponent(generateReportText());
    const whatsappUrl = `https://wa.me/?text=${text}`;
    window.open(whatsappUrl, '_blank');

    setTimeout(async () => {
      setIsSharing(false);
      if (onConfirmClosure) {
        setIsClosing(true);
        try {
          await onConfirmClosure();
          onClose();
        } catch (error) {
          console.error('Erreur lors de la cloture:', error);
          alert('Erreur lors de la cloture de la journee');
          setIsClosing(false);
        }
      }
    }, 2000);
  };

  const handleConfirmClose = () => {
    setStep('report');
  };

  const handleClose = () => {
    setStep('confirm');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white z-[60] flex flex-col">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 bg-green-600 px-4 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {step === 'confirm' ? 'Cloture de journee' : 'Rapport Z'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>

        {step === 'confirm' ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ minHeight: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Confirmer la cloture</h3>
              <p className="text-gray-600">
                Vous etes sur le point de generer le rapport de fin de journee pour le{' '}
                <span className="font-semibold">{formatDate(date)}</span>.
              </p>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Chiffre d'affaires</span>
                <span className="font-bold text-green-600">{totalRevenue.toLocaleString()} FCFA</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Nombre de ventes</span>
                <span className="font-bold text-gray-900">{salesCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Alertes stock</span>
                <span className={`font-bold ${lowStockItems.length + outOfStockItems.length > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {lowStockItems.length + outOfStockItems.length}
                </span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  Cette action generera un rapport detaille que vous pourrez partager avec le Manager via WhatsApp.
                </p>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 bg-white border-t border-gray-100 p-4 pb-8 sticky bottom-0 z-10">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleClose}
                className="py-4 px-4 bg-gray-100 text-gray-700 rounded-2xl font-semibold hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmClose}
                className="py-4 px-4 bg-green-600 text-white rounded-2xl font-semibold hover:bg-green-700 transition-colors"
              >
                Generer le rapport
              </button>
            </div>
          </div>
        </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32" style={{ minHeight: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div className="bg-green-600 rounded-2xl p-5 text-white">
                <div className="flex items-center justify-between mb-4">
                  <div style={{ minHeight: 'auto' }}>
                    <p className="text-sm opacity-80 capitalize">{formatDate(date)}</p>
                    <p className="text-xs opacity-60">Cloture a {formatTime()}</p>
                  </div>
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                </div>

                <div className="text-center py-4" style={{ minHeight: 'auto' }}>
                  <p className="text-sm opacity-80 mb-1">Chiffre d'affaires</p>
                  <p className="text-4xl font-bold">{totalRevenue.toLocaleString()}</p>
                  <p className="text-sm opacity-80">FCFA</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/20">
                  <div className="text-center" style={{ minHeight: 'auto' }}>
                    <p className="text-2xl font-bold">{salesCount}</p>
                    <p className="text-xs opacity-80">ventes</p>
                  </div>
                  <div className="text-center" style={{ minHeight: 'auto' }}>
                    <p className="text-2xl font-bold">{totalItems}</p>
                    <p className="text-xs opacity-80">articles</p>
                  </div>
                </div>
              </div>

              {bySeller.length > 0 && !(bySeller.length === 1 && bySeller[0][0] === 'Non attribue') && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="text-base">👥</span>
                      <h3 className="font-semibold text-gray-800">CA par vendeur</h3>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {bySeller.map(([name, revenue]) => (
                      <div key={name} className="px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-bold text-green-700">{name.charAt(0).toUpperCase()}</span>
                          </div>
                          <span className="font-medium text-gray-900">{name}</span>
                        </div>
                        <span className="font-bold text-green-700">{revenue.toLocaleString()} FCFA</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(outOfStockItems.length > 0 || lowStockItems.length > 0) && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-orange-50">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-600" />
                      <h3 className="font-semibold text-orange-800">Alertes Stock</h3>
                      <span className="ml-auto bg-orange-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {outOfStockItems.length + lowStockItems.length}
                      </span>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
                    {outOfStockItems.map((med) => (
                      <div key={med.id} className="px-4 py-3 bg-red-50">
                        <div className="flex items-center justify-between">
                          <div style={{ minHeight: 'auto' }}>
                            <p className="font-medium text-gray-900">{med.name} {med.dosage}</p>
                            <p className="text-xs text-gray-500">Seuil: {med.minimum_stock}</p>
                          </div>
                          <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-lg">
                            RUPTURE
                          </span>
                        </div>
                      </div>
                    ))}
                    {lowStockItems.map((med) => (
                      <div key={med.id} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div style={{ minHeight: 'auto' }}>
                            <p className="font-medium text-gray-900">{med.name} {med.dosage}</p>
                            <p className="text-xs text-gray-500">Seuil: {med.minimum_stock}</p>
                          </div>
                          <div className="text-right">
                            <span className="bg-orange-100 text-orange-700 text-sm font-bold px-2 py-1 rounded-lg">
                              {med.quantity}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {outOfStockItems.length === 0 && lowStockItems.length === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-green-600" />
                    </div>
                    <div style={{ minHeight: 'auto' }}>
                      <p className="font-semibold text-green-800">Stock OK</p>
                      <p className="text-sm text-green-600">Aucune rupture ou stock bas detecte</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 bg-white border-t border-gray-100 p-4 pb-8 space-y-2 sticky bottom-0 z-10">
              <button
                onClick={handleShareWhatsApp}
                disabled={isSharing || isClosing}
                className="w-full bg-green-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg flex items-center justify-center gap-3"
              >
                <Share2 className="w-6 h-6" />
                {isSharing ? 'Ouverture WhatsApp...' : isClosing ? 'Clôture en cours...' : 'Partager sur WhatsApp'}
              </button>

              <button
                onClick={handleClose}
                disabled={isSharing || isClosing}
                className="w-full bg-gray-100 text-gray-700 py-3 rounded-2xl font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
