import { useState, useEffect } from 'react';
import { ArrowUpCircle, ArrowDownCircle, RotateCcw, Search, X, TrendingUp } from 'lucide-react';
import { offlineStorage, SalesJournalEntry } from '../lib/offlineStorage';
import { supabase } from '../lib/supabase';

interface Movement {
  id: string;
  date: string;
  medication_name: string;
  type: 'sale' | 'return' | 'entry' | 'adjustment';
  quantity: number;         // + entrée, - sortie
  unit_price: number;
  total: number;
  payment_method?: string;
  note?: string;
}

const TYPE_LABEL: Record<Movement['type'], { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  sale:       { label: 'Vente',    color: '#dc2626', bg: 'rgba(220,38,38,0.07)',   icon: <ArrowDownCircle size={14}/> },
  return:     { label: 'Retour',   color: '#2563eb', bg: 'rgba(37,99,235,0.07)',   icon: <RotateCcw size={14}/> },
  entry:      { label: 'Entrée',   color: '#537d14', bg: 'rgba(83,125,20,0.07)',   icon: <ArrowUpCircle size={14}/> },
  adjustment: { label: 'Ajust.',   color: '#b75f06', bg: 'rgba(183,95,6,0.07)',    icon: <TrendingUp size={14}/> },
};

const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString('fr-FR');

export default function StockHistory() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<Movement['type'] | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 40;

  useEffect(() => {
    loadMovements();
  }, []);

  const loadMovements = async () => {
    setLoading(true);
    const all: Movement[] = [];

    // ── 1. Journal local (ventes + retours) ──────────────────────────────────
    const journal = offlineStorage.getSalesJournal();
    for (const e of journal) {
      all.push({
        id:             e.id,
        date:           e.sale_date,
        medication_name: e.medication_name,
        type:           (e as any).is_return || e.quantity_sold < 0 ? 'return' : 'sale',
        quantity:       e.quantity_sold < 0 ? e.quantity_sold : -e.quantity_sold, // négatif = sortie
        unit_price:     e.unit_price,
        total:          e.total_price,
        payment_method: e.payment_method,
        note:           (e as any).reason,
      });
    }

    // ── 2. Entrées stock depuis Supabase (stock_entries) ─────────────────────
    try {
      const since = new Date();
      since.setMonth(since.getMonth() - 3);
      const { data: entries } = await supabase
        .from('stock_entries')
        .select('id, medication_id, entry_date, batch_number, expiry_date, supplier')
        .gte('entry_date', since.toISOString())
        .order('entry_date', { ascending: false })
        .limit(200);

      if (entries) {
        // Enrichir avec le nom du médicament
        const meds = offlineStorage.getCachedMedications();
        for (const e of entries) {
          const med = meds.find((m: any) => m.id === e.medication_id);
          all.push({
            id:             e.id,
            date:           e.entry_date,
            medication_name: med ? `${med.name} ${med.dosage || ''}`.trim() : e.medication_id,
            type:           'entry',
            quantity:       1, // une unité par entrée stock
            unit_price:     0,
            total:          0,
            note:           [e.batch_number, e.supplier].filter(Boolean).join(' · ') || undefined,
          });
        }
      }
    } catch { /* Supabase offline — local only */ }

    // ── 3. Trier par date décroissante ────────────────────────────────────────
    all.sort((a, b) => b.date.localeCompare(a.date));
    setMovements(all);
    setLoading(false);
  };

  const filtered = movements.filter(m => {
    const matchSearch = !search || m.medication_name.toLowerCase().includes(search.toLowerCase());
    const matchType   = typeFilter === 'all' || m.type === typeFilter;
    return matchSearch && matchType;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const stats = {
    sales:   movements.filter(m => m.type === 'sale').length,
    returns: movements.filter(m => m.type === 'return').length,
    entries: movements.filter(m => m.type === 'entry').length,
  };

  return (
    <div className="pb-20 space-y-4">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0a0e14', margin: 0 }}>Mouvements de stock</h2>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>
            {filtered.length} mouvement{filtered.length > 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['all','sale','return','entry'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTypeFilter(t); setPage(0); }}
              style={{
                padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.1s',
                background: typeFilter === t ? '#0a0e14' : 'rgba(255,255,255,0.7)',
                color:      typeFilter === t ? '#fff'    : '#6b7280',
                border: `1px solid ${typeFilter === t ? '#0a0e14' : 'rgba(255,255,255,0.55)'}`,
              }}
            >
              {t === 'all' ? `Tout (${movements.length})` : t === 'sale' ? `Ventes (${stats.sales})` : t === 'return' ? `Retours (${stats.returns})` : `Entrées (${stats.entries})`}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={14} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Filtrer par produit…"
          style={{
            width: '100%', padding: '9px 36px 9px 34px', fontSize: 13,
            border: '1.5px solid rgba(255,255,255,0.55)', borderRadius: 9,
            background: 'rgba(255,255,255,0.7)', color: '#0a0e14', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
            <X size={13} color="#9ca3af" />
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
          <div style={{ width: 28, height: 28, border: '2px solid #e5e7eb', borderTopColor: '#537d14', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: 'rgba(255,255,255,0.7)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.55)' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Aucun mouvement trouvé</p>
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Essayez un autre filtre ou terme de recherche</p>
        </div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.55)', borderRadius: 12, overflow: 'hidden', backdropFilter: 'saturate(180%) blur(20px)' }}>
          {paginated.map((m, i) => {
            const t = TYPE_LABEL[m.type];
            return (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 14px',
                borderBottom: i < paginated.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
              }}>
                {/* Type badge */}
                <div style={{
                  width: 30, height: 30, borderRadius: 8, background: t.bg, color: t.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {t.icon}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0a0e14', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.medication_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                    {new Date(m.date).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                    {m.payment_method && <span> · {m.payment_method}</span>}
                    {m.note && <span> · {m.note}</span>}
                  </div>
                </div>

                {/* Quantity */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: m.quantity >= 0 ? '#537d14' : '#dc2626', fontFamily: 'monospace' }}>
                    {m.quantity >= 0 ? '+' : '−'}{Math.abs(m.quantity)}
                  </div>
                  {m.total !== 0 && (
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{fmt(m.total)} F</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '6px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.4 : 1, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.55)', color: '#374151' }}
          >
            ← Préc.
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ padding: '6px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? 0.4 : 1, background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.55)', color: '#374151' }}
          >
            Suiv. →
          </button>
        </div>
      )}
    </div>
  );
}
