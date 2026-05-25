import { Package, AlertTriangle } from 'lucide-react';

interface Medication {
  id: string;
  name: string;
  code_produit?: string;
  price?: number;
  quantity?: number;
  peremption?: string;
  supplier?: string;
  forme_produit?: string;
  name_rayon?: string;
  minimum_stock?: number;
}

interface DataTableProps {
  medications: Medication[];
  onRowClick?: (medication: Medication) => void;
}

export default function DataTable({ medications, onRowClick }: DataTableProps) {
  const isExpiringSoon = (date: string | undefined) => {
    if (!date) return false;
    const diffDays = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diffDays <= 90 && diffDays >= 0;
  };

  const isExpired = (date: string | undefined) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const formatDate = (date: string | undefined) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('fr-FR');
  };

  const thCls = "px-4 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap";

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th className={thCls}>Produit</th>
              <th className={thCls}>Code</th>
              <th className={thCls}>Forme</th>
              <th className={thCls}>Rayon</th>
              <th className={`${thCls} text-right`}>Prix</th>
              <th className={`${thCls} text-right`}>Stock</th>
              <th className={`${thCls} text-right`}>Seuil</th>
              <th className={thCls}>Péremption</th>
              <th className={thCls}>Fournisseur</th>
            </tr>
          </thead>
          <tbody>
            {medications.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm">Aucun produit trouvé</p>
                </td>
              </tr>
            ) : (
              medications.map((med, idx) => {
                const expired  = isExpired(med.peremption);
                const expiring = isExpiringSoon(med.peremption);
                const qty = med.quantity ?? 0;
                const belowSeuil = med.minimum_stock !== undefined && med.minimum_stock !== null && qty < med.minimum_stock;

                return (
                  <tr
                    key={med.id}
                    onClick={() => onRowClick?.(med)}
                    className={`transition-colors duration-100 ${onRowClick ? 'cursor-pointer' : ''} ${
                      expired ? 'bg-red-50/60' : expiring ? 'bg-amber-50/60' : ''
                    }`}
                    style={{ borderBottom: idx < medications.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                    onMouseEnter={(e) => {
                      if (!expired && !expiring)
                        (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(16,185,129,0.04)';
                    }}
                    onMouseLeave={(e) => {
                      if (!expired && !expiring)
                        (e.currentTarget as HTMLTableRowElement).style.background = '';
                    }}
                  >
                    <td className="px-4 py-2">
                      <p className="font-semibold text-slate-900 text-[13px] leading-tight">{med.name || 'Produit sans nom'}</p>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-[12px] text-slate-500 font-mono">{med.code_produit || '—'}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-[12px] text-slate-600">{med.forme_produit || '—'}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-[12px] text-slate-600">{med.name_rayon || '—'}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="text-[13px] font-semibold text-slate-800">
                        {med.price ? `${med.price.toLocaleString('fr-FR')} FCFA` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-bold"
                        style={
                          qty <= 5
                            ? { background: '#fef2f2', color: '#dc2626' }
                            : belowSeuil
                            ? { background: '#fffbeb', color: '#d97706' }
                            : qty <= 20
                            ? { background: '#fff7ed', color: '#ea580c' }
                            : { background: '#f0fdf4', color: '#059669' }
                        }
                      >
                        {qty}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="text-[12px] text-slate-500">
                        {med.minimum_stock !== undefined && med.minimum_stock !== null
                          ? med.minimum_stock
                          : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        {(expired || expiring) && (
                          <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${expired ? 'text-red-500' : 'text-amber-500'}`} />
                        )}
                        <span className={`text-[12px] ${expired ? 'text-red-700 font-semibold' : expiring ? 'text-amber-700 font-medium' : 'text-slate-600'}`}>
                          {formatDate(med.peremption)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-[12px] text-slate-600">{med.supplier || '—'}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
