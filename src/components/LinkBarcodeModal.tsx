import { useState, useEffect, useRef } from 'react';
import { X, Search, Link, CheckCircle, AlertCircle, Zap } from 'lucide-react';
import { supabase, Medication } from '../lib/supabase';
import { barcodeCache } from '../lib/barcodeCache';
import { findProductByNameFuzzy, linkBarcodeToProduct, searchProductsByName, db } from '../lib/db';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rawCode: string;
  gtin?: string;
  lot?: string;
  onSuccess: (medication: Medication) => void;
}

export default function LinkBarcodeModal({ isOpen, onClose, rawCode, gtin, lot, onSuccess }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Medication[]>([]);
  const [matchScores, setMatchScores] = useState<Map<string, number>>(new Map());
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<Medication | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelected(null);
      setSuccess(false);
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setMatchScores(new Map());
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);

      try {
        if (isOnline) {
          const { data } = await supabase
            .from('medications')
            .select('*')
            .or(`name.ilike.%${query}%,code_produit.ilike.%${query}%`)
            .order('name')
            .limit(20);
          setResults(data || []);
          setMatchScores(new Map());
        } else {
          const localResults = await searchProductsByName(query, 20);
          const medications: Medication[] = localResults.map((p) => ({
            id: p.id,
            name: p.name,
            dosage: p.dosage,
            price: p.price,
            wholesale_price: p.wholesale_price,
            quantity: p.quantity,
            minimum_stock: 10,
            barcode: p.barcode,
            code_produit: p.code_produit,
            batch_number: p.batch_number || '',
            expiry_date: p.expiry_date,
            forme_produit: p.forme_produit,
            name_rayon: p.name_rayon,
            created_at: p.updated_at,
          }));
          setResults(medications);
          setMatchScores(new Map());
        }

        const fuzzyResults = await findProductByNameFuzzy(query, 0.7);
        const scores = new Map<string, number>();
        fuzzyResults.forEach((r) => {
          scores.set(r.product.id, r.score);
        });
        setMatchScores(scores);
      } catch (err) {
        console.error('Search error:', err);
      }

      setIsSearching(false);
    }, 300);
  }, [query, isOnline]);

  const handleLink = async () => {
    if (!selected) return;
    setIsLinking(true);
    setError('');

    try {
      const barcodeValue = gtin || rawCode;
      const matchScore = matchScores.get(selected.id) || 0.5;

      await linkBarcodeToProduct(
        barcodeValue,
        selected.id,
        selected.name,
        matchScore
      );

      if (gtin && gtin !== rawCode) {
        await linkBarcodeToProduct(
          rawCode,
          selected.id,
          selected.name,
          matchScore
        );
      }

      if (isOnline) {
        const { error: barcodeErr } = await supabase
          .from('barcodes')
          .upsert(
            { barcode: barcodeValue, medication_id: selected.id, code_produit: selected.code_produit },
            { onConflict: 'barcode', ignoreDuplicates: false }
          );
        if (barcodeErr) throw barcodeErr;

        if (gtin && gtin !== rawCode) {
          await supabase
            .from('barcodes')
            .upsert(
              { barcode: rawCode, medication_id: selected.id, code_produit: selected.code_produit },
              { onConflict: 'barcode', ignoreDuplicates: false }
            );
        }

        if (gtin && !selected.gtin) {
          await supabase
            .from('medications')
            .update({ gtin })
            .eq('id', selected.id);
        }

        await db.barcodeLinks.update(barcodeValue, { synced: true });
        if (gtin && gtin !== rawCode) {
          await db.barcodeLinks.update(rawCode, { synced: true });
        }
      }

      const cacheEntries = [{ barcode: barcodeValue, medicationId: selected.id }];
      if (gtin && gtin !== rawCode) {
        cacheEntries.push({ barcode: rawCode, medicationId: selected.id });
      }
      barcodeCache.setMultiple(cacheEntries);

      setSuccess(true);
      setTimeout(() => {
        onSuccess(selected);
        onClose();
      }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la liaison');
    } finally {
      setIsLinking(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="bg-blue-100 p-1.5 rounded-lg">
              <Link className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Lier à un produit existant</h2>
              <p className="text-xs text-gray-500">Associez ce code à un médicament du catalogue</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Code scanné</p>
          <p className="font-mono text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 break-all text-gray-800 leading-relaxed">{rawCode}</p>
          {(gtin || lot) && (
            <div className="flex gap-4 mt-2">
              {gtin && <span className="text-xs text-blue-700 font-semibold">GTIN: {gtin}</span>}
              {lot && <span className="text-xs text-gray-600">Lot: {lot}</span>}
            </div>
          )}
        </div>

        <div className="px-5 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Rechercher un médicament par nom ou code..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {isSearching && (
            <div className="text-center py-6">
              <div className="animate-spin w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
            </div>
          )}

          {!isSearching && query.length >= 2 && results.length === 0 && (
            <div className="text-center py-6 text-gray-400 text-sm">Aucun médicament trouvé</div>
          )}

          {results.map((med) => {
            const matchScore = matchScores.get(med.id);
            const isHighMatch = matchScore && matchScore >= 0.8;

            return (
              <button
                key={med.id}
                onClick={() => setSelected(med)}
                className={`w-full text-left px-4 py-3 rounded-xl mb-2 border-2 transition-all ${
                  selected?.id === med.id
                    ? 'border-blue-500 bg-blue-50'
                    : isHighMatch
                    ? 'border-green-300 bg-green-50 hover:border-green-400'
                    : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 text-sm">{med.name}</p>
                      {isHighMatch && (
                        <div className="flex items-center gap-1 bg-green-600 text-white px-2 py-0.5 rounded-full text-xs font-bold">
                          <Zap className="w-3 h-3" />
                          {Math.round(matchScore * 100)}%
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{med.dosage} · {med.code_produit}</p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-xs text-gray-500">Stock</p>
                    <p className={`text-sm font-bold ${med.quantity === 0 ? 'text-red-600' : 'text-gray-700'}`}>{med.quantity}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mx-5 mb-3 flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="mx-5 mb-3 flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <p className="text-sm font-semibold">Code lié avec succès !</p>
          </div>
        )}

        <div className="px-5 pb-6 pt-2 flex gap-3">
          <button
            onClick={handleLink}
            disabled={!selected || isLinking || success}
            className="flex-1 bg-blue-600 text-white py-4 rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            {isLinking ? (
              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <>
                <Link className="w-5 h-5" />
                Lier ce code à {selected ? selected.name : '...'}
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-4 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 active:scale-95 transition-all text-sm"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
