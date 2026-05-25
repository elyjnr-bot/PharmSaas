import { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Loader,
  Eye,
  Package,
} from 'lucide-react';
import {
  parseInventoryFileWithDebug,
  ParsedInventoryRow,
  ParseResult,
} from '../lib/inventoryParser';
import { performDeliveryImport, ImportStats } from '../lib/inventoryImporter';

interface ImportInventoryModalProps {
  onClose: () => void;
  onImportComplete: () => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

export default function ImportInventoryModal({
  onClose,
  onImportComplete,
}: ImportInventoryModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedInventoryRow[]>([]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setParseError(null);

    try {
      const result = await parseInventoryFileWithDebug(f);
      setParseResult(result);
      if (result.rows.length === 0) {
        setParseError(
          `Aucune ligne valide détectée. Colonnes trouvées: ${result.detectedColumns.join(', ')}`
        );
        return;
      }
      setParsedRows(result.rows);
      setStep('preview');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Erreur de lecture');
    }
  };

  const handleImport = async () => {
    setStep('importing');
    setImportError(null);

    try {
      const result = await performDeliveryImport(parsedRows, (current, total, message) => {
        setProgress({ current, total, message });
      });
      setStats(result);
      setStep('done');
      onImportComplete();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erreur inconnue');
      setStep('preview');
    }
  };

  const uniqueNames = new Set(parsedRows.map((r) => r.name.toLowerCase().trim())).size;
  const withBarcodes = parsedRows.filter((r) => r.barcode).length;
  const uniqueBarcodes = new Set(
    parsedRows.filter((r) => r.barcode).map((r) => r.barcode)
  ).size;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[999] flex items-end sm:items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== 'importing') onClose();
      }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center">
              <Package className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">
                Réception de livraison
              </h2>
              <p className="text-xs text-gray-500">Ajouter du stock existant</p>
            </div>
          </div>
          {step !== 'importing' && (
            <button
              onClick={onClose}
              className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center active:scale-95 transition-all"
            >
              <X className="w-3.5 h-3.5 text-gray-600" />
            </button>
          )}
        </div>

        <div className="p-5 flex-1">
          {step === 'upload' && (
            <>
              <div className="mb-4 p-3.5 bg-green-50 border border-green-100 rounded-xl">
                <p className="text-xs font-semibold text-green-800 mb-1.5">
                  Format attendu (colonnes strictes) :
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { col: 'Designation', desc: 'Nom du produit', required: true },
                    { col: 'Code_Barre', desc: 'Code EAN', required: false },
                    { col: 'PrixCession', desc: "Prix d'achat", required: false },
                    { col: 'PrixPublic', desc: 'Prix de vente', required: false },
                  ].map(({ col, desc, required }) => (
                    <div key={col} className="flex items-start gap-1.5">
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${
                          required
                            ? 'bg-green-200 text-green-900'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {col}
                      </span>
                      <span className="text-[11px] text-green-700">{desc}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-green-600 mt-2">
                  1 ligne = 1 unité ajoutée au stock existant.
                </p>
              </div>

              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-green-400 hover:bg-green-50/40 transition-all cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="w-10 h-10 text-gray-400 mx-auto mb-2.5" />
                <p className="text-sm font-semibold text-gray-700 mb-1">
                  Sélectionner un fichier
                </p>
                <p className="text-xs text-gray-500">
                  .csv, .xlsx, .xls
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {parseError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{parseError}</p>
                </div>
              )}
            </>
          )}

          {step === 'preview' && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Eye className="w-4 h-4 text-green-600" />
                <p className="text-sm font-semibold text-gray-800">{file?.name}</p>
              </div>

              <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <label className="block text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Date de reception
                </label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-[10px] text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-400/30 transition-all"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5 mb-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-200">
                  <p className="text-xl font-bold text-gray-900">{parsedRows.length}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Lignes</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
                  <p className="text-xl font-bold text-green-700">{uniqueNames}</p>
                  <p className="text-[11px] text-green-600 mt-0.5">Produits</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                  <p className="text-xl font-bold text-blue-700">{uniqueBarcodes}</p>
                  <p className="text-[11px] text-blue-600 mt-0.5">Codes-barres</p>
                </div>
              </div>

              {parseResult && (
                <div className="mb-3 p-2.5 bg-gray-50 border border-gray-200 rounded-xl">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Mapping</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">Nom:</span>
                      <span className={parseResult.mappedColumns.name ? 'text-green-700 font-medium' : 'text-red-600'}>
                        {parseResult.mappedColumns.name || 'X'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">Code:</span>
                      <span className={parseResult.mappedColumns.barcode ? 'text-green-700' : 'text-gray-400'}>
                        {parseResult.mappedColumns.barcode || '-'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[9px] text-gray-400 mt-1.5 truncate">
                    Fichier: {parseResult.detectedColumns.slice(0, 6).join(', ')}
                    {parseResult.detectedColumns.length > 6 && '...'}
                  </p>
                </div>
              )}

              <div className="mb-4">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Aperçu (5 premières lignes)
                </p>
                <div className="rounded-xl overflow-hidden border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-gray-600">
                          Désignation
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-gray-600">
                          Code
                        </th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-600">
                          Prix
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 5).map((row, i) => (
                        <tr
                          key={i}
                          className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}
                        >
                          <td className="px-3 py-2 text-gray-900 font-medium truncate max-w-[140px]">
                            {row.name}
                          </td>
                          <td className="px-3 py-2 text-gray-500 font-mono text-[10px]">
                            {row.barcode || (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700">
                            {row.sellingPrice > 0
                              ? row.sellingPrice.toLocaleString()
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length > 5 && (
                  <p className="text-[11px] text-gray-400 text-center mt-1.5">
                    +{parsedRows.length - 5} lignes supplémentaires
                  </p>
                )}
              </div>

              {withBarcodes < parsedRows.length && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                  <p className="text-xs text-blue-700">
                    <span className="font-semibold">
                      {parsedRows.length - withBarcodes} lignes
                    </span>{' '}
                    sans code-barres seront traitées par nom.
                  </p>
                </div>
              )}

              {importError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{importError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setStep('upload');
                    setParsedRows([]);
                    setParseResult(null);
                    setFile(null);
                    setImportError(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
                >
                  Changer
                </button>
                <button
                  onClick={handleImport}
                  disabled={stats !== null}
                  className="flex-1 py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {stats !== null ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Importation...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Importer
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {step === 'importing' && (
            <div className="py-4">
              <div className="flex items-center gap-3 mb-6">
                <Loader className="w-5 h-5 text-green-600 animate-spin flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    Import en cours...
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{progress.message}</p>
                </div>
              </div>

              <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{
                    width:
                      progress.total > 0
                        ? `${Math.round(
                            (progress.current / progress.total) * 100
                          )}%`
                        : '0%',
                  }}
                />
              </div>
              <p className="text-xs text-gray-400 text-center">
                {progress.current} / {progress.total}
              </p>
            </div>
          )}

          {step === 'done' && stats && (
            <>
              <div className="flex items-center justify-center mb-5">
                <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              </div>

              <div className={`grid gap-2.5 mb-4 ${stats.unitsCreated > 0 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
                  <p className="text-2xl font-bold text-green-700">{stats.created}</p>
                  <p className="text-xs text-green-600 mt-0.5">Crees</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
                  <p className="text-2xl font-bold text-blue-700">{stats.updated}</p>
                  <p className="text-xs text-blue-600 mt-0.5">Mis a jour</p>
                </div>
                {stats.unitsCreated > 0 && (
                  <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
                    <p className="text-2xl font-bold text-green-700">{stats.unitsCreated}</p>
                    <p className="text-xs text-green-600 mt-0.5">Unites</p>
                  </div>
                )}
                <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
                  <p className="text-2xl font-bold text-red-700">{stats.errors}</p>
                  <p className="text-xs text-red-600 mt-0.5">Erreurs</p>
                </div>
              </div>

              {stats.errorDetails && stats.errorDetails.length > 0 && (
                <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-[11px] font-semibold text-red-800 mb-1.5">Détails erreurs :</p>
                  <div className="space-y-0.5 max-h-24 overflow-y-auto">
                    {stats.errorDetails.slice(0, 3).map((detail, i) => (
                      <p key={i} className="text-[10px] text-red-700 font-mono truncate">{detail}</p>
                    ))}
                    {stats.errorDetails.length > 3 && (
                      <p className="text-[10px] text-red-500">+{stats.errorDetails.length - 3} (voir console)</p>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors"
              >
                Fermer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
