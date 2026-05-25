import { useState, useEffect, useRef } from 'react';
import { Search, Link, CheckCircle, AlertCircle, X, Plus, Loader2 } from 'lucide-react';
import { supabase, Medication } from '../lib/supabase';
import { upsertWithUserId, updateWithUserId } from '../lib/supabaseHelpers';
import { barcodeCache } from '../lib/barcodeCache';

interface Props {
  code: string;
  gtin?: string;
  lot?: string;
  onLink: (medication: Medication) => void;
  onDismiss: () => void;
  onCreateNew?: () => void;
}

export default function InlineScanLink({ code, gtin, lot, onLink, onDismiss, onCreateNew }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Medication[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 150);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      const { data } = await supabase
        .from('medications')
        .select('*')
        .or(`name.ilike.%${q}%,code_produit.ilike.%${q}%`)
        .order('name')
        .limit(15);
      setResults(data || []);
      setIsSearching(false);
    }, 280);
  }, [query]);

  const handleSelect = async (med: Medication) => {
    if (linkingId) return;
    setLinkingId(med.id);
    setError('');

    try {
      const barcodeValue = gtin || code;

      await upsertWithUserId(
        'barcodes',
        { barcode: barcodeValue, medication_id: med.id, code_produit: med.code_produit },
        { onConflict: 'barcode', ignoreDuplicates: false }
      );

      if (gtin && gtin !== code) {
        await upsertWithUserId(
          'barcodes',
          { barcode: code, medication_id: med.id, code_produit: med.code_produit },
          { onConflict: 'barcode', ignoreDuplicates: false }
        );
      }

      if (gtin && !med.gtin) {
        await updateWithUserId('medications', { gtin }, { id: med.id });
      }

      const cacheEntries: { barcode: string; medicationId: string }[] = [
        { barcode: barcodeValue, medicationId: med.id },
      ];
      if (gtin && gtin !== code) {
        cacheEntries.push({ barcode: code, medicationId: med.id });
      }
      barcodeCache.setMultiple(cacheEntries);

      onLink(med);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la liaison');
      setLinkingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onDismiss} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88vh]">

        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 p-2 rounded-xl">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">Produit inconnu</h2>
              <p className="text-xs text-gray-500">Tapez le nom pour le lier...</p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mx-5 mb-3 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
          <p className="font-mono text-xs text-gray-600 break-all leading-relaxed">{code}</p>
          {(gtin || lot) && (
            <div className="flex gap-3 mt-1">
              {gtin && <span className="text-xs text-blue-700 font-semibold">GTIN: {gtin}</span>}
              {lot && <span className="text-xs text-gray-500">Lot: {lot}</span>}
            </div>
          )}
        </div>

        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Nom du médicament..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 min-h-0">
          {isSearching && (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          )}

          {!isSearching && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-center py-6 text-gray-400 text-sm">Aucun médicament trouvé</p>
          )}

          {query.trim().length < 2 && (
            <p className="text-center py-4 text-gray-400 text-xs">Tapez au moins 2 caractères</p>
          )}

          <div className="space-y-2 pb-2">
            {results.map((med) => {
              const isLinking = linkingId === med.id;
              return (
                <button
                  key={med.id}
                  onClick={() => handleSelect(med)}
                  disabled={!!linkingId}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all active:scale-[0.98] ${
                    isLinking
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-100 bg-white hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{med.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{med.dosage} · {med.code_produit}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <p className={`text-sm font-bold ${med.quantity === 0 ? 'text-red-500' : 'text-gray-700'}`}>
                          {med.quantity}
                        </p>
                        <p className="text-xs text-gray-400">stock</p>
                      </div>
                      {isLinking ? (
                        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                      ) : (
                        <Link className="w-4 h-4 text-gray-300" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mx-5 mb-2 flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="px-5 pb-6 pt-3 flex gap-2 border-t border-gray-100">
          {onCreateNew && (
            <button
              onClick={onCreateNew}
              disabled={!!linkingId}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              Créer une fiche
            </button>
          )}
          <button
            onClick={onDismiss}
            disabled={!!linkingId}
            className="flex-1 py-3 border-2 border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-40"
          >
            Ignorer
          </button>
        </div>
      </div>
    </div>
  );
}
