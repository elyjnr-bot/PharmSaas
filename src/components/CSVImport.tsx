import { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader,
  AlertTriangle,
  X,
  Eye,
} from 'lucide-react';
import {
  parseInventoryFileWithDebug,
  ParsedInventoryRow,
  ParseResult,
} from '../lib/inventoryParser';
import { performInstallationImport, ImportStats } from '../lib/inventoryImporter';

type Step = 'upload' | 'preview' | 'confirm' | 'importing' | 'done';

export default function CSVImport() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedInventoryRow[]>([]);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: '' });
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
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
      const result = await performInstallationImport(
        parsedRows,
        (current, total, message) => {
          setProgress({ current, total, message });
        }
      );
      setStats(result);
      setStep('done');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erreur inconnue');
      setStep('confirm');
    }
  };

  const reset = () => {
    setStep('upload');
    setFile(null);
    setParsedRows([]);
    setParseResult(null);
    setParseError(null);
    setStats(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const withBarcodes = parsedRows.filter((r) => r.barcode).length;
  const uniqueNames = new Set(parsedRows.map((r) => r.name.toLowerCase().trim())).size;
  const uniqueBarcodes = new Set(
    parsedRows.filter((r) => r.barcode).map((r) => r.barcode)
  ).size;

  if (step === 'upload') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-green-50 p-2.5 rounded-xl">
            <Upload className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Import Inventaire — Mode Installation
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Réinitialise la base et importe le fichier complet
            </p>
          </div>
        </div>

        <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 space-y-1">
              <p className="font-semibold">Format attendu (colonnes strictes) :</p>
              <ul className="space-y-0.5 ml-1">
                <li>
                  <span className="font-mono bg-amber-100 px-1 rounded">Designation</span>{' '}
                  → Nom du produit{' '}
                  <span className="text-amber-600">(obligatoire)</span>
                </li>
                <li>
                  <span className="font-mono bg-amber-100 px-1 rounded">Code_Barre</span>{' '}
                  → Code EAN
                </li>
                <li>
                  <span className="font-mono bg-amber-100 px-1 rounded">PrixCession</span>{' '}
                  → Prix d'achat
                </li>
                <li>
                  <span className="font-mono bg-amber-100 px-1 rounded">PrixPublic</span>{' '}
                  → Prix de vente
                </li>
              </ul>
              <p className="text-amber-700 mt-1">
                1 ligne = 1 unité. Pas de colonne Quantité nécessaire.
              </p>
            </div>
          </div>
        </div>

        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center hover:border-green-400 hover:bg-green-50/40 transition-all cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700 mb-1">
            Glisser un fichier ou cliquer ici
          </p>
          <p className="text-xs text-gray-500">Formats acceptés : .csv, .xlsx, .xls</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {parseError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{parseError}</p>
          </div>
        )}
      </div>
    );
  }

  if (step === 'preview') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="bg-green-50 p-2.5 rounded-xl">
              <Eye className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Aperçu du fichier
              </h3>
              <p className="text-xs text-gray-500">{file?.name}</p>
            </div>
          </div>
          <button
            onClick={reset}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-200">
            <p className="text-2xl font-bold text-gray-900">{parsedRows.length}</p>
            <p className="text-xs text-gray-600 mt-0.5">Lignes lues</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
            <p className="text-2xl font-bold text-green-700">{uniqueNames}</p>
            <p className="text-xs text-green-600 mt-0.5">Produits uniques</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
            <p className="text-2xl font-bold text-blue-700">{uniqueBarcodes}</p>
            <p className="text-xs text-blue-600 mt-0.5">Codes-barres</p>
          </div>
        </div>

        {parseResult && (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Mapping des colonnes
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Designation:</span>
                <span className={parseResult.mappedColumns.name ? 'text-green-700 font-medium' : 'text-red-600'}>
                  {parseResult.mappedColumns.name || 'Non trouvée'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Code_Barre:</span>
                <span className={parseResult.mappedColumns.barcode ? 'text-green-700 font-medium' : 'text-gray-400'}>
                  {parseResult.mappedColumns.barcode || '(optionnel)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">PrixCession:</span>
                <span className={parseResult.mappedColumns.buyingPrice ? 'text-green-700 font-medium' : 'text-gray-400'}>
                  {parseResult.mappedColumns.buyingPrice || '(optionnel)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">PrixPublic:</span>
                <span className={parseResult.mappedColumns.sellingPrice ? 'text-green-700 font-medium' : 'text-gray-400'}>
                  {parseResult.mappedColumns.sellingPrice || '(optionnel)'}
                </span>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Colonnes fichier: {parseResult.detectedColumns.slice(0, 8).join(', ')}
              {parseResult.detectedColumns.length > 8 && ` (+${parseResult.detectedColumns.length - 8})`}
            </p>
          </div>
        )}

        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            Aperçu (5 premières lignes)
          </p>
          <div className="rounded-xl overflow-hidden border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">
                    Designation
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-600">
                    Code_Barre
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-600">
                    PrixCession
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-600">
                    PrixPublic
                  </th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 5).map((row, i) => (
                  <tr
                    key={i}
                    className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}
                  >
                    <td className="px-3 py-2 text-gray-900 font-medium truncate max-w-[160px]">
                      {row.name}
                    </td>
                    <td className="px-3 py-2 text-gray-500 font-mono">
                      {row.barcode || (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {row.buyingPrice > 0 ? row.buyingPrice.toLocaleString() : '—'}
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
            <p className="text-xs text-gray-400 text-center mt-2">
              +{parsedRows.length - 5} lignes supplémentaires
            </p>
          )}
        </div>

        {withBarcodes < parsedRows.length && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs text-blue-700">
              <span className="font-semibold">{parsedRows.length - withBarcodes} lignes</span> sans
              code-barres seront regroupées par nom de produit.
            </p>
          </div>
        )}

        <button
          onClick={() => setStep('confirm')}
          className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors"
        >
          Continuer vers la confirmation
        </button>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-red-50 p-2.5 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">
              Confirmer la réinitialisation
            </h3>
            <p className="text-xs text-gray-500">Action irréversible</p>
          </div>
        </div>

        <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl space-y-2">
          <p className="text-sm font-semibold text-red-800">
            Cette action va :
          </p>
          <ul className="text-xs text-red-700 space-y-1 ml-2">
            <li>• Supprimer tous les produits existants en base</li>
            <li>• Supprimer tous les codes-barres enregistrés</li>
            <li>• Effacer le cache local (IndexedDB)</li>
            <li>
              • Importer{' '}
              <strong>{uniqueNames} produits</strong> depuis{' '}
              <strong>{parsedRows.length} lignes</strong>
            </li>
          </ul>
        </div>

        {importError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{importError}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setStep('preview')}
            className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleImport}
            className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 transition-colors"
          >
            Réinitialiser et importer
          </button>
        </div>
      </div>
    );
  }

  if (step === 'importing') {
    const pct =
      progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : 0;

    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-green-50 p-2.5 rounded-xl">
            <Loader className="w-5 h-5 text-green-600 animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Import en cours</h3>
            <p className="text-xs text-gray-500">{progress.message}</p>
          </div>
        </div>

        <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
          <div
            className="bg-green-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 text-center">
          {progress.current} / {progress.total} —{' '}
          <span className="font-semibold">{pct}%</span>
        </p>
      </div>
    );
  }

  if (step === 'done' && stats) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="bg-green-50 p-2.5 rounded-xl">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">Import terminé</h3>
            <p className="text-xs text-gray-500">Base de données réinitialisée</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
            <p className="text-2xl font-bold text-green-700">{stats.created}</p>
            <p className="text-xs text-green-600 mt-0.5">Créés</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-3 text-center border border-blue-100">
            <p className="text-2xl font-bold text-blue-700">{stats.updated}</p>
            <p className="text-xs text-blue-600 mt-0.5">Mis à jour</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
            <p className="text-2xl font-bold text-red-700">{stats.errors}</p>
            <p className="text-xs text-red-600 mt-0.5">Erreurs</p>
          </div>
        </div>

        {stats.errorDetails && stats.errorDetails.length > 0 && (
          <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-xs font-semibold text-red-800 mb-2">Détails des erreurs :</p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {stats.errorDetails.slice(0, 5).map((detail, i) => (
                <p key={i} className="text-[11px] text-red-700 font-mono">{detail}</p>
              ))}
              {stats.errorDetails.length > 5 && (
                <p className="text-[11px] text-red-500">+{stats.errorDetails.length - 5} autres erreurs (voir console)</p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={reset}
          className="w-full py-3 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
        >
          Importer un autre fichier
        </button>
      </div>
    );
  }

  return null;
}
