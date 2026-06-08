// ════════════════════════════════════════════════════════════════════════════
//  DataImporter — Assistant d'importation « Mapping Wizard » (100 % local)
//  Étapes : Upload → Aperçu → Mapping → Validation → Import → Résultat
//  Fonctionnalités : template, profils fournisseurs, multi-feuilles,
//  validation EAN, conflits, prix-only, historique.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  UploadCloud, FileSpreadsheet, ArrowRight, ArrowLeft, Check, X,
  AlertTriangle, CheckCircle2, Loader2, RefreshCw, Boxes, Truck,
  Download, Save, Trash2, Clock, Tag, ChevronDown, ChevronUp,
  DollarSign, AlertCircle, Layers, ShieldAlert, ShieldCheck, ShieldX,
  ScanBarcode, CalendarX2, Building2, SkipForward, Zap, Eye,
} from 'lucide-react';
import {
  parseFile, parseFileWithSheet, autoDetectMapping, saveMapping,
  loadSavedMapping, applyMapping, importData, detectConflicts,
  downloadTemplate, saveMappingProfile, loadMappingProfiles, deleteMappingProfile,
  findMatchingProfile, addToImportHistory, getImportHistory,
  buildValidationReport,
  JUNGLE_FIELDS,
  type ParsedFile, type Mapping, type NormalizedRow, type ImportStats,
  type ImportMode, type JungleField, type MappingProfile, type ImportHistoryEntry, type Conflict,
  type ValidationReport,
} from '../lib/ImportService';
import { updateColumnsAfterImport } from '../lib/useInventoryColumns';

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = {
  brand:'#10785a', brandHi:'#149a73', brandLt:'rgba(16,120,90,0.08)',
  ink:'#0a0e14', inkMute:'#6b7280', inkFaint:'#9ca3af',
  border:'rgba(15,15,20,0.1)', panel:'#fff', bg:'#f9fafb',
  red:'#dc2626', redLt:'rgba(220,38,38,0.07)',
  amber:'#d97706', amberLt:'rgba(217,119,6,0.08)',
  blue:'#2563eb', blueLt:'rgba(37,99,235,0.08)',
  violet:'#7c3aed', violetLt:'rgba(124,58,237,0.08)',
};

type Step = 'upload' | 'preview' | 'mapping' | 'validate' | 'importing' | 'done';

interface Props { onImportComplete?: () => void; }

const STEP_LABELS: Record<Step, string> = {
  upload:'Fichier', preview:'Aperçu', mapping:'Mapping',
  validate:'Validation', importing:'Import', done:'Terminé',
};
const VISIBLE_STEPS: Step[] = ['upload','preview','mapping','validate'];

