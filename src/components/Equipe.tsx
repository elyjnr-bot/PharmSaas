import { useState, useEffect, useMemo } from 'react';
import {
  Users, Plus, X, Trash2, RefreshCw, UserCheck,
  KeyRound, Shield, Timer, ChevronDown, Award,
  LogOut, Eye, EyeOff, ChevronRight, Lock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSeller, getManagerPin, setManagerPin } from '../lib/sellerContext';
import { useAuth } from '../lib/auth';
import { offlineStorage } from '../lib/offlineStorage';
import { getSellerPermissions, setSellerPermissions, SellerPermissions } from '../lib/permissions';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  brand:   '#10785a',
  brandLt: 'rgba(16,120,90,0.08)',
  ink:     '#0a0e14',
  inkSoft: '#374151',
  inkMute: '#6b7280',
  inkFaint:'#9ca3af',
  panel:   '#ffffff',
  bg:      '#f7f8fa',
  border:  'rgba(0,0,0,0.07)',
  hairline:'rgba(0,0,0,0.06)',
  red:     '#dc2626',
  redLt:   'rgba(220,38,38,0.07)',
  amber:   '#d97706',
  amberLt: 'rgba(217,119,6,0.08)',
};

interface Seller {
  id: string;
  name: string;
  pin_code: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function avatarColor(name: string): [string, string] {
  const p: [string,string][] = [
    ['#10785a','#d1fae5'],['#2563eb','#dbeafe'],['#7c3aed','#ede9fe'],
    ['#db2777','#fce7f3'],['#d97706','#fef3c7'],['#0891b2','#cffafe'],
  ];
  return p[name.charCodeAt(0) % p.length];
}
function localDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Hook stats vendeur (toujours appelé au top-level d'un composant) ──────────
function useSellerStats(sellerName: string) {
  return useMemo(() => {
    const all   = offlineStorage.getSalesJournal();
    const mine  = all.filter(e => e.seller_name === sellerName && (e.total_price || 0) > 0);
    const today = localDateKey();
    const month = today.slice(0, 7);
    const td = mine.filter(e => e.sale_date.startsWith(today));
    const mo = mine.filter(e => e.sale_date.startsWith(month));
    const todayCA = td.reduce((s,e) => s+e.total_price, 0);
    const monthCA = mo.reduce((s,e) => s+e.total_price, 0);
    const todayTickets = td.length;
    const monthTickets = mo.length;

    // ── Classement parmi les vendeurs ce mois ───────────────────────────────
    const allMonth = all.filter(e => e.sale_date.startsWith(month) && (e.total_price || 0) > 0);
    const sellerCAs: Record<string, number> = {};
    allMonth.forEach(e => { const n = e.seller_name || '?'; sellerCAs[n] = (sellerCAs[n] || 0) + e.total_price; });
    const ranking = Object.entries(sellerCAs).sort((a,b) => b[1]-a[1]);
    const rank = ranking.findIndex(([n]) => n === sellerName) + 1;

    return {
      todayCA,
      todayTickets,
      todayAvg:     todayTickets > 0 ? Math.round(todayCA / todayTickets) : 0,
      monthCA,
      monthTickets,
      monthAvg:     monthTickets > 0 ? Math.round(monthCA / monthTickets) : 0,
      totalCA:      mine.reduce((s,e) => s+e.total_price, 0),
      totalTickets: mine.length,
      rank:         rank || 0,
      totalSellers: ranking.length,
      lastSales:    [...mine].sort((a,b) => new Date(b.sale_date).getTime()-new Date(a.sale_date).getTime()).slice(0,5),
    };
  }, [sellerName]);
}

// ── PinPad ────────────────────────────────────────────────────────────────────
function PinPad({ value, onChange, error, label, showToggle = false }:
  { value:string; onChange:(v:string)=>void; error?:string; label:string; showToggle?:boolean }) {
  const [show, setShow] = useState(false);
  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  const press = (d: string) => {
    if (d === '⌫') onChange(value.slice(0,-1));
    else if (d && value.length < 4) onChange(value+d);
  };
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
      {label && <p style={{ fontSize:13, color:C.inkMute, textAlign:'center' }}>{label}</p>}
      <div style={{ display:'flex', gap:10 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width:48, height:48, borderRadius:12,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:22, fontWeight:700,
            background: error ? 'rgba(220,38,38,0.07)' : value.length>i ? C.brandLt : C.bg,
            border:`2px solid ${error ? C.red : value.length>i ? C.brand : C.border}`,
            transition:'all 0.15s', color:C.brand,
          }}>
            {value.length>i ? (show ? value[i] : '•') : ''}
          </div>
        ))}
      </div>
      {error && <p style={{ fontSize:12, color:C.red, fontWeight:600, margin:'-8px 0' }}>{error}</p>}
      {showToggle && (
        <button onClick={() => setShow(v=>!v)} style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:C.inkMute, background:'none', border:'none', cursor:'pointer' }}>
          {show ? <EyeOff size={13}/> : <Eye size={13}/>} {show ? 'Masquer' : 'Afficher'}
        </button>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, width:'100%', maxWidth:240 }}>
        {KEYS.map((d, i) => (
          <button key={i} onClick={() => d ? press(d) : undefined} disabled={!d}
            style={{
              height:52, borderRadius:12, fontSize:d==='⌫'?18:20, fontWeight:600,
              cursor:d?'pointer':'default',
              background:d==='⌫'?'rgba(0,0,0,0.05)':d?C.panel:'transparent',
              border:d?`1px solid ${C.border}`:'none',
              color:d==='⌫'?C.inkMute:C.ink,
              boxShadow:d&&d!=='⌫'?'0 1px 3px rgba(0,0,0,0.06)':'none',
              visibility:d===''?'hidden':'visible',
            }}
          >{d}</button>
        ))}
      </div>
    </div>
  );
}

// ── Modal bottom-sheet ────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(10,14,20,0.5)', backdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={e => { if (e.target===e.currentTarget) onClose(); }}
    >
      <div style={{ width:'100%', maxWidth:460, background:C.panel, borderRadius:'20px 20px 0 0', boxShadow:'0 -8px 40px rgba(0,0,0,0.18)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'center', paddingTop:12, marginBottom:4 }}>
          <div style={{ width:36, height:4, borderRadius:99, background:C.border }}/>
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 20px 12px' }}>
          <h2 style={{ fontSize:16, fontWeight:700, color:C.ink }}>{title}</h2>
          <button onClick={onClose} style={{ width:30, height:30, borderRadius:99, background:C.bg, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <X size={15} color={C.inkMute}/>
          </button>
        </div>
        <div style={{ padding:'0 20px 24px' }}>{children}</div>
      </div>
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ enabled, onChange, label, description }:
  { enabled:boolean; onChange:(v:boolean)=>void; label:string; description?:string }) {
  return (
    <button onClick={() => onChange(!enabled)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'12px 0', background:'none', border:'none', cursor:'pointer' }}>
      <div style={{ flex:1, textAlign:'left' }}>
        <p style={{ fontSize:13, fontWeight:600, color:C.ink }}>{label}</p>
        {description && <p style={{ fontSize:11.5, color:C.inkMute, marginTop:2 }}>{description}</p>}
      </div>
      <div style={{ width:42, height:24, borderRadius:99, flexShrink:0, background:enabled?C.brand:'#d1d5db', position:'relative', transition:'background 0.2s' }}>
        <div style={{ position:'absolute', top:2, left:enabled?20:2, width:20, height:20, borderRadius:99, background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left 0.2s' }}/>
      </div>
    </button>
  );
}

// ── Section pliable ───────────────────────────────────────────────────────────
function Section({ icon, title, subtitle, children }:
  { icon:React.ReactNode; title:string; subtitle?:string; children:React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background:C.panel, borderRadius:16, border:`1px solid ${C.border}`, overflow:'hidden' }}>
      <button onClick={() => setOpen(v=>!v)} style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}>
        <div style={{ width:36, height:36, borderRadius:10, background:C.brandLt, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{icon}</div>
        <div style={{ flex:1 }}>
          <p style={{ fontSize:13, fontWeight:700, color:C.ink }}>{title}</p>
          {subtitle && <p style={{ fontSize:11.5, color:C.inkMute, marginTop:1 }}>{subtitle}</p>}
        </div>
        <ChevronDown size={16} color={C.inkFaint} style={{ transition:'transform 0.2s', transform:open?'rotate(180deg)':'rotate(0deg)', flexShrink:0 }}/>
      </button>
      {open && <div style={{ borderTop:`1px solid ${C.hairline}`, padding:'4px 16px 12px' }}>{children}</div>}
    </div>
  );
}

// ── Ligne vendeur dans la section management (composant séparé pour les hooks) ─
function SellerManageRow({ seller, onDelete, onStats }: {
  seller: Seller;
  onDelete: (id: string) => void;
  onStats: (s: Seller) => void;
}) {
  const [delConfirm, setDelConfirm] = useState(false); // ✅ hook au top-level du composant
  const [tc, bg] = avatarColor(seller.name);
  const today = localDateKey();
  const all = offlineStorage.getSalesJournal().filter(e => e.seller_name === seller.name);
  const todayCA = all.filter(e => e.sale_date.startsWith(today)).reduce((s,e)=>s+e.total_price,0);
  const monthCA = all.filter(e => e.sale_date.startsWith(today.slice(0,7))).reduce((s,e)=>s+e.total_price,0);

  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 8px', borderRadius:12, background:C.bg }}>
      <div style={{ width:38, height:38, borderRadius:10, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:tc, flexShrink:0 }}>
        {initials(seller.name)}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:13, fontWeight:700, color:C.ink }}>{seller.name}</p>
        <p style={{ fontSize:11, color:C.inkFaint }}>
          Auj : {todayCA.toLocaleString('fr-FR')} F · Mois : {monthCA.toLocaleString('fr-FR')} F
        </p>
      </div>
      <button
        onClick={() => onStats(seller)}
        style={{ padding:'5px 8px', borderRadius:7, background:'transparent', border:`1px solid ${C.border}`, color:C.inkMute, fontSize:11, fontWeight:600, cursor:'pointer' }}
      >
        Stats
      </button>
      {delConfirm ? (
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={() => setDelConfirm(false)} style={{ width:28, height:28, borderRadius:7, background:C.bg, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <X size={13} color={C.inkMute}/>
          </button>
          <button onClick={() => onDelete(seller.id)} style={{ width:28, height:28, borderRadius:7, background:C.redLt, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Trash2 size={13} color={C.red}/>
          </button>
        </div>
      ) : (
        <button onClick={() => setDelConfirm(true)} style={{ width:28, height:28, borderRadius:7, background:'transparent', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Trash2 size={13} color={C.inkFaint}/>
        </button>
      )}
    </div>
  );
}

// ── Session active card ───────────────────────────────────────────────────────
function ActiveSessionCard({ seller, perms, onDisconnect, onStats }: {
  seller: { id:string; name:string };
  perms: SellerPermissions;
  onDisconnect: () => void;
  onStats: () => void;
}) {
  const stats = useSellerStats(seller.name); // ✅ hook au top-level du composant
  return (
    <div style={{ borderRadius:18, overflow:'hidden', background:'linear-gradient(135deg, #065f46 0%, #10785a 100%)', color:'#fff', padding:18 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:perms.showDailyTotal?14:0 }}>
        <div style={{ width:44, height:44, borderRadius:14, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700 }}>
          {initials(seller.name)}
        </div>
        <div style={{ flex:1 }}>
          <p style={{ fontSize:10, opacity:0.75, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>Session active</p>
          <p style={{ fontSize:17, fontWeight:800 }}>{seller.name}</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onStats} style={{ padding:'6px 10px', borderRadius:8, background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.2)', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            Stats
          </button>
          <button onClick={onDisconnect} style={{ padding:'6px 10px', borderRadius:8, background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.2)', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
            <LogOut size={13}/> Quitter
          </button>
        </div>
      </div>
      {perms.showDailyTotal && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[
            { label:"Aujourd'hui", ca:stats.todayCA, t:stats.todayTickets },
            { label:'Ce mois',     ca:stats.monthCA,  t:stats.monthTickets },
          ].map(s => (
            <div key={s.label} style={{ background:'rgba(255,255,255,0.12)', borderRadius:12, padding:'10px 14px' }}>
              <p style={{ fontSize:10, opacity:0.75, fontWeight:600, marginBottom:4 }}>{s.label}</p>
              <p style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.02em', lineHeight:1 }}>{s.ca.toLocaleString('fr-FR')}</p>
              <p style={{ fontSize:11, opacity:0.65, marginTop:3 }}>{s.t} ticket{s.t!==1?'s':''} · FCFA</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Vue vendeur (non-manager) ─────────────────────────────────────────────────
function VendorView({ sellerName, perms }: { sellerName: string; perms: SellerPermissions }) {
  const stats = useSellerStats(sellerName); // ✅ hook au top-level du composant
  return (
    <>
      <div style={{ borderRadius:18, overflow:'hidden', background:'linear-gradient(135deg, #065f46 0%, #10785a 100%)', color:'#fff', padding:18 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:perms.showDailyTotal?14:0 }}>
          <div style={{ width:44, height:44, borderRadius:14, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700 }}>
            {initials(sellerName)}
          </div>
          <div>
            <p style={{ fontSize:10, opacity:0.75, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>Session active</p>
            <p style={{ fontSize:17, fontWeight:800 }}>{sellerName}</p>
          </div>
        </div>
        {perms.showDailyTotal && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {[
              { label:"Aujourd'hui", ca:stats.todayCA, t:stats.todayTickets },
              { label:'Ce mois',     ca:stats.monthCA,  t:stats.monthTickets },
            ].map(s => (
              <div key={s.label} style={{ background:'rgba(255,255,255,0.12)', borderRadius:12, padding:'10px 14px' }}>
                <p style={{ fontSize:10, opacity:0.75, fontWeight:600, marginBottom:4 }}>{s.label}</p>
                <p style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.02em', lineHeight:1 }}>{s.ca.toLocaleString('fr-FR')}</p>
                <p style={{ fontSize:11, opacity:0.65, marginTop:3 }}>{s.t} ticket{s.t!==1?'s':''} · FCFA</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {perms.showTransactionHistory && stats.lastSales.length > 0 && (
        <div style={{ background:C.panel, borderRadius:16, border:`1px solid ${C.border}`, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px 8px', borderBottom:`1px solid ${C.hairline}` }}>
            <p style={{ fontSize:12, fontWeight:700, color:C.inkSoft, textTransform:'uppercase', letterSpacing:'0.04em' }}>
              5 dernières ventes
            </p>
          </div>
          {stats.lastSales.map((e, i) => (
            <div key={e.id} style={{ padding:'10px 16px', display:'flex', alignItems:'center', gap:10, borderTop:i>0?`1px solid ${C.hairline}`:'none' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:13, fontWeight:600, color:C.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.medication_name}</p>
                <p style={{ fontSize:11, color:C.inkFaint, marginTop:1 }}>
                  {new Date(e.sale_date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} · ×{e.quantity_sold}
                </p>
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:C.brand }}>{e.total_price.toLocaleString('fr-FR')} F</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── Stats détail vendeur (modal) ──────────────────────────────────────────────
function SellerStatsModal({ seller, onClose }: { seller:Seller; onClose:()=>void }) {
  const stats = useSellerStats(seller.name); // ✅ hook au top-level
  const [tc, bg] = avatarColor(seller.name);
  return (
    <Modal title={`Stats — ${seller.name}`} onClose={onClose}>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:52, height:52, borderRadius:16, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:800, color:tc }}>
            {initials(seller.name)}
          </div>
          <div>
            <p style={{ fontSize:17, fontWeight:800, color:C.ink }}>{seller.name}</p>
            <p style={{ fontSize:12, color:C.inkMute }}>Depuis le {new Date(seller.created_at).toLocaleDateString('fr-FR')}</p>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {[
            { label:"Aujourd'hui", ca:stats.todayCA, t:stats.todayTickets, avg:stats.todayAvg, col:C.brand },
            { label:'Ce mois',     ca:stats.monthCA,  t:stats.monthTickets, avg:stats.monthAvg, col:'#2563eb' },
          ].map(s => (
            <div key={s.label} style={{ background:C.bg, borderRadius:12, padding:'12px 14px' }}>
              <p style={{ fontSize:11, color:C.inkMute, fontWeight:600, marginBottom:4 }}>{s.label}</p>
              <p style={{ fontSize:20, fontWeight:800, color:s.col, letterSpacing:'-0.02em', lineHeight:1 }}>{s.ca.toLocaleString('fr-FR')} F</p>
              <p style={{ fontSize:11, color:C.inkFaint, marginTop:3 }}>{s.t} ticket{s.t!==1?'s':''} · Ø {s.avg.toLocaleString('fr-FR')} F</p>
            </div>
          ))}
        </div>
        {/* Classement + Total cumulé */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <div style={{ background:C.brandLt, borderRadius:12, padding:'12px 16px', border:`1px solid rgba(16,120,90,0.15)` }}>
            <p style={{ fontSize:11, fontWeight:600, color:C.brand, marginBottom:4 }}>Total cumulé</p>
            <p style={{ fontSize:18, fontWeight:800, color:C.brand }}>{stats.totalCA.toLocaleString('fr-FR')} F</p>
            <p style={{ fontSize:11, color:C.inkFaint, marginTop:2 }}>{stats.totalTickets} ticket{stats.totalTickets!==1?'s':''}</p>
          </div>
          {stats.totalSellers > 1 && (
            <div style={{ background:'rgba(245,158,11,0.08)', borderRadius:12, padding:'12px 16px', border:'1px solid rgba(245,158,11,0.2)' }}>
              <p style={{ fontSize:11, fontWeight:600, color:'#b45309', marginBottom:4 }}>Classement</p>
              <p style={{ fontSize:18, fontWeight:800, color:'#b45309' }}>
                {stats.rank === 1 ? '🥇' : stats.rank === 2 ? '🥈' : stats.rank === 3 ? '🥉' : `#${stats.rank}`}
                {' '}{stats.rank}<sup>e</sup> / {stats.totalSellers}
              </p>
              <p style={{ fontSize:11, color:C.inkFaint, marginTop:2 }}>CA ce mois</p>
            </div>
          )}
        </div>
        {stats.lastSales.length > 0 && (
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:C.inkMute, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>5 dernières ventes</p>
            <div style={{ background:C.panel, borderRadius:12, border:`1px solid ${C.border}`, overflow:'hidden' }}>
              {stats.lastSales.map((e, i) => (
                <div key={e.id} style={{ padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:i>0?`1px solid ${C.hairline}`:'none' }}>
                  <div>
                    <p style={{ fontSize:13, fontWeight:600, color:C.ink }}>{e.medication_name}</p>
                    <p style={{ fontSize:11, color:C.inkFaint }}>
                      {new Date(e.sale_date).toLocaleDateString('fr-FR')} · {new Date(e.sale_date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} · ×{e.quantity_sold}
                    </p>
                  </div>
                  <span style={{ fontSize:13, fontWeight:700, color:C.brand }}>{e.total_price.toLocaleString('fr-FR')} F</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
const AUTO_LOGOUT_OPTIONS = [
  { label:'Désactivé', value:0 }, { label:'5 min', value:5 },
  { label:'10 min', value:10 },   { label:'15 min', value:15 },
  { label:'30 min', value:30 },
];

export default function Equipe() {
  const { isManager }                     = useAuth();
  const { activeSeller, setActiveSeller } = useSeller();

  const [sellers, setSellers]     = useState<Seller[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [pinModal,    setPinModal]    = useState<Seller | null>(null);
  const [addModal,    setAddModal]    = useState(false);
  const [mgrPinModal, setMgrPinModal] = useState(false);
  const [statsModal,  setStatsModal]  = useState<Seller | null>(null);

  // Ajout vendeur
  const [newName,  setNewName]  = useState('');
  const [newPin,   setNewPin]   = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // PIN connexion
  const [switchPin,   setSwitchPin]   = useState('');
  const [switchError, setSwitchError] = useState('');

  // PIN manager
  const [managerPin,  setManagerPinState] = useState(() => getManagerPin());
  const [mgrStep,     setMgrStep]         = useState<'new'|'confirm'>('new');
  const [mgrNew,      setMgrNew]          = useState('');
  const [mgrConfirm,  setMgrConfirm]      = useState('');
  const [mgrError,    setMgrError]        = useState('');

  // Permissions
  const [perms, setPermsState] = useState<SellerPermissions>(() => getSellerPermissions());
  // ── Verrouillage des permissions : un vendeur en session active doit saisir
  //    le PIN manager pour voir/modifier la section "Permissions vendeurs".
  const [permsUnlocked, setPermsUnlocked] = useState(() => !activeSeller);
  const [permsUnlockPin, setPermsUnlockPin] = useState('');
  const [permsUnlockError, setPermsUnlockError] = useState('');
  // Re-verrouille automatiquement quand un vendeur prend la session
  useEffect(() => { if (activeSeller) setPermsUnlocked(false); }, [activeSeller]);
  const tryUnlockPerms = (pin: string) => {
    if (pin === getManagerPin()) {
      setPermsUnlocked(true);
      setPermsUnlockPin('');
      setPermsUnlockError('');
    } else {
      setPermsUnlockError('Code incorrect');
    }
  };
  const updatePerm = (patch: Partial<SellerPermissions>) => {
    if (!permsUnlocked) return; // sécurité : empêche toute modif sans déverrouillage
    const next = { ...perms, ...patch };
    setPermsState(next);
    setSellerPermissions(next);
  };

  useEffect(() => { loadSellers(); }, []);

  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent).detail?.action === 'add-seller') { setNewName(''); setNewPin(''); setAddModal(true); }
    };
    window.addEventListener('topbar-action', h);
    return () => window.removeEventListener('topbar-action', h);
  }, []);

  const loadSellers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('sellers').select('*').order('created_at');
      if (error) throw error;
      const sellerData = data || [];
      setSellers(sellerData);
      // Cache pour l'écran de sélection de session (Option C)
      localStorage.setItem('pharma_sellers_cache', JSON.stringify(sellerData));
    } catch { setSellers([]); }
    finally { setIsLoading(false); }
  };

  // Auto-validate PIN vendeur
  useEffect(() => {
    if (switchPin.length === 4 && pinModal) {
      setTimeout(() => {
        if (switchPin === pinModal.pin_code) {
          setActiveSeller({ id:pinModal.id, name:pinModal.name });
          setPinModal(null); setSwitchPin(''); setSwitchError('');
        } else {
          setSwitchError('Code PIN incorrect');
          setSwitchPin('');
        }
      }, 150);
    }
  }, [switchPin, pinModal]);

  // Auto-validate PIN manager étape 1
  useEffect(() => {
    if (mgrNew.length === 4 && mgrStep === 'new') setMgrStep('confirm');
  }, [mgrNew]);

  // Auto-validate PIN manager étape 2
  useEffect(() => {
    if (mgrConfirm.length === 4 && mgrStep === 'confirm') {
      setTimeout(() => {
        if (mgrConfirm === mgrNew) {
          setManagerPin(mgrNew); setManagerPinState(mgrNew);
          setMgrNew(''); setMgrConfirm(''); setMgrStep('new'); setMgrError('');
          setMgrPinModal(false);
        } else {
          setMgrError('Les codes ne correspondent pas');
          setMgrConfirm('');
        }
      }, 150);
    }
  }, [mgrConfirm]);

  const handleAddSeller = async () => {
    if (!newName.trim() || newPin.length !== 4 || isSaving) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error();
      const { data, error } = await supabase
        .from('sellers').insert([{ name:newName.trim(), pin_code:newPin, user_id:user.id }])
        .select().single();
      if (error) throw error;
      setSellers(prev => {
        const updated = [...prev, data];
        localStorage.setItem('pharma_sellers_cache', JSON.stringify(updated));
        return updated;
      });
      setNewName(''); setNewPin(''); setAddModal(false);
    } catch { alert('Erreur lors de la création'); }
    finally { setIsSaving(false); }
  };

  const handleDeleteSeller = async (id: string) => {
    try {
      const { error } = await supabase.from('sellers').delete().eq('id', id);
      if (error) throw error;
      setSellers(prev => {
        const updated = prev.filter(s => s.id !== id);
        localStorage.setItem('pharma_sellers_cache', JSON.stringify(updated));
        return updated;
      });
      if (activeSeller?.id === id) setActiveSeller(null);
    } catch { alert('Erreur lors de la suppression'); }
  };

  // Classement du jour
  const ranking = useMemo(() => {
    const today = localDateKey();
    const map: Record<string,number> = {};
    for (const e of offlineStorage.getSalesJournal().filter(e => e.sale_date.startsWith(today))) {
      if (e.seller_name) map[e.seller_name] = (map[e.seller_name]||0) + e.total_price;
    }
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  }, []);

  // ── Vue non-manager ────────────────────────────────────────────────────────
  if (!isManager) {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:C.ink, letterSpacing:'-0.02em' }}>Mon espace</h1>
        {activeSeller
          ? <VendorView sellerName={activeSeller.name} perms={perms} />
          : (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 24px', textAlign:'center', background:C.panel, borderRadius:16, border:`1px solid ${C.border}` }}>
              <div style={{ width:60, height:60, borderRadius:18, background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}>
                <UserCheck size={28} color={C.inkFaint}/>
              </div>
              <p style={{ fontSize:14, color:C.inkMute }}>Chargement de votre profil…</p>
            </div>
          )
        }
      </div>
    );
  }

  // ── Vue manager ────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── MODAL : CONNEXION VENDEUR ── */}
      {pinModal && (
        <Modal title={`Se connecter — ${pinModal.name}`} onClose={() => { setPinModal(null); setSwitchPin(''); setSwitchError(''); }}>
          <div style={{ textAlign:'center', marginBottom:8 }}>
            <div style={{ width:64, height:64, borderRadius:20, background:avatarColor(pinModal.name)[1], display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:800, color:avatarColor(pinModal.name)[0], margin:'0 auto 12px' }}>
              {initials(pinModal.name)}
            </div>
          </div>
          <PinPad value={switchPin} onChange={v => { setSwitchPin(v); setSwitchError(''); }} error={switchError} label="Entrez votre code PIN"/>
          {switchError && (
            <button onClick={() => { setSwitchPin(''); setSwitchError(''); }} style={{ width:'100%', marginTop:12, padding:12, borderRadius:12, fontSize:13, fontWeight:600, background:C.bg, border:`1px solid ${C.border}`, color:C.inkMute, cursor:'pointer' }}>
              Réessayer
            </button>
          )}
        </Modal>
      )}

      {/* ── MODAL : AJOUTER VENDEUR ── */}
      {addModal && (
        <Modal title="Nouveau vendeur" onClose={() => { setAddModal(false); setNewName(''); setNewPin(''); }}>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:C.inkMute, display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Nom du vendeur</label>
              <input type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Prénom…" autoFocus
                style={{ width:'100%', padding:'12px 14px', fontSize:15, border:`1.5px solid ${C.border}`, borderRadius:12, outline:'none', background:C.bg, color:C.ink, boxSizing:'border-box' }}
                onFocus={e=>(e.target.style.borderColor=C.brand)} onBlur={e=>(e.target.style.borderColor=C.border)}
              />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:C.inkMute, display:'block', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>Code PIN (4 chiffres)</label>
              <PinPad value={newPin} onChange={setNewPin} label="Code secret du vendeur" showToggle/>
            </div>
            <button onClick={handleAddSeller} disabled={!newName.trim()||newPin.length!==4||isSaving}
              style={{ width:'100%', padding:14, borderRadius:14, fontSize:14, fontWeight:700, background:C.brand, border:'none', color:'#fff', cursor:'pointer', opacity:(!newName.trim()||newPin.length!==4||isSaving)?0.4:1 }}>
              {isSaving ? 'Enregistrement…' : 'Créer le profil'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── MODAL : CODE MANAGER ── */}
      {mgrPinModal && (
        <Modal title="Code Manager" onClose={() => { setMgrPinModal(false); setMgrNew(''); setMgrConfirm(''); setMgrStep('new'); setMgrError(''); }}>
          <PinPad
            value={mgrStep==='new' ? mgrNew : mgrConfirm}
            onChange={v => { if (mgrStep==='new') { setMgrNew(v); setMgrError(''); } else { setMgrConfirm(v); setMgrError(''); } }}
            error={mgrError}
            label={mgrStep==='new' ? 'Nouveau code à 4 chiffres' : 'Confirmez le même code'}
          />
          {mgrStep==='confirm' && (
            <button onClick={() => { setMgrStep('new'); setMgrNew(''); setMgrConfirm(''); }} style={{ width:'100%', marginTop:12, padding:10, borderRadius:10, fontSize:12, color:C.inkMute, background:'none', border:`1px solid ${C.border}`, cursor:'pointer' }}>
              ← Recommencer
            </button>
          )}
        </Modal>
      )}

      {/* ── MODAL : STATS VENDEUR ── */}
      {statsModal && <SellerStatsModal seller={statsModal} onClose={() => setStatsModal(null)}/>}

      {/* ── CONTENU PRINCIPAL ── */}
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

        {/* En-tête */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:800, color:C.ink, letterSpacing:'-0.02em' }}>Équipe</h1>
            <p style={{ fontSize:13, color:C.inkMute, marginTop:2 }}>
              {sellers.length} vendeur{sellers.length!==1?'s':''} · {activeSeller ? `Session : ${activeSeller.name}` : 'Aucune session active'}
            </p>
          </div>
          <button onClick={() => { setNewName(''); setNewPin(''); setAddModal(true); }}
            style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:700, color:'#fff', background:C.brand, border:'none', borderRadius:10, padding:'9px 14px', cursor:'pointer', boxShadow:'0 2px 8px rgba(16,120,90,0.3)' }}>
            <Plus size={15} strokeWidth={2.5}/> Ajouter
          </button>
        </div>

        {/* Session active */}
        {activeSeller && (
          <ActiveSessionCard
            seller={activeSeller}
            perms={perms}
            onDisconnect={() => setActiveSeller(null)}
            onStats={() => {
              const s = sellers.find(s => s.id===activeSeller.id);
              if (s) setStatsModal(s);
            }}
          />
        )}

        {/* ── Sélection de session (visible par tout le monde) ── */}
        <div style={{ background:C.panel, borderRadius:16, border:`1px solid ${C.border}`, overflow:'hidden' }}>
          <div style={{ padding:'14px 16px 10px', display:'flex', alignItems:'center', gap:10, borderBottom:`1px solid ${C.hairline}` }}>
            <div style={{ width:34, height:34, borderRadius:10, background:C.brandLt, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Lock size={15} color={C.brand}/>
            </div>
            <div>
              <p style={{ fontSize:13, fontWeight:700, color:C.ink }}>{activeSeller ? 'Changer de session' : 'Choisir une session'}</p>
              <p style={{ fontSize:11.5, color:C.inkMute, marginTop:1 }}>Sélectionnez votre profil et entrez votre PIN</p>
            </div>
          </div>

          {isLoading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:32 }}>
              <RefreshCw size={22} color={C.brand} style={{ animation:'spin 1s linear infinite' }}/>
            </div>
          ) : sellers.length === 0 ? (
            <div style={{ padding:'24px 20px', textAlign:'center' }}>
              <p style={{ fontSize:13, color:C.inkMute }}>Aucun vendeur — cliquez "Ajouter" pour créer des profils.</p>
            </div>
          ) : (
            sellers.map((seller, i) => {
              const isActive = activeSeller?.id === seller.id;
              const [tc, bg] = avatarColor(seller.name);
              return (
                <button key={seller.id} onClick={() => openPinModal(seller)}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:isActive?'rgba(16,120,90,0.05)':'transparent', border:'none', borderTop:i>0?`1px solid ${C.hairline}`:'none', cursor:'pointer', textAlign:'left' }}
                  onMouseEnter={e => { if(!isActive)(e.currentTarget as HTMLButtonElement).style.background='rgba(0,0,0,0.025)'; }}
                  onMouseLeave={e => { if(!isActive)(e.currentTarget as HTMLButtonElement).style.background='transparent'; }}
                >
                  <div style={{ position:'relative', flexShrink:0 }}>
                    <div style={{ width:44, height:44, borderRadius:12, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color:tc, border:isActive?`2px solid ${C.brand}`:'2px solid transparent' }}>
                      {initials(seller.name)}
                    </div>
                    {isActive && <div style={{ position:'absolute', bottom:-2, right:-2, width:12, height:12, borderRadius:99, background:C.brand, border:'2px solid #fff' }}/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:14, fontWeight:700, color:C.ink }}>{seller.name}</span>
                      {isActive && <span style={{ fontSize:9, fontWeight:700, color:C.brand, background:C.brandLt, borderRadius:99, padding:'2px 6px', textTransform:'uppercase', letterSpacing:'0.05em' }}>Actif</span>}
                    </div>
                    <p style={{ fontSize:12, color:C.inkFaint, marginTop:2 }}>
                      {isActive ? 'Cliquez pour changer de session' : 'Cliquez pour vous connecter'}
                    </p>
                  </div>
                  <div style={{ width:32, height:32, borderRadius:8, background:isActive?C.brandLt:C.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <UserCheck size={14} color={isActive?C.brand:C.inkFaint}/>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Classement du jour */}
        {ranking.length > 1 && (
          <div style={{ background:C.panel, borderRadius:16, border:`1px solid ${C.border}`, overflow:'hidden' }}>
            <div style={{ padding:'12px 16px 8px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Award size={14} color="#f59e0b"/>
                <span style={{ fontSize:12, fontWeight:700, color:C.inkSoft, textTransform:'uppercase', letterSpacing:'0.04em' }}>Classement du jour</span>
              </div>
              <span style={{ fontSize:12, color:C.inkFaint }}>{ranking.reduce((s,[,v])=>s+v,0).toLocaleString('fr-FR')} F total</span>
            </div>
            {ranking.map(([name, ca], i) => {
              const total = ranking.reduce((s,[,v])=>s+v,0);
              const pct = total>0?(ca/total)*100:0;
              return (
                <div key={name} style={{ padding:'8px 16px', borderTop:`1px solid ${C.hairline}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                    <span style={{ width:20, height:20, borderRadius:6, flexShrink:0, background:i===0?'#fef3c7':C.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:i===0?'#d97706':C.inkFaint }}>{i+1}</span>
                    <span style={{ flex:1, fontSize:13, fontWeight:600, color:C.ink }}>{name}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:C.brand }}>{ca.toLocaleString('fr-FR')} F</span>
                    <span style={{ fontSize:11, color:C.inkFaint, width:34, textAlign:'right' }}>{Math.round(pct)}%</span>
                  </div>
                  <div style={{ height:4, background:C.bg, borderRadius:99, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:99, width:`${pct}%`, background:i===0?'#f59e0b':C.brand }}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Section Gestion Manager ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <p style={{ fontSize:11, fontWeight:700, color:C.inkFaint, textTransform:'uppercase', letterSpacing:'0.06em', paddingLeft:4 }}>Gestion · Manager</p>

          {/* Profils */}
          <Section icon={<Users size={16} color={C.brand}/>} title="Profils vendeurs" subtitle={`${sellers.length} profil${sellers.length!==1?'s':''}`}>
            {sellers.length===0
              ? <p style={{ fontSize:13, color:C.inkMute, padding:'8px 0' }}>Aucun vendeur configuré.</p>
              : <div style={{ display:'flex', flexDirection:'column', gap:6, paddingTop:8 }}>
                  {sellers.map(s => (
                    <SellerManageRow key={s.id} seller={s} onDelete={handleDeleteSeller} onStats={setStatsModal}/>
                  ))}
                </div>
            }
          </Section>

          {/* Permissions — verrouillé par PIN manager si un vendeur est en session */}
          <Section
            icon={<Shield size={16} color={permsUnlocked ? C.brand : C.inkMute}/>}
            title="Permissions vendeurs"
            subtitle={permsUnlocked ? "Ce que les vendeurs peuvent voir" : "🔒 Verrouillé — Code Manager requis"}
          >
            {!permsUnlocked ? (
              <div style={{ padding:'16px 0 8px', display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
                <div style={{
                  width:52, height:52, borderRadius:99, background:'rgba(245,158,11,0.1)',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                }}>
                  <Shield size={24} color="#b45309" strokeWidth={1.8}/>
                </div>
                <div style={{ textAlign:'center', maxWidth:320 }}>
                  <p style={{ fontSize:13.5, fontWeight:700, color:C.ink, marginBottom:4 }}>Accès restreint</p>
                  <p style={{ fontSize:12.5, color:C.inkMute, lineHeight:1.5 }}>
                    Un vendeur est connecté ({activeSeller?.name}). Saisissez le code Manager pour modifier les permissions.
                  </p>
                </div>
                <PinPad
                  value={permsUnlockPin}
                  onChange={v => { setPermsUnlockPin(v); setPermsUnlockError(''); if (v.length === 4) tryUnlockPerms(v); }}
                  error={permsUnlockError}
                  label=""
                />
                {permsUnlockError && (
                  <button
                    onClick={() => { setPermsUnlockPin(''); setPermsUnlockError(''); }}
                    style={{ fontSize:12, color:C.inkMute, background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
                    Réessayer
                  </button>
                )}
              </div>
            ) : (
              <>
                <div style={{ borderBottom:`1px solid ${C.hairline}` }}>
                  <Toggle enabled={perms.showDailyTotal} onChange={v=>updatePerm({showDailyTotal:v})} label="Voir le total du jour" description="Affiche le CA journalier du vendeur"/>
                </div>
                <div style={{ borderBottom:`1px solid ${C.hairline}` }}>
                  <Toggle enabled={perms.showTransactionHistory} onChange={v=>updatePerm({showTransactionHistory:v})} label="Voir l'historique des ventes" description="Les 5 dernières ventes du vendeur"/>
                </div>
                <Toggle enabled={perms.allowManualProductAdd} onChange={v=>updatePerm({allowManualProductAdd:v})} label="Autoriser l'ajout de produits" description="Créer un médicament dans le stock"/>
                {activeSeller && (
                  <button
                    onClick={() => setPermsUnlocked(false)}
                    style={{ marginTop:12, fontSize:11.5, color:C.inkMute, background:'none', border:'none', cursor:'pointer', fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                    🔒 Re-verrouiller la section
                  </button>
                )}
              </>
            )}
          </Section>

          {/* Déconnexion auto — protégée par le même verrou */}
          <Section
            icon={<Timer size={16} color={permsUnlocked ? C.brand : C.inkMute}/>}
            title="Déconnexion automatique"
            subtitle={permsUnlocked ? "Verrouillage après inactivité" : "🔒 Code Manager requis"}
          >
            {permsUnlocked ? (
              <>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8, paddingTop:8 }}>
                  {AUTO_LOGOUT_OPTIONS.map(opt => {
                    const active = perms.autoLogoutMinutes===opt.value;
                    return (
                      <button key={opt.value} onClick={() => updatePerm({autoLogoutMinutes:opt.value})}
                        style={{ padding:'8px 16px', borderRadius:10, fontSize:12, fontWeight:active?700:500, background:active?C.brand:C.bg, border:`1.5px solid ${active?C.brand:C.border}`, color:active?'#fff':C.inkSoft, cursor:'pointer' }}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {perms.autoLogoutMinutes>0 && <p style={{ fontSize:12, color:C.inkFaint, marginTop:10 }}>Session fermée après {perms.autoLogoutMinutes} min d'inactivité.</p>}
              </>
            ) : (
              <p style={{ fontSize:12.5, color:C.inkMute, padding:'8px 0', fontStyle:'italic' }}>
                Déverrouillez la section Permissions ci-dessus pour modifier ce réglage.
              </p>
            )}
          </Section>

          {/* Code Manager */}
          <button
            onClick={() => { setMgrNew(''); setMgrConfirm(''); setMgrStep('new'); setMgrError(''); setMgrPinModal(true); }}
            style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:C.panel, border:`1px solid ${C.border}`, borderRadius:16, cursor:'pointer', textAlign:'left', width:'100%' }}
          >
            <div style={{ width:36, height:36, borderRadius:10, background:C.amberLt, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <KeyRound size={16} color={C.amber}/>
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13, fontWeight:700, color:C.ink }}>Code Manager</p>
              <p style={{ fontSize:11.5, color:C.inkMute, marginTop:1 }}>Code actuel : {managerPin ? managerPin.replace(/./g,'•') : 'Non défini'}</p>
            </div>
            <ChevronRight size={15} color={C.inkFaint}/>
          </button>
        </div>

        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </>
  );

  function openPinModal(seller: Seller) {
    setPinModal(seller);
    setSwitchPin('');
    setSwitchError('');
  }
}