// ════════════════════════════════════════════════════════════════════════════
export default function DataImporter({ onImportComplete }: Props = {}) {
  const [step, setStep]           = useState<Step>('upload');
  const [file, setFile]           = useState<File | null>(null);
  const [parsed, setParsed]       = useState<ParsedFile | null>(null);
  const [mapping, setMapping]     = useState<Mapping>({});
  const [mode, setMode]           = useState<ImportMode>('delivery');
  const [dragOver, setDragOver]   = useState(false);
  const [parseError, setParseError] = useState('');
  const [parsing, setParsing]     = useState(false);
  const [progress, setProgress]   = useState<{cur:number;total:number;msg:string}>({cur:0,total:0,msg:''});
  const [stats, setStats]         = useState<ImportStats|null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [showSaveProfile, setShowSaveProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory]     = useState<ImportHistoryEntry[]>([]);
  const [profiles, setProfiles]   = useState<MappingProfile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Décisions utilisateur pour la validation pré-import ───────────────────
  // 'skip'  = exclure les lignes invalides / sans EAN
  // 'force' = importer quand même (avec tagging "Config requise")
  // null    = pas encore décidé — le bouton reste actif, mais une confirmation apparaît
  const [decisionBlocked, setDecisionBlocked] = useState<'skip'|'force'|null>(null);
  const [decisionNoEan,   setDecisionNoEan]   = useState<'skip'|'force'|null>(null);
  const [showProblematic, setShowProblematic] = useState(false);
  const [validationReport, setValidationReport] = useState<ValidationReport|null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false); // modale de confirmation

  useEffect(() => { setHistory(getImportHistory()); setProfiles(loadMappingProfiles()); }, [step]);

  // ── Chargement d'un fichier ─────────────────────────────────────────────────
  const handleFile = useCallback(async (f: File) => {
    if (!/\.(csv|xlsx|xls)$/i.test(f.name)) { setParseError('Format non supporté. Utilisez .csv, .xlsx ou .xls'); return; }
    setParseError(''); setParsing(true); setFile(f);
    try {
      const result = await parseFile(f);
      if (result.totalRows === 0) { setParseError('Le fichier est vide ou illisible.'); setParsing(false); return; }
      setParsed(result);
      const saved = loadSavedMapping(result.headers);
      setMapping(saved ?? autoDetectMapping(result.headers));
      setStep('preview');
    } catch (e) { setParseError(`Erreur : ${e instanceof Error ? e.message : String(e)}`); }
    finally { setParsing(false); }
  }, []);

  // ── Changement de feuille Excel ─────────────────────────────────────────────
  const handleSheetChange = useCallback(async (sheetIndex: number) => {
    if (!file || !parsed) return;
    setParsing(true);
    try {
      const result = await parseFileWithSheet(file, sheetIndex);
      setParsed(result);
      const saved = loadSavedMapping(result.headers);
      setMapping(saved ?? autoDetectMapping(result.headers));
    } catch { /* ignore */ }
    finally { setParsing(false); }
  }, [file, parsed]);

  // ── Rows normalisés ─────────────────────────────────────────────────────────
  const normalized = useMemo(() => parsed ? applyMapping(parsed, mapping) : [], [parsed, mapping]);
  const validRows  = useMemo(() => normalized.filter(r => r._errors.length === 0), [normalized]);
  const invalidRows = useMemo(() => normalized.filter(r => r._errors.length > 0), [normalized]);
  const warnRows   = useMemo(() => validRows.filter(r => r._warnings.length > 0), [validRows]);

  const hasRequiredMapping = mapping.designation !== undefined && mapping.prix_vente !== undefined;

  // ── Aller en validation (déclenche détection conflits + rapport qualité) ───
  const goToValidate = useCallback(async () => {
    saveMapping(parsed!.headers, mapping);
    // Reset les décisions à chaque nouvelle validation
    setDecisionBlocked(null);
    setDecisionNoEan(null);
    setShowProblematic(false);
    const report = buildValidationReport(normalized);
    setValidationReport(report);
    // Auto-décision si pas de lignes bloquées / sans EAN
    if (report.blocked === 0) setDecisionBlocked('skip');
    if (report.noEan === 0)   setDecisionNoEan('skip');
    setStep('validate');
    setConflictsLoading(true);
    setConflicts([]);
    try { setConflicts(await detectConflicts(validRows)); } catch { /* ignore */ }
    finally { setConflictsLoading(false); }
  }, [parsed, mapping, validRows, normalized]);

  // ── Vérification avant import : confirmation si décisions en attente ────────
  const handleImportClick = useCallback(() => {
    if (!validationReport) return;
    const hasPendingDecisions =
      (validationReport.blocked > 0 && decisionBlocked === null) ||
      (validationReport.noEan   > 0 && decisionNoEan   === null);
    if (hasPendingDecisions) {
      setShowImportConfirm(true); // affiche la modale d'avertissement
    } else {
      runImport();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validationReport, decisionBlocked, decisionNoEan]);

  // ── Lancer l'import ─────────────────────────────────────────────────────────
  const runImport = useCallback(async () => {
    if (!parsed) return;
    setShowImportConfirm(false);
    saveMapping(parsed.headers, mapping);
    setStep('importing');

    // Construire la liste finale selon les décisions utilisateur
    // Si décision non prise → comportement par défaut : skip (le plus sûr)
    const effectiveDecisionBlocked = decisionBlocked ?? 'skip';
    const effectiveDecisionNoEan   = decisionNoEan   ?? 'force'; // par défaut : importer avec tag

    let rowsToImport = normalized;
    if (effectiveDecisionBlocked === 'skip') rowsToImport = rowsToImport.filter(r => r._errors.length === 0);
    if (effectiveDecisionNoEan === 'skip')   rowsToImport = rowsToImport.filter(r => !!r.ean);
    const forceInvalid = effectiveDecisionBlocked === 'force';

    setProgress({ cur:0, total:rowsToImport.length, msg:'Préparation…' });
    try {
      const result = await importData(rowsToImport, mode, (cur,total,msg) => setProgress({cur,total,msg}), forceInvalid);
      setStats(result);
      setStep('done');
      addToImportHistory({ date: new Date().toISOString(), fileName: parsed.fileName, mode, stats: result });
      setHistory(getImportHistory());
      updateColumnsAfterImport(mapping, parsed.headers, { created: result.created, updated: result.updated });
      if (result.created + result.updated + (result.pricesUpdated || 0) > 0) {
        setTimeout(() => onImportComplete?.(), 2500);
      }
    } catch (e) {
      setStats({ created:0, updated:0, errors:1, unitsCreated:0, errorDetails:[String(e)] });
      setStep('done');
    }
  }, [parsed, mapping, normalized, mode, decisionBlocked, decisionNoEan, showImportConfirm, onImportComplete]);

  // ── Sauvegarder profil ──────────────────────────────────────────────────────
  const handleSaveProfile = () => {
    if (!parsed || !profileName.trim()) return;
    saveMappingProfile(profileName.trim(), parsed.headers, mapping);
    setProfiles(loadMappingProfiles());
    setProfileName(''); setShowSaveProfile(false);
  };

  const loadProfile = (p: MappingProfile) => { setMapping(p.mapping); };

  const reset = () => {
    setStep('upload'); setFile(null); setParsed(null); setMapping({});
    setStats(null); setParseError(''); setProgress({cur:0,total:0,msg:''});
    setConflicts([]); setMode('delivery');
  };

  const stepIdx = VISIBLE_STEPS.indexOf(step as Step) >= 0 ? VISIBLE_STEPS.indexOf(step as Step) : VISIBLE_STEPS.length;

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily:'inherit' }}>
      {/* ── Barre d'étapes ─────────────────────────────────────────────────── */}
      {step !== 'done' && step !== 'importing' && (
        <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:20 }}>
          {VISIBLE_STEPS.map((s,i) => (
            <div key={s} style={{ display:'flex', alignItems:'center', flex: i<3 ? 1 : 'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:24, height:24, borderRadius:99, flexShrink:0, background:i<=stepIdx ? C.brand:'rgba(0,0,0,0.06)', color:i<=stepIdx?'#fff':C.inkFaint, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, transition:'all 0.2s' }}>
                  {i < stepIdx ? <Check size={13}/> : i+1}
                </div>
                <span style={{ fontSize:12, fontWeight:i===stepIdx?700:500, color:i<=stepIdx?C.ink:C.inkFaint, whiteSpace:'nowrap' }}>{STEP_LABELS[s]}</span>
              </div>
              {i<3 && <div style={{ flex:1, height:2, margin:'0 6px', borderRadius:99, background:i<stepIdx?C.brand:'rgba(0,0,0,0.07)', transition:'all 0.2s' }} />}
            </div>
          ))}
        </div>
      )}

      {/* ══════ A. UPLOAD ══════════════════════════════════════════════════════ */}
      {step === 'upload' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* Zone drop */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f=e.dataTransfer.files?.[0]; if(f)handleFile(f); }}
            onClick={() => fileInputRef.current?.click()}
            style={{ border:`2px dashed ${dragOver?C.brand:C.border}`, borderRadius:14, padding:'36px 20px', textAlign:'center', cursor:'pointer', background:dragOver?C.brandLt:C.bg, transition:'all 0.15s' }}
          >
            {parsing ? (
              <Loader2 size={28} color={C.brand} style={{ margin:'0 auto 10px', display:'block', animation:'jp-spin 0.9s linear infinite' }} />
            ) : (
              <div style={{ width:52, height:52, borderRadius:14, background:'rgba(16,120,90,0.1)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                <UploadCloud size={26} color={C.brand} />
              </div>
            )}
            <p style={{ fontSize:14, fontWeight:700, color:C.ink, margin:'0 0 4px' }}>Glissez votre fichier ici</p>
            <p style={{ fontSize:12, color:C.inkMute, margin:'0 0 4px' }}>ou cliquez pour parcourir</p>
            <p style={{ fontSize:11, color:C.inkFaint, margin:0 }}>CSV · Excel (.xlsx, .xls) — traitement 100 % local</p>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display:'none' }}
              onChange={e => { const f=e.target.files?.[0]; if(f)handleFile(f); e.target.value=''; }} />
          </div>

          {parseError && <ErrBanner msg={parseError} />}

          {/* Bouton template */}
          <button onClick={downloadTemplate}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:10, border:`1px solid ${C.border}`, background:C.panel, color:C.inkMute, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
            <Download size={15} color={C.brand} /> Télécharger le modèle Excel
            <span style={{ marginLeft:'auto', fontSize:11, color:C.inkFaint }}>.xlsx</span>
          </button>

          {/* Historique */}
          {history.length > 0 && (
            <div>
              <button onClick={() => setShowHistory(v=>!v)}
                style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', fontSize:12.5, color:C.inkMute, fontFamily:'inherit', padding:'4px 0' }}>
                <Clock size={13}/> {history.length} import{history.length>1?'s':''} précédent{history.length>1?'s':''}
                {showHistory ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
              </button>
              {showHistory && (
                <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6 }}>
                  {history.slice(0,8).map(h => (
                    <div key={h.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, background:C.bg, border:`1px solid ${C.border}` }}>
                      <FileSpreadsheet size={14} color={C.inkMute} style={{ flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12.5, fontWeight:600, color:C.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.fileName}</div>
                        <div style={{ fontSize:11, color:C.inkFaint }}>{new Date(h.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
                      </div>
                      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:99, background:C.brandLt, color:C.brand }}>{MODE_LABELS[h.mode]}</span>
                        {h.stats.created > 0 && <span style={{ fontSize:10, color:C.brand }}>+{h.stats.created}</span>}
                        {h.stats.updated > 0 && <span style={{ fontSize:10, color:C.blue }}>↑{h.stats.updated}</span>}
                        {h.stats.errors > 0 && <span style={{ fontSize:10, color:C.amber }}>⚠{h.stats.errors}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════ B. APERÇU ══════════════════════════════════════════════════════ */}
      {step === 'preview' && parsed && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
            <FileSpreadsheet size={18} color={C.brand} />
            <div>
              <p style={{ fontSize:13.5, fontWeight:700, color:C.ink, margin:0 }}>{parsed.fileName}</p>
              <p style={{ fontSize:12, color:C.inkMute, margin:0 }}>{parsed.totalRows} lignes · {parsed.headers.length} colonnes détectées</p>
            </div>
          </div>

          {/* Sélecteur de feuille (multi-sheet Excel) */}
          {parsed.sheets && parsed.sheets.length > 1 && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, padding:'10px 14px', borderRadius:10, background:C.blueLt, border:`1px solid rgba(37,99,235,0.2)` }}>
              <Layers size={14} color={C.blue} style={{ flexShrink:0 }} />
              <span style={{ fontSize:12.5, color:C.blue, fontWeight:600 }}>Feuille :</span>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {parsed.sheets.map((s,i) => (
                  <button key={s} onClick={() => handleSheetChange(i)}
                    style={{ padding:'4px 10px', borderRadius:7, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background:i===parsed.selectedSheetIndex?C.blue:'rgba(37,99,235,0.12)', color:i===parsed.selectedSheetIndex?'#fff':C.blue, transition:'all 0.1s', fontFamily:'inherit' }}>
                    {s}
                  </button>
                ))}
              </div>
              {parsing && <Loader2 size={13} color={C.blue} style={{ animation:'jp-spin 0.9s linear infinite', flexShrink:0 }}/>}
            </div>
          )}

          <PreviewTable headers={parsed.headers} rows={parsed.rows.slice(0,5)} />
          <p style={{ fontSize:11.5, color:C.inkFaint, margin:'8px 2px 0' }}>Aperçu des 5 premières lignes. Vérifiez que les colonnes sont bien séparées.</p>
          <NavRow onBack={reset} backLabel="Changer de fichier" onNext={() => setStep('mapping')} nextLabel="Mapper les colonnes" />
        </div>
      )}

      {/* ══════ C. MAPPING ═════════════════════════════════════════════════════ */}
      {step === 'mapping' && parsed && (
        <div>
          {/* Profils fournisseurs */}
          {profiles.length > 0 && (
            <div style={{ marginBottom:14, padding:'10px 14px', borderRadius:10, background:C.violetLt, border:`1px solid rgba(124,58,237,0.2)` }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <Tag size={13} color={C.violet} />
                <span style={{ fontSize:12, fontWeight:700, color:C.violet }}>Profils fournisseurs</span>
              </div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {profiles.map(p => (
                  <div key={p.id} style={{ display:'flex', alignItems:'center', gap:0 }}>
                    <button onClick={() => loadProfile(p)}
                      style={{ padding:'5px 10px', borderRadius:'7px 0 0 7px', border:'1px solid rgba(124,58,237,0.3)', borderRight:'none', background:C.panel, cursor:'pointer', fontSize:12, fontWeight:600, color:C.violet, fontFamily:'inherit' }}>
                      {p.name}
                    </button>
                    <button onClick={() => { deleteMappingProfile(p.id); setProfiles(loadMappingProfiles()); }}
                      style={{ padding:'5px 7px', borderRadius:'0 7px 7px 0', border:'1px solid rgba(124,58,237,0.3)', background:C.panel, cursor:'pointer', color:C.inkFaint, display:'flex', alignItems:'center' }}>
                      <Trash2 size={11}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p style={{ fontSize:13, color:C.inkMute, margin:'0 0 14px', lineHeight:1.5 }}>
            Associez chaque champ JunglePharm à une colonne de votre fichier.
            Les champs <strong style={{ color:C.ink }}>obligatoires</strong> sont marqués *.
          </p>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {JUNGLE_FIELDS.map(field => (
              <MappingRow key={field.key} field={field} headers={parsed.headers} sampleRow={parsed.rows[0]} value={mapping[field.key]}
                onChange={colIdx => setMapping(m => { const n={...m}; if(colIdx===null)delete n[field.key]; else n[field.key]=colIdx; return n; })} />
            ))}
          </div>

          {!hasRequiredMapping && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:12, padding:'10px 14px', background:C.amberLt, border:'1px solid rgba(217,119,6,0.2)', borderRadius:10, fontSize:12.5, color:C.amber }}>
              <AlertTriangle size={14} style={{ flexShrink:0 }} /> Mappez au minimum <strong>Désignation</strong> et <strong>Prix Vente</strong> pour continuer.
            </div>
          )}

          {/* Sauvegarder le profil */}
          <div style={{ marginTop:14 }}>
            {!showSaveProfile ? (
              <button onClick={() => setShowSaveProfile(true)}
                style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', fontSize:12.5, color:C.inkMute, fontFamily:'inherit', padding:'4px 0' }}>
                <Save size={13}/> Sauvegarder ce mapping comme profil fournisseur
              </button>
            ) : (
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input value={profileName} onChange={e=>setProfileName(e.target.value)}
                  onKeyDown={e => { if(e.key==='Enter')handleSaveProfile(); if(e.key==='Escape'){setShowSaveProfile(false);setProfileName('');} }}
                  placeholder="Ex : Laborex Congo" autoFocus
                  style={{ flex:1, height:36, padding:'0 12px', borderRadius:8, border:`1.5px solid ${C.violet}`, fontSize:13, fontFamily:'inherit', outline:'none' }} />
                <button onClick={handleSaveProfile} disabled={!profileName.trim()}
                  style={{ height:36, padding:'0 14px', borderRadius:8, background:profileName.trim()?C.violet:'rgba(0,0,0,0.1)', border:'none', color:'#fff', fontSize:12.5, fontWeight:600, cursor:profileName.trim()?'pointer':'not-allowed', fontFamily:'inherit' }}>
                  Sauvegarder
                </button>
                <button onClick={() => { setShowSaveProfile(false); setProfileName(''); }}
                  style={{ height:36, width:36, borderRadius:8, border:`1px solid ${C.border}`, background:C.panel, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <X size={13} color={C.inkMute}/>
                </button>
              </div>
            )}
          </div>

          <NavRow onBack={() => setStep('preview')} backLabel="Retour" onNext={goToValidate} nextLabel="Valider les données" nextDisabled={!hasRequiredMapping} />
        </div>
      )}

      {/* ══════ D. VALIDATION PRÉ-IMPORT ══════════════════════════════════════ */}
      {step === 'validate' && parsed && validationReport && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <style>{`@keyframes jp-spin{to{transform:rotate(360deg)}}`}</style>

          {/* ── Bandeau analyse ─────────────────────────────────────────────── */}
          <div style={{ padding:'14px 16px', borderRadius:12, background:'rgba(16,120,90,0.05)', border:'1px solid rgba(16,120,90,0.18)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <ShieldCheck size={16} color={C.brand} />
              <span style={{ fontSize:13.5, fontWeight:800, color:C.ink, letterSpacing:'-0.01em' }}>Rapport d'analyse qualité</span>
            </div>
            <p style={{ fontSize:12.5, color:C.inkMute, margin:'0 0 12px', lineHeight:1.5 }}>
              <strong style={{ color:C.ink }}>{validationReport.total.toLocaleString('fr-FR')} produits détectés</strong> dans le fichier.
              {validationReport.clean > 0 && <> <span style={{ color:C.brand, fontWeight:700 }}>{validationReport.clean.toLocaleString('fr-FR')} complets</span>{' '}(EAN + Prix + Péremption).</>}
              {validationReport.blocked > 0 && <> <span style={{ color:C.red, fontWeight:700 }}>{validationReport.blocked} bloqués</span> (champs critiques manquants).</>}
            </p>
            {/* Grille de métriques */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:8 }}>
              {[
                { icon:<ShieldCheck size={13}/>, label:'Complets', value:validationReport.clean, color:C.brand, bg:C.brandLt },
                { icon:<ShieldAlert size={13}/>, label:'Avertissements', value:validationReport.warnings, color:C.amber, bg:C.amberLt },
                { icon:<ShieldX size={13}/>, label:'Bloqués', value:validationReport.blocked, color:C.red, bg:C.redLt },
                { icon:<ScanBarcode size={13}/>, label:'Sans EAN', value:validationReport.noEan, color:'#6b7280', bg:'rgba(107,114,128,0.08)' },
                { icon:<CalendarX2 size={13}/>, label:'Sans péremption', value:validationReport.noExpiry, color:C.amber, bg:C.amberLt },
                { icon:<Building2 size={13}/>, label:'Sans fournisseur', value:validationReport.noSupplier, color:'#6b7280', bg:'rgba(107,114,128,0.08)' },
              ].map(m => (
                <div key={m.label} style={{ padding:'9px 11px', borderRadius:9, background:m.bg, display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ color:m.color, flexShrink:0 }}>{m.icon}</span>
                  <div>
                    <div style={{ fontSize:15, fontWeight:800, color:m.color, letterSpacing:'-0.02em', fontVariantNumeric:'tabular-nums' }}>{m.value.toLocaleString('fr-FR')}</div>
                    <div style={{ fontSize:10, color:m.color, opacity:0.75, fontWeight:600 }}>{m.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Décision 1 : lignes bloquées ────────────────────────────────── */}
          {validationReport.blocked > 0 && (
            <DecisionPanel
              icon={<ShieldX size={16} color={C.red}/>}
              title={`${validationReport.blocked} ligne${validationReport.blocked>1?'s':''} bloquée${validationReport.blocked>1?'s':''} — champs critiques manquants`}
              subtitle={`Désignation ou Prix de vente absent${validationReport.blocked>1?'s':''} — ces lignes ne peuvent pas être importées telles quelles.`}
              color={C.red}
              bg={C.redLt}
              decision={decisionBlocked}
              options={[
                { key:'skip', label:'Ignorer ces lignes', desc:'Les lignes invalides sont exclues. Seules les lignes valides seront importées.', icon:<SkipForward size={13}/> },
                { key:'force', label:'Forcer l\'import', desc:'⚠ Ces lignes seront importées sans prix / désignation. À corriger manuellement.', icon:<Zap size={13}/>, danger:true },
              ]}
              onDecide={d => setDecisionBlocked(d as 'skip'|'force')}
              rows={invalidRows.slice(0,5)}
              showRows={showProblematic}
              onToggleRows={() => setShowProblematic(v=>!v)}
            />
          )}

          {/* ── Décision 2 : lignes sans EAN ────────────────────────────────── */}
          {validationReport.noEan > 0 && (
            <DecisionPanel
              icon={<ScanBarcode size={16} color={C.amber}/>}
              title={`${validationReport.noEan.toLocaleString('fr-FR')} produit${validationReport.noEan>1?'s':''} sans EAN — douchette non utilisable`}
              subtitle="Ces produits importés sans code-barres seront étiquetés « Configuration douchette requise » dans l'inventaire."
              color={C.amber}
              bg={C.amberLt}
              decision={decisionNoEan}
              options={[
                { key:'force', label:'Importer (étiqueter)', desc:'Importés avec le statut "Config douchette requise". Vous pourrez scanner et assigner l\'EAN plus tard.', icon:<ShieldAlert size={13}/> },
                { key:'skip',  label:'Exclure ces lignes', desc:'Seuls les produits avec EAN valide seront importés. Les autres sont ignorés.', icon:<SkipForward size={13}/> },
              ]}
              onDecide={d => setDecisionNoEan(d as 'skip'|'force')}
            />
          )}

          {/* ── Conflits détectés ───────────────────────────────────────────── */}
          {conflictsLoading && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:10, background:C.violetLt, border:`1px solid rgba(124,58,237,0.18)`, fontSize:12.5, color:C.violet }}>
              <Loader2 size={13} style={{ animation:'jp-spin 0.9s linear infinite' }}/> Analyse des doublons en cours…
            </div>
          )}
          {!conflictsLoading && conflicts.length > 0 && (
            <details style={{ borderRadius:10, overflow:'hidden', border:`1px solid rgba(124,58,237,0.2)` }}>
              <summary style={{ fontSize:13, color:C.violet, cursor:'pointer', fontWeight:700, padding:'11px 14px', background:C.violetLt, display:'flex', alignItems:'center', gap:8, listStyle:'none' }}>
                🔀 {conflicts.length} doublon{conflicts.length>1?'s':''} potentiel{conflicts.length>1?'s':''}
                <span style={{ marginLeft:'auto', fontSize:10.5, fontWeight:500, opacity:0.8 }}>cliquer pour voir</span>
              </summary>
              <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:5, maxHeight:160, overflowY:'auto' }}>
                {conflicts.map((c,i) => (
                  <div key={i} style={{ fontSize:12, padding:'6px 10px', borderRadius:8, background:'rgba(124,58,237,0.04)', border:'1px solid rgba(124,58,237,0.12)' }}>
                    <span style={{ fontWeight:600 }}>"{c.rowName.slice(0,25)}"</span>
                    <span style={{ color:C.inkMute }}> ≈ </span>
                    <span style={{ color:C.violet, fontWeight:600 }}>"{c.existingName.slice(0,25)}"</span>
                    <span style={{ fontSize:10, padding:'1px 6px', borderRadius:99, background:C.violetLt, color:C.violet, marginLeft:6 }}>
                      {c.matchType === 'ean_match' ? 'EAN' : 'nom similaire'}
                    </span>
                  </div>
                ))}
                <p style={{ fontSize:11, color:C.inkFaint, margin:'4px 0 0' }}>En mode Livraison, les produits connus seront mis à jour et les nouveaux créés.</p>
              </div>
            </details>
          )}

          {/* ── Aperçu des lignes valides ───────────────────────────────────── */}
          <details style={{ borderRadius:10, overflow:'hidden', border:`1px solid ${C.border}` }}>
            <summary style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:C.bg, cursor:'pointer', fontSize:12.5, fontWeight:700, color:C.ink, listStyle:'none' }}>
              <Eye size={14} color={C.inkMute}/>
              Aperçu des {Math.min(8,validRows.length)} première{validRows.length>1?'s':''} lignes valides
              <span style={{ marginLeft:'auto', fontSize:10.5, color:C.inkFaint, fontWeight:500 }}>sur {validRows.length.toLocaleString('fr-FR')}</span>
            </summary>
            <div style={{ padding:'10px 12px 12px' }}>
              <ValidationTable rows={validRows.slice(0,8)} />
            </div>
          </details>

          {/* ── Type d'import ───────────────────────────────────────────────── */}
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:C.ink, margin:'0 0 10px' }}>Type d'import</p>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <ModeOption active={mode==='delivery'} onClick={() => setMode('delivery')} icon={<Truck size={17}/>}
                title="Réception de livraison (ajouter)" desc="Ajoute au stock existant. Met à jour les produits connus, crée les nouveaux." />
              <ModeOption active={mode==='prices_only'} onClick={() => setMode('prices_only')} icon={<DollarSign size={17}/>}
                title="Mise à jour des prix seulement" desc="Met à jour uniquement prix achat/vente. Aucun changement de stock ni de créations." color={C.blue} />
              <ModeOption active={mode==='install'} onClick={() => setMode('install')} icon={<Boxes size={17}/>}
                title="Installation (remplacer tout)" desc="⚠ Vide le catalogue actuel et le remplace intégralement par ce fichier." danger />
            </div>
          </div>

          {/* ── Récapitulatif final avant import ────────────────────────────── */}
          {(() => {
            const effectiveBlocked = decisionBlocked ?? 'skip';
            const effectiveNoEan   = decisionNoEan   ?? 'force';
            const willImportCount =
              (effectiveBlocked === 'skip' ? validRows.length : normalized.length) -
              (effectiveNoEan === 'skip' ? validationReport.noEan : 0);
            const pendingDecisions =
              (validationReport.blocked > 0 && decisionBlocked === null) ||
              (validationReport.noEan   > 0 && decisionNoEan   === null);
            return (
              <div style={{ padding:'14px 16px', borderRadius:12, background: C.brandLt, border:`1px solid rgba(16,120,90,0.25)` }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                  <div>
                    <div style={{ fontSize:13.5, fontWeight:800, color:C.brand }}>
                      {willImportCount > 0
                        ? `${willImportCount.toLocaleString('fr-FR')} produit${willImportCount>1?'s':''} à importer`
                        : 'Aucun produit sélectionné'}
                    </div>
                    <div style={{ fontSize:11.5, color:C.inkMute, marginTop:2, display:'flex', alignItems:'center', gap:6 }}>
                      {pendingDecisions && <span style={{ color:C.amber, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}><AlertTriangle size={10}/> Décisions en attente — une confirmation vous sera demandée</span>}
                      {!pendingDecisions && <>
                        {effectiveNoEan === 'force' && validationReport.noEan > 0 && <span>{validationReport.noEan} sans EAN (étiquetés) · </span>}
                        {effectiveBlocked === 'force' && validationReport.blocked > 0 && <span>{validationReport.blocked} forcés · </span>}
                        <span>Mode : {MODE_LABELS[mode]}</span>
                      </>}
                    </div>
                  </div>
                  <button
                    onClick={handleImportClick}
                    disabled={willImportCount === 0}
                    style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'10px 20px', borderRadius:10, border:'none', background: willImportCount===0?'rgba(0,0,0,0.15)':mode==='install'?C.red:`linear-gradient(135deg,${C.brand},${C.brandHi})`, color:'#fff', fontSize:13, fontWeight:700, cursor:willImportCount===0?'not-allowed':'pointer', fontFamily:'inherit', boxShadow:willImportCount===0?'none':mode==='install'?'0 2px 10px rgba(220,38,38,0.3)':'0 2px 10px rgba(16,120,90,0.3)', whiteSpace:'nowrap', opacity:willImportCount===0?0.5:1 }}>
                    {mode==='install'?'⚠ Remplacer tout':'Lancer l\'import'} <ArrowRight size={14}/>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ── Modale de confirmation quand décisions en attente ──────────── */}
          {showImportConfirm && validationReport && (
            <ConfirmImportModal
              report={validationReport}
              mode={mode}
              onConfirm={() => runImport()}
              onCancel={() => setShowImportConfirm(false)}
            />
          )}

          <button onClick={() => setStep('mapping')} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'9px 14px', borderRadius:10, border:`1px solid ${C.border}`, background:C.panel, color:C.inkMute, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', alignSelf:'flex-start' }}>
            <ArrowLeft size={14}/> Retour au mapping
          </button>
        </div>
      )}

      {/* ══════ IMPORT EN COURS ════════════════════════════════════════════════ */}
      {step === 'importing' && (
        <div style={{ textAlign:'center', padding:'32px 16px' }}>
          <style>{`@keyframes jp-spin{to{transform:rotate(360deg)}}`}</style>
          <Loader2 size={36} color={C.brand} style={{ margin:'0 auto 16px', display:'block', animation:'jp-spin 0.9s linear infinite' }} />
          <p style={{ fontSize:14, fontWeight:600, color:C.ink, margin:'0 0 16px' }}>{progress.msg}</p>
          <div style={{ height:8, borderRadius:99, background:'rgba(0,0,0,0.06)', overflow:'hidden', maxWidth:320, margin:'0 auto' }}>
            <div style={{ height:'100%', borderRadius:99, background:`linear-gradient(90deg,${C.brand},${C.brandHi})`, width:`${progress.total?Math.min(100,(progress.cur/progress.total)*100):0}%`, transition:'width 0.3s' }} />
          </div>
          <p style={{ fontSize:12, color:C.inkFaint, marginTop:8 }}>{progress.cur} / {progress.total}</p>
        </div>
      )}

      {/* ══════ RÉSULTAT ═══════════════════════════════════════════════════════ */}
      {step === 'done' && stats && (
        <div style={{ textAlign:'center', padding:'20px 16px' }}>
          <div style={{ width:64, height:64, borderRadius:99, background:stats.errors>0&&stats.created+stats.updated===0?C.redLt:C.brandLt, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
            {stats.errors>0&&stats.created+stats.updated===0&&(stats.pricesUpdated||0)===0 ? <X size={30} color={C.red}/> : <CheckCircle2 size={32} color={C.brand}/>}
          </div>
          <h3 style={{ fontSize:18, fontWeight:800, color:C.ink, margin:'0 0 4px' }}>
            {stats.created+stats.updated+(stats.pricesUpdated||0) > 0 ? 'Import terminé !' : 'Aucune donnée importée'}
          </h3>
          <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap', margin:'12px 0 6px' }}>
            {stats.created > 0 && <StatChip color={C.brand} bg={C.brandLt} value={stats.created} label="créés" />}
            {stats.updated > 0 && <StatChip color={C.blue} bg={C.blueLt} value={stats.updated} label="mis à jour" />}
            {(stats.pricesUpdated||0) > 0 && <StatChip color={C.blue} bg={C.blueLt} value={stats.pricesUpdated!} label="prix modifiés" />}
            {stats.unitsCreated > 0 && <StatChip color={C.violet} bg={C.violetLt} value={stats.unitsCreated} label="unités JP" />}
            {stats.errors > 0 && <StatChip color={C.amber} bg={C.amberLt} value={stats.errors} label="erreurs" />}
          </div>
          {stats.errorDetails.length > 0 && (
            <details style={{ marginTop:8, textAlign:'left', maxWidth:360, marginInline:'auto' }}>
              <summary style={{ fontSize:12, color:C.amber, cursor:'pointer' }}>Détail des erreurs</summary>
              <div style={{ marginTop:4, fontSize:11, color:C.inkMute, maxHeight:100, overflowY:'auto' }}>
                {stats.errorDetails.map((e,i) => <div key={i} style={{ padding:'2px 0' }}>• {e}</div>)}
              </div>
            </details>
          )}
          <button onClick={reset} style={{ marginTop:16, padding:'10px 22px', borderRadius:10, border:`1px solid ${C.border}`, background:C.panel, color:C.ink, fontSize:13.5, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7, fontFamily:'inherit' }}>
            <RefreshCw size={14}/> Nouvel import
          </button>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  SOUS-COMPOSANTS
// ════════════════════════════════════════════════════════════════════════════
const MODE_LABELS: Record<string, string> = { install:'Installation', delivery:'Livraison', prices_only:'Prix' };

function ErrBanner({ msg }: { msg: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:C.redLt, border:'1px solid rgba(220,38,38,0.18)', borderRadius:10, fontSize:13, color:C.red }}>
      <AlertCircle size={15} style={{ flexShrink:0 }}/> {msg}
    </div>
  );
}

function PreviewTable({ headers, rows }: { headers:string[]; rows:string[][] }) {
  return (
    <div style={{ border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead><tr style={{ background:C.bg }}>
            {headers.map((h,i) => <th key={i} style={{ textAlign:'left', padding:'8px 12px', fontWeight:700, color:C.ink, whiteSpace:'nowrap', borderBottom:`1px solid ${C.border}`, borderRight:i<headers.length-1?'1px solid rgba(0,0,0,0.04)':'none' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r,ri) => <tr key={ri} style={{ borderBottom:ri<rows.length-1?'1px solid rgba(0,0,0,0.04)':'none' }}>
              {headers.map((_,ci) => <td key={ci} style={{ padding:'7px 12px', color:C.inkMute, whiteSpace:'nowrap', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', borderRight:ci<headers.length-1?'1px solid rgba(0,0,0,0.04)':'none' }}>{r[ci]??''}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ValidationTable({ rows }: { rows: NormalizedRow[] }) {
  const cols = ['Désignation','EAN','P. Achat','P. Vente','Stock','Périm.'];
  return (
    <div style={{ border:`1px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead><tr style={{ background:C.bg }}>
            {cols.map(h => <th key={h} style={{ textAlign:'left', padding:'8px 12px', fontWeight:600, color:C.inkMute, whiteSpace:'nowrap', borderBottom:`1px solid ${C.border}` }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r,i) => (
              <tr key={i} style={{ borderBottom:i<rows.length-1?'1px solid rgba(0,0,0,0.04)':'none', background:r._warnings.length>0?'rgba(217,119,6,0.03)':'transparent' }}>
                <td style={{ padding:'7px 12px', fontWeight:600, color:C.ink, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {r.name}
                  {r._warnings.length > 0 && <AlertTriangle size={10} color={C.amber} style={{ marginLeft:5, display:'inline', verticalAlign:'middle' }}/>}
                </td>
                <td style={{ padding:'7px 12px', color:C.inkMute, fontFamily:'monospace', fontSize:11 }}>{r.ean||'—'}</td>
                <td style={{ padding:'7px 12px', color:C.inkMute }}>{r.buyingPrice?r.buyingPrice.toLocaleString('fr-FR'):'—'}</td>
                <td style={{ padding:'7px 12px', fontWeight:600, color:C.brand }}>{r.sellingPrice.toLocaleString('fr-FR')}</td>
                <td style={{ padding:'7px 12px', color:C.inkMute }}>{r.stock}</td>
                <td style={{ padding:'7px 12px', color:C.inkMute, fontSize:11 }}>{r.expiry||'—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MappingRow({ field, headers, sampleRow, value, onChange }: {
  field: typeof JUNGLE_FIELDS[number]; headers:string[]; sampleRow:string[]|undefined;
  value:number|undefined; onChange:(colIdx:number|null)=>void;
}) {
  const sample = value !== undefined && sampleRow ? sampleRow[value] : '';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:value!==undefined?C.brandLt:C.bg, border:`1px solid ${value!==undefined?'rgba(16,120,90,0.2)':C.border}`, borderRadius:11 }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>
          {field.label}{field.required&&<span style={{ color:C.red, marginLeft:3 }}>*</span>}
        </div>
        <div style={{ fontSize:11, color:C.inkFaint }}>{field.hint}</div>
      </div>
      <ArrowRight size={14} color={C.inkFaint} style={{ flexShrink:0 }}/>
      <div style={{ flex:1.2, minWidth:0 }}>
        <select value={value??''} onChange={e=>onChange(e.target.value===''?null:Number(e.target.value))}
          style={{ width:'100%', height:38, padding:'0 10px', borderRadius:9, border:`1.5px solid ${value!==undefined?C.brand:C.border}`, background:'#fff', fontSize:13, color:C.ink, cursor:'pointer', fontFamily:'inherit', outline:'none' }}>
          <option value="">— Ignorer —</option>
          {headers.map((h,i) => <option key={i} value={i}>{h}</option>)}
        </select>
        {sample&&<div style={{ fontSize:10.5, color:C.inkFaint, marginTop:3, paddingLeft:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>ex : {sample}</div>}
      </div>
    </div>
  );
}

function ModeOption({ active, onClick, icon, title, desc, danger, color }: {
  active:boolean; onClick:()=>void; icon:React.ReactNode; title:string; desc:string; danger?:boolean; color?:string;
}) {
  const ac = danger ? C.red : (color || C.brand);
  return (
    <button onClick={onClick} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 14px', borderRadius:11, cursor:'pointer', textAlign:'left', width:'100%', fontFamily:'inherit', background:active?(danger?C.redLt:`rgba(${color?'37,99,235':'16,120,90'},0.08)`):C.bg, border:`1.5px solid ${active?ac:C.border}`, transition:'all 0.12s' }}>
      <div style={{ width:34, height:34, borderRadius:10, flexShrink:0, background:active?`${ac}20`:'rgba(0,0,0,0.05)', display:'flex', alignItems:'center', justifyContent:'center', color:active?ac:C.inkMute }}>{icon}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:700, color:active?ac:C.ink, marginBottom:2 }}>{title}</div>
        <div style={{ fontSize:11.5, color:C.inkMute, lineHeight:1.4 }}>{desc}</div>
      </div>
      <div style={{ width:18, height:18, borderRadius:99, flexShrink:0, marginTop:2, border:`2px solid ${active?ac:C.border}`, background:active?ac:'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {active && <Check size={11} color="#fff"/>}
      </div>
    </button>
  );
}

function StatChip({ color, bg, value, label }: { color:string; bg:string; value:number; label:string }) {
  return (
    <div style={{ display:'inline-flex', alignItems:'baseline', gap:5, padding:'6px 12px', borderRadius:9, background:bg }}>
      <span style={{ fontSize:16, fontWeight:800, color }}>{value.toLocaleString('fr-FR')}</span>
      <span style={{ fontSize:11, color, fontWeight:500, opacity:0.85 }}>{label}</span>
    </div>
  );
}

// ── Modale de confirmation import avec données incomplètes ───────────────────
function ConfirmImportModal({
  report, mode, onConfirm, onCancel,
}: {
  report: ValidationReport;
  mode: ImportMode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const issues: string[] = [];
  if (report.blocked > 0)    issues.push(`${report.blocked} ligne${report.blocked>1?'s':''} sans Désignation ou Prix (seront ignorées)`);
  if (report.noEan > 0)      issues.push(`${report.noEan.toLocaleString('fr-FR')} produit${report.noEan>1?'s':''} sans EAN — douchette non utilisable`);
  if (report.noExpiry > 0)   issues.push(`${report.noExpiry.toLocaleString('fr-FR')} produit${report.noExpiry>1?'s':''} sans date de péremption`);
  if (report.noSupplier > 0) issues.push(`${report.noSupplier.toLocaleString('fr-FR')} produit${report.noSupplier>1?'s':''} sans fournisseur renseigné`);

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(10,14,20,0.55)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:18, boxShadow:'0 24px 60px rgba(0,0,0,0.18)', width:'100%', maxWidth:440, padding:'28px 28px 24px' }}>
        {/* Icône */}
        <div style={{ width:52, height:52, borderRadius:99, background:'rgba(217,119,6,0.1)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
          <AlertTriangle size={26} color={C.amber} />
        </div>

        {/* Titre */}
        <h2 style={{ textAlign:'center', fontSize:17, fontWeight:800, color:'#0a0e14', margin:'0 0 6px', letterSpacing:'-0.02em' }}>
          Données incomplètes détectées
        </h2>
        <p style={{ textAlign:'center', fontSize:13, color:'#6b7280', margin:'0 0 18px', lineHeight:1.55 }}>
          Il manque plusieurs éléments à votre inventaire. Êtes-vous sûr de vouloir importer quand même ?
        </p>

        {/* Liste des problèmes */}
        <div style={{ background:'rgba(217,119,6,0.05)', border:'1px solid rgba(217,119,6,0.2)', borderRadius:10, padding:'12px 14px', marginBottom:20 }}>
          {issues.map((issue, i) => (
            <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'4px 0', borderBottom:i<issues.length-1?'1px solid rgba(217,119,6,0.1)':'none' }}>
              <AlertTriangle size={12} color={C.amber} style={{ flexShrink:0, marginTop:2 }} />
              <span style={{ fontSize:12.5, color:'#92400e', lineHeight:1.4 }}>{issue}</span>
            </div>
          ))}
        </div>

        {/* Note comportement par défaut */}
        <div style={{ background:'rgba(16,120,90,0.05)', border:'1px solid rgba(16,120,90,0.15)', borderRadius:8, padding:'10px 12px', marginBottom:20, fontSize:12, color:'#065f46', lineHeight:1.5 }}>
          <strong>Comportement par défaut :</strong> les lignes sans Désignation/Prix seront ignorées. Les produits sans EAN seront importés avec le statut "Configuration douchette requise".
        </div>

        {/* Boutons */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onCancel}
            style={{ flex:1, padding:'11px 0', borderRadius:10, border:'1px solid rgba(0,0,0,0.1)', background:'#f9fafb', color:'#374151', fontSize:13.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
            Retour — je vais corriger
          </button>
          <button onClick={onConfirm}
            style={{ flex:1, padding:'11px 0', borderRadius:10, border:'none', background:`linear-gradient(135deg,${C.brand},${C.brandHi})`, color:'#fff', fontSize:13.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 2px 10px rgba(16,120,90,0.25)' }}>
            Importer quand même
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Panneau de décision utilisateur ──────────────────────────────────────────
interface DecisionOption { key:string; label:string; desc:string; icon:React.ReactNode; danger?:boolean; }
function DecisionPanel({
  icon, title, subtitle, color, bg, decision, options, onDecide, rows, showRows, onToggleRows,
}: {
  icon:React.ReactNode; title:string; subtitle:string; color:string; bg:string;
  decision:string|null; options:DecisionOption[]; onDecide:(key:string)=>void;
  rows?:NormalizedRow[]; showRows?:boolean; onToggleRows?:()=>void;
}) {
  return (
    <div style={{ borderRadius:12, overflow:'hidden', border:`1.5px solid ${decision ? 'rgba(0,0,0,0.1)' : color+'40'}`, transition:'border-color 0.2s' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', background:bg }}>
        <span style={{ flexShrink:0, marginTop:1 }}>{icon}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#0a0e14' }}>{title}</div>
          <div style={{ fontSize:11.5, color:'#6b7280', marginTop:2, lineHeight:1.4 }}>{subtitle}</div>
        </div>
        {decision && (
          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, background:`${color}15`, color, flexShrink:0, marginTop:2 }}>
            ✓ {options.find(o=>o.key===decision)?.label}
          </span>
        )}
      </div>

      {/* Options de décision */}
      <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:7, background:'#fff' }}>
        {options.map(opt => (
          <button key={opt.key} onClick={() => onDecide(opt.key)}
            style={{
              display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', borderRadius:9, cursor:'pointer', textAlign:'left', width:'100%', fontFamily:'inherit',
              background:decision===opt.key ? (opt.danger?'rgba(220,38,38,0.08)':'rgba(16,120,90,0.07)') : '#f9fafb',
              border:`1.5px solid ${decision===opt.key ? (opt.danger?'rgba(220,38,38,0.35)':'rgba(16,120,90,0.3)') : 'rgba(0,0,0,0.08)'}`,
              transition:'all 0.1s',
            }}>
            <div style={{ width:30, height:30, borderRadius:8, flexShrink:0, background:decision===opt.key?(opt.danger?'rgba(220,38,38,0.12)':'rgba(16,120,90,0.12)'):'rgba(0,0,0,0.05)', display:'flex', alignItems:'center', justifyContent:'center', color:decision===opt.key?(opt.danger?C.red:C.brand):'#9ca3af' }}>
              {opt.icon}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12.5, fontWeight:700, color:decision===opt.key?(opt.danger?C.red:C.brand):'#0a0e14' }}>{opt.label}</div>
              <div style={{ fontSize:11, color:'#6b7280', marginTop:1, lineHeight:1.4 }}>{opt.desc}</div>
            </div>
            <div style={{ width:16, height:16, borderRadius:99, flexShrink:0, marginTop:3, border:`2px solid ${decision===opt.key?(opt.danger?C.red:C.brand):'#d1d5db'}`, background:decision===opt.key?(opt.danger?C.red:C.brand):'transparent', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {decision===opt.key && <Check size={9} color="#fff" strokeWidth={3}/>}
            </div>
          </button>
        ))}

        {/* Aperçu des lignes problématiques */}
        {rows && rows.length > 0 && (
          <div>
            <button onClick={onToggleRows} style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'none', cursor:'pointer', fontSize:11.5, color:'#6b7280', fontFamily:'inherit', padding:'2px 0' }}>
              <Eye size={12}/> {showRows ? 'Masquer' : `Voir`} les {rows.length} ligne{rows.length>1?'s':''} concernées
            </button>
            {showRows && (
              <div style={{ marginTop:6, maxHeight:130, overflowY:'auto', borderRadius:8, border:'1px solid rgba(0,0,0,0.07)', overflow:'hidden' }}>
                {rows.map((r,i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:i%2===0?'#f9fafb':'#fff', borderBottom:i<rows.length-1?'1px solid rgba(0,0,0,0.04)':'none', fontSize:11.5 }}>
                    <span style={{ color:'#9ca3af', fontVariantNumeric:'tabular-nums', minWidth:32 }}>L.{r._rowIndex+1}</span>
                    <span style={{ flex:1, color:'#374151', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.name || '(sans nom)'}</span>
                    <span style={{ color:C.red, fontSize:10.5 }}>{r._errors.join(' · ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NavRow({ onBack, backLabel, onNext, nextLabel, nextDisabled, danger }: {
  onBack:()=>void; backLabel:string; onNext:()=>void; nextLabel:string; nextDisabled?:boolean; danger?:boolean;
}) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', gap:10, marginTop:20 }}>
      <button onClick={onBack} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'10px 16px', borderRadius:10, border:`1px solid ${C.border}`, background:C.panel, color:C.inkMute, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
        <ArrowLeft size={14}/> {backLabel}
      </button>
      <button onClick={onNext} disabled={nextDisabled} style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'10px 20px', borderRadius:10, border:'none', background:nextDisabled?'rgba(0,0,0,0.12)':danger?C.red:`linear-gradient(135deg,${C.brand},${C.brandHi})`, color:'#fff', fontSize:13, fontWeight:700, cursor:nextDisabled?'not-allowed':'pointer', fontFamily:'inherit', boxShadow:nextDisabled?'none':danger?'0 2px 10px rgba(220,38,38,0.3)':'0 2px 10px rgba(16,120,90,0.3)', opacity:nextDisabled?0.6:1 }}>
        {nextLabel} {!nextDisabled && <ArrowRight size={14}/>}
      </button>
    </div>
  );
}
