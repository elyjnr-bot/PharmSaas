import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import type { Worker as TesseractWorker } from 'tesseract.js';
import { X, Scan, Type, Loader, Package, Link, CheckCircle, ShoppingCart } from 'lucide-react';
import { Medication } from '../../lib/supabase';
import { supabase } from '../../lib/supabase';
import { upsertWithUserId } from '../../lib/supabaseHelpers';
import { findTopMatchesWithScores, tokenizeOcr, type MatchResult } from '../../lib/fuzzyMatch';
import { preprocessImageForOCR } from '../../lib/imagePreprocessing';
import { loadAliases, applyAliasMapping, findMedicationByAlias } from '../../lib/aliasManager';
import { useCart } from '../../lib/cartContext';

type InputMode = 'code' | 'name';

interface LinkProposal {
  barcode: string;
  medication: Medication;
}

interface CameraScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
  onProductSelect: (medication: Medication) => void;
  continuous?: boolean;
  title?: string;
  subtitle?: string;
  medications: Medication[];
}

const CODE_SCANNER_ID = 'camera-scanner-code-div';
const SCAN_COOLDOWN_MS = 2000;

export default function CameraScanner({
  onScan,
  onClose,
  onProductSelect,
  continuous = false,
  title = 'Scanner',
  subtitle,
  medications,
}: CameraScannerProps) {
  const [mode, setMode] = useState<InputMode>('code');

  const [codeScannerState, setCodeScannerState] = useState<'initializing' | 'active' | 'error'>('initializing');
  const [codeScannerError, setCodeScannerError] = useState('');
  const [lastCodeScanned, setLastCodeScanned] = useState('');

  const [nameReady, setNameReady] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'processing' | 'done'>('idle');
  const [suggestions, setSuggestions] = useState<MatchResult[]>([]);
  const [quickConfirm, setQuickConfirm] = useState<MatchResult | null>(null);
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [ocrLog, setOcrLog] = useState('');
  const [flashFrame, setFlashFrame] = useState(false);

  const [linkProposal, setLinkProposal] = useState<LinkProposal | null>(null);
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkDone, setLinkDone] = useState(false);
  const [cartToast, setCartToast] = useState<string | null>(null);

  const { addToCart } = useCart();
  const cartToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCartToast = useCallback((name: string) => {
    if (cartToastTimer.current) clearTimeout(cartToastTimer.current);
    setCartToast(name);
    cartToastTimer.current = setTimeout(() => setCartToast(null), 2200);
  }, []);

  const codeInstanceRef = useRef<Html5Qrcode | null>(null);
  const codeFiredRef = useRef(false);
  const codeLastRef = useRef('');
  const codeLastTimeRef = useRef(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ocrProcessingRef = useRef(false);
  const lastBarcodeRef = useRef<string | null>(null);
  const workerRef = useRef<TesseractWorker | null>(null);

  const stopCodeScanner = useCallback(async () => {
    if (codeInstanceRef.current) {
      try {
        if (codeInstanceRef.current.isScanning) {
          await codeInstanceRef.current.stop();
        }
      } catch {}
      try { codeInstanceRef.current.clear(); } catch {}
      codeInstanceRef.current = null;
    }
  }, []);

  const stopNameScanner = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    ocrProcessingRef.current = false;
    lastBarcodeRef.current = null;
  }, []);

  const terminateWorker = useCallback(async () => {
    if (workerRef.current) {
      try { await workerRef.current.terminate(); } catch {}
      workerRef.current = null;
    }
  }, []);

  const startCodeScanner = useCallback(async () => {
    setCodeScannerState('initializing');
    setCodeScannerError('');
    codeFiredRef.current = false;
    await stopCodeScanner();
    await new Promise(r => setTimeout(r, 120));

    const el = document.getElementById(CODE_SCANNER_ID);
    if (!el) return;

    const instance = new Html5Qrcode(CODE_SCANNER_ID, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
      ],
      verbose: false,
    });
    codeInstanceRef.current = instance;

    try {
      await instance.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        (decoded) => {
          if (!continuous && codeFiredRef.current) return;
          const now = Date.now();
          if (decoded === codeLastRef.current && now - codeLastTimeRef.current < SCAN_COOLDOWN_MS) return;
          codeLastRef.current = decoded;
          codeLastTimeRef.current = now;
          setLastCodeScanned(decoded);
          if (!continuous) {
            codeFiredRef.current = true;
            onScan(decoded);
            stopCodeScanner().then(() => onClose());
          } else {
            onScan(decoded);
          }
        },
        () => {},
      );
      setCodeScannerState('active');
    } catch (err: any) {
      const msg = String(err?.message || err).toLowerCase();
      setCodeScannerState('error');
      if (msg.includes('permission') || msg.includes('denied')) {
        setCodeScannerError("Accès caméra refusé. Autorisez l'accès dans les paramètres.");
      } else {
        setCodeScannerError("Impossible de démarrer la caméra.");
      }
    }
  }, [continuous, onScan, onClose, stopCodeScanner]);

  const startNameScanner = useCallback(async () => {
    setNameReady(false);
    setSuggestions([]);
    setQuickConfirm(null);
    setShowManualSearch(false);
    setManualQuery('');
    setOcrStatus('idle');
    stopNameScanner();
    await new Promise(r => setTimeout(r, 150));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setNameReady(true);
      }
    } catch {
      setNameReady(false);
    }
  }, [stopNameScanner]);

  useEffect(() => {
    if (mode !== 'code') return;
    startCodeScanner();
    return () => { stopCodeScanner(); };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'name') return;
    startNameScanner();
    return () => { stopNameScanner(); terminateWorker(); };
  }, [mode]);

  const playBeep = useCallback(() => {
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate(200);
      }
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch {}
  }, []);

  const analyzeBox = useCallback(async () => {
    console.log('[Scanner] *** BOUTON CLIQUE, capture lancee ***');

    if (ocrProcessingRef.current) {
      console.log('[Scanner] BLOQUE: analyse deja en cours');
      return;
    }
    if (!videoRef.current || !canvasRef.current) {
      console.log('[Scanner] BLOQUE: videoRef ou canvasRef null', { video: !!videoRef.current, canvas: !!canvasRef.current });
      setOcrLog('Erreur: camera non prete');
      return;
    }
    if (videoRef.current.readyState < 2) {
      console.log('[Scanner] BLOQUE: video readyState =', videoRef.current.readyState);
      setOcrLog('Erreur: video pas prete (state=' + videoRef.current.readyState + ')');
      return;
    }
    if (medications.length === 0) {
      console.log('[Scanner] BLOQUE: liste medications vide');
      setOcrLog('Erreur: aucun medicament charge');
      return;
    }

    ocrProcessingRef.current = true;
    setOcrStatus('processing');
    setSuggestions([]);
    setOcrLog('Capture en cours...');

    setFlashFrame(true);
    setTimeout(() => setFlashFrame(false), 150);

    const barcodeDetector: any =
      'BarcodeDetector' in window
        ? new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'data_matrix'],
          })
        : null;

    const CSS_BOX_WIDTH = 330;
    const CSS_BOX_HEIGHT = 96;

    try {
      const video = videoRef.current;
      const fullCanvas = canvasRef.current;
      const nativeW = video.videoWidth;
      const nativeH = video.videoHeight;

      if (nativeW === 0 || nativeH === 0) {
        console.log('[Scanner] ERREUR: video dimensions nulles', nativeW, nativeH);
        setOcrLog('Erreur: capture video vide');
        ocrProcessingRef.current = false;
        setOcrStatus('idle');
        return;
      }

      fullCanvas.width = nativeW;
      fullCanvas.height = nativeH;
      const fullCtx = fullCanvas.getContext('2d');
      if (!fullCtx) {
        setOcrLog('Erreur: canvas context null');
        ocrProcessingRef.current = false;
        setOcrStatus('idle');
        return;
      }
      fullCtx.drawImage(video, 0, 0);
      console.log('[Scanner] Image capturee:', nativeW, 'x', nativeH);
      setOcrLog('Capture OK (' + nativeW + 'x' + nativeH + ')...');

      if (barcodeDetector) {
        try {
          const codes = await barcodeDetector.detect(fullCanvas);
          if (codes.length > 0) {
            lastBarcodeRef.current = codes[0].rawValue;
            console.log('[Scanner] Barcode detected:', codes[0].rawValue);
          }
        } catch {}
      }

      const displayW = video.clientWidth;
      const displayH = video.clientHeight;
      const videoRatio = nativeW / nativeH;
      const displayRatio = displayW / displayH;
      let scaleX: number, scaleY: number, offsetX: number, offsetY: number;

      if (videoRatio > displayRatio) {
        const scaledW = displayH * videoRatio;
        scaleX = nativeW / scaledW;
        scaleY = nativeH / displayH;
        offsetX = ((scaledW - displayW) / 2) * scaleX;
        offsetY = 0;
      } else {
        const scaledH = displayW / videoRatio;
        scaleX = nativeW / displayW;
        scaleY = nativeH / scaledH;
        offsetX = 0;
        offsetY = ((scaledH - displayH) / 2) * scaleY;
      }

      const cropW = CSS_BOX_WIDTH * scaleX;
      const cropH = CSS_BOX_HEIGHT * scaleY;
      const cropX = (nativeW - cropW) / 2;
      const cropY = (nativeH - cropH) / 2;

      console.log('[Scanner] Crop coords:', { cropX: Math.round(cropX), cropY: Math.round(cropY), cropW: Math.round(cropW), cropH: Math.round(cropH) });

      const OUTPUT_W = Math.round(cropW * 2);
      const OUTPUT_H = Math.round(cropH * 2);

      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = OUTPUT_W;
      croppedCanvas.height = OUTPUT_H;
      const croppedCtx = croppedCanvas.getContext('2d');
      if (!croppedCtx) {
        setOcrLog('Erreur: crop canvas null');
        ocrProcessingRef.current = false;
        setOcrStatus('idle');
        return;
      }

      croppedCtx.drawImage(
        fullCanvas,
        Math.max(0, cropX),
        Math.max(0, cropY),
        Math.min(cropW, nativeW),
        Math.min(cropH, nativeH),
        0,
        0,
        OUTPUT_W,
        OUTPUT_H
      );

      setOcrLog('Preprocessing N&B...');
      const croppedDataUrl = croppedCanvas.toDataURL('image/png');
      console.log('[Scanner] Cropped dataUrl length:', croppedDataUrl.length);

      const preprocessedDataUrl = await preprocessImageForOCR(croppedDataUrl);

      const preprocessedImg = new Image();
      await new Promise<void>((resolve, reject) => {
        preprocessedImg.onload = () => resolve();
        preprocessedImg.onerror = reject;
        preprocessedImg.src = preprocessedDataUrl;
      });

      const processedCanvas = document.createElement('canvas');
      processedCanvas.width = preprocessedImg.width;
      processedCanvas.height = preprocessedImg.height;
      const processedCtx = processedCanvas.getContext('2d');
      if (!processedCtx) {
        setOcrLog('Erreur: processed canvas null');
        ocrProcessingRef.current = false;
        setOcrStatus('idle');
        return;
      }

      processedCtx.drawImage(preprocessedImg, 0, 0);

      if (!workerRef.current) {
        setOcrLog('Chargement Tesseract...');
        console.log('[Scanner] Initializing Tesseract worker');
        const { createWorker } = await import('tesseract.js');
        workerRef.current = await createWorker('fra', 1, {
          logger: (m: any) => {
            if (m.status) setOcrLog('Tesseract: ' + m.status);
          },
        });
        await workerRef.current.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/.- ',
          tessedit_pageseg_mode: '6',
          preserve_interword_spaces: '1',
          tessjs_create_hocr: '0',
          tessjs_create_tsv: '1',
        });
        console.log('[Scanner] Tesseract worker initialized');
      }

      setOcrLog('OCR en cours...');
      console.log('[Scanner] Running OCR on', processedCanvas.width, 'x', processedCanvas.height);
      const { data } = await workerRef.current.recognize(processedCanvas);

      const rawText = (data.text || '').trim();
      console.log('[Scanner] OCR raw text:', JSON.stringify(rawText));

      const lines = data.tsv?.split('\n') || [];
      const words: Array<{ text: string; conf: number; height: number }> = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t');
        if (cols.length >= 12) {
          const height = parseInt(cols[9]) || 0;
          const text = cols[11]?.trim() || '';
          const conf = parseFloat(cols[10]) || 0;

          if (text.length >= 2 && conf > 30) {
            words.push({ text, conf, height });
          }
        }
      }

      words.sort((a, b) => b.height - a.height);
      console.log('[Scanner] TSV words:', words.map(w => `"${w.text}" (conf=${w.conf}, h=${w.height})`));

      let votedText = '';
      if (words.length > 0) {
        votedText = words
          .slice(0, 3)
          .map(w => w.text)
          .join(' ')
          .replace(/[^a-zA-ZÀ-ÿ0-9 ]/g, '')
          .trim();
      }
      if (!votedText && rawText) {
        votedText = rawText.replace(/[^a-zA-ZÀ-ÿ0-9 ]/g, '').trim();
      }

      console.log('[Scanner] Final extracted text:', votedText || '(empty)');
      setOcrLog(votedText ? 'Lu: ' + votedText : 'Vide (rien detecte)');

      if (votedText.length === 0) {
        console.log('[Scanner] No text extracted, trying to find best match anyway');
        const fuse = await import('fuse.js');
        const fuseInstance = new fuse.default(medications, {
          keys: [{ name: 'name', weight: 1.0 }],
          threshold: 0.9,
          includeScore: true,
        });
        const results = fuseInstance.search('');
        if (results.length > 0) {
          const topResult = {
            medication: results[0].item,
            score: 0.1,
            matchType: 'fallback' as const,
          };
          console.log('[Scanner] Fallback suggestion:', topResult.medication.name);
          setOcrLog('Vide (suggestion aléatoire)');
          setSuggestions([topResult]);
          setQuickConfirm(topResult);
        }
        ocrProcessingRef.current = false;
        setOcrStatus('idle');
        return;
      }

      console.log('[Scanner] Searching for alias match');
      const aliasMatch = await findMedicationByAlias(votedText, medications);
      if (aliasMatch) {
        console.log('[Scanner] Alias match found:', aliasMatch.name);
        setSuggestions([{ medication: aliasMatch, score: 1.0, matchType: 'exact' }]);
        setQuickConfirm({ medication: aliasMatch, score: 1.0, matchType: 'exact' });
        ocrProcessingRef.current = false;
        setOcrStatus('idle');
        return;
      }

      console.log('[Scanner] Applying alias mapping');
      const aliases = await loadAliases();
      const mappedText = applyAliasMapping(votedText, aliases);
      console.log('[Scanner] Mapped text:', mappedText);

      console.log('[Scanner] Searching in database');
      const matches = findTopMatchesWithScores(mappedText, medications, 5);

      if (matches.length === 0) {
        console.log('[Scanner] No matches found, forcing best effort search');
        const fuse = await import('fuse.js');
        const fuseInstance = new fuse.default(medications, {
          keys: [{ name: 'name', weight: 1.0 }],
          threshold: 0.9,
          includeScore: true,
        });
        const results = fuseInstance.search(votedText);
        if (results.length > 0) {
          const bestEffort = {
            medication: results[0].item,
            score: 1 - (results[0].score || 0),
            matchType: 'fuzzy' as const,
          };
          console.log('[Scanner] Best effort match:', bestEffort.medication.name, 'Score:', bestEffort.score);
          setSuggestions([bestEffort]);
          setQuickConfirm(bestEffort);
        } else {
          console.log('[Scanner] Absolutely no match found');
          setSuggestions([]);
        }
        ocrProcessingRef.current = false;
        setOcrStatus('idle');
        return;
      }

      console.log('[Scanner] Found', matches.length, 'matches');
      matches.forEach((m, i) => {
        console.log(`[Scanner] Match ${i + 1}:`, m.medication.name, 'Score:', m.score.toFixed(3));
      });

      const bestMatch = matches[0];
      setSuggestions(matches);

      const hasCloseSecond = matches.length >= 2 && (bestMatch.score - matches[1].score) < 0.10;
      if (bestMatch.score >= 0.93 && !hasCloseSecond) {
        setQuickConfirm(bestMatch);
      } else if (hasCloseSecond) {
        console.log('[Scanner] Scores trop proches, affichage choix multiple');
        setQuickConfirm(null);
      } else {
        setQuickConfirm(bestMatch);
      }
    } catch (err: any) {
      console.error('[Scanner] ERREUR OCR:', err);
      setOcrLog('Erreur: ' + (err?.message || String(err)));
    }

    playBeep();
    setOcrStatus('idle');
    ocrProcessingRef.current = false;
  }, [medications, continuous, onProductSelect, stopNameScanner, terminateWorker, onClose, playBeep]);

  const handleClose = useCallback(async () => {
    if (mode === 'code') await stopCodeScanner();
    else stopNameScanner();
    await terminateWorker();
    onClose();
  }, [mode, stopCodeScanner, stopNameScanner, terminateWorker, onClose]);

  const handleSelectSuggestion = useCallback((med: Medication) => {
    const detectedBarcode = lastBarcodeRef.current;
    if (detectedBarcode) {
      setLinkProposal({ barcode: detectedBarcode, medication: med });
    } else {
      if (continuous) {
        addToCart(med);
        showCartToast(med.name);
        setSuggestions([]);
        setQuickConfirm(null);
      }
      onProductSelect(med);
      if (!continuous) {
        stopNameScanner();
        terminateWorker().then(() => onClose());
      }
    }
  }, [continuous, addToCart, showCartToast, onProductSelect, stopNameScanner, terminateWorker, onClose]);

  const handleDeclineSuggestion = useCallback(() => {
    setSuggestions([]);
  }, []);

  const handleConfirmLink = useCallback(async () => {
    if (!linkProposal) return;
    setLinkSaving(true);
    try {
      await upsertWithUserId('barcodes', {
        barcode: linkProposal.barcode,
        medication_id: linkProposal.medication.id,
        code_produit: linkProposal.medication.code_produit || null,
      }, { onConflict: 'barcode' });
      setLinkDone(true);
      setTimeout(() => {
        setLinkDone(false);
        setLinkProposal(null);
        if (continuous) {
          addToCart(linkProposal.medication);
          showCartToast(linkProposal.medication.name);
          setSuggestions([]);
        }
        onProductSelect(linkProposal.medication);
        if (!continuous) {
          stopNameScanner();
          terminateWorker().then(() => onClose());
        }
      }, 1200);
    } catch {}
    setLinkSaving(false);
  }, [linkProposal, continuous, addToCart, showCartToast, onProductSelect, stopNameScanner, terminateWorker, onClose]);

  const handleDeclineLink = useCallback(() => {
    if (!linkProposal) return;
    const med = linkProposal.medication;
    setLinkProposal(null);
    if (continuous) {
      addToCart(med);
      showCartToast(med.name);
      setSuggestions([]);
    }
    onProductSelect(med);
    if (!continuous) {
      stopNameScanner();
      terminateWorker().then(() => onClose());
    } else {
      setSuggestions([]);
    }
  }, [linkProposal, continuous, addToCart, showCartToast, onProductSelect, stopNameScanner, terminateWorker, onClose]);

  const switchMode = useCallback((newMode: InputMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setSuggestions([]);
    setQuickConfirm(null);
    setLastCodeScanned('');
    setShowManualSearch(false);
    setManualQuery('');
    setOcrStatus('idle');
  }, [mode]);

  const handleManualSearch = useCallback((query: string) => {
    setManualQuery(query);
    if (query.length >= 3 && medications.length > 0) {
      const matches = findTopMatchesWithScores(query, medications, 5);
      setSuggestions(matches);
    } else {
      setSuggestions([]);
    }
  }, [medications]);

  const handleConfirmQuick = useCallback(() => {
    if (!quickConfirm) return;
    const detectedBarcode = lastBarcodeRef.current;
    if (detectedBarcode) {
      setLinkProposal({ barcode: detectedBarcode, medication: quickConfirm.medication });
    } else {
      if (continuous) {
        addToCart(quickConfirm.medication);
        showCartToast(quickConfirm.medication.name);
        setSuggestions([]);
      }
      onProductSelect(quickConfirm.medication);
      if (!continuous) {
        stopNameScanner();
        terminateWorker().then(() => onClose());
      }
    }
    setQuickConfirm(null);
  }, [quickConfirm, continuous, addToCart, showCartToast, onProductSelect, stopNameScanner, terminateWorker, onClose]);

  const handleShowAllSuggestions = useCallback(() => {
    setQuickConfirm(null);
  }, []);

  const handleDeclineQuick = useCallback(() => {
    setQuickConfirm(null);
    setSuggestions([]);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <div>
          <h2 className="text-white font-bold text-lg">{title}</h2>
          {subtitle && <p className="text-gray-400 text-xs">{subtitle}</p>}
        </div>
        <button
          onClick={handleClose}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {cartToast && (
        <div
          className="absolute top-[60px] left-1/2 z-50 pointer-events-none"
          style={{ transform: 'translateX(-50%)' }}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-xl"
            style={{ background: 'rgba(16, 185, 129, 0.95)', backdropFilter: 'blur(8px)' }}>
            <ShoppingCart className="w-4 h-4 text-white flex-shrink-0" strokeWidth={2} />
            <span className="text-white text-sm font-semibold whitespace-nowrap max-w-[220px] truncate">
              {cartToast} — Ajouté au panier
            </span>
          </div>
        </div>
      )}

      <div className="flex-1 relative overflow-hidden bg-black">
        {mode === 'code' && (
          <>
            <div
              id={CODE_SCANNER_ID}
              className="w-full h-full"
              style={{ minHeight: 300 }}
            />
            {codeScannerState === 'initializing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
                <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
                <p className="text-white text-sm">Initialisation...</p>
              </div>
            )}
            {codeScannerState === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-90 px-6">
                <div className="bg-gray-800 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
                  <Scan className="w-12 h-12 text-gray-400 mx-auto" />
                  <p className="text-white text-sm">{codeScannerError}</p>
                  <button
                    onClick={startCodeScanner}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold transition-colors"
                  >
                    Réessayer
                  </button>
                </div>
              </div>
            )}
            {codeScannerState === 'active' && lastCodeScanned === '' && (
              <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
                <p className="text-center text-white text-sm bg-black bg-opacity-50 py-2 px-4 rounded-full">
                  Pointez vers un code-barres EAN / DataMatrix
                </p>
              </div>
            )}
          </>
        )}

        {mode === 'name' && (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {!nameReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
                <div className="animate-spin w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full mb-4" />
                <p className="text-white text-sm">Initialisation caméra...</p>
              </div>
            )}

            {nameReady && (
              <>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="relative" style={{ width: 330, height: 96 }}>
                    <div className={`absolute inset-0 rounded border-2 transition-all duration-150 ${
                      flashFrame ? 'border-white border-opacity-100 border-4' : 'border-green-400 border-opacity-50'
                    }`} />
                    <div className={`absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 rounded-tl-lg transition-all duration-150 ${
                      flashFrame ? 'border-white' : 'border-green-400'
                    }`} />
                    <div className={`absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 rounded-tr-lg transition-all duration-150 ${
                      flashFrame ? 'border-white' : 'border-green-400'
                    }`} />
                    <div className={`absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 rounded-bl-lg transition-all duration-150 ${
                      flashFrame ? 'border-white' : 'border-green-400'
                    }`} />
                    <div className={`absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 rounded-br-lg transition-all duration-150 ${
                      flashFrame ? 'border-white' : 'border-green-400'
                    }`} />
                  </div>
                </div>

                {ocrStatus === 'processing' && (
                  <div className="absolute top-6 left-0 right-0 flex justify-center pointer-events-none px-4">
                    <div className="bg-blue-600 bg-opacity-90 px-5 py-3 rounded-2xl flex items-center gap-3 shadow-2xl">
                      <Loader className="w-5 h-5 text-white animate-spin" />
                      <span className="text-white text-base font-bold">Analyse en cours...</span>
                    </div>
                  </div>
                )}

                {ocrLog && (
                  <div className="absolute bottom-20 left-0 right-0 flex justify-center pointer-events-none px-4">
                    <div className="bg-gray-900 bg-opacity-90 px-4 py-2 rounded-xl border border-gray-600">
                      <p className="text-xs text-gray-400 mb-0.5">Log OCR:</p>
                      <p className="text-sm text-white font-mono font-bold">{ocrLog}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {mode === 'name' && showManualSearch && (
        <div className="flex-shrink-0 bg-gray-900 border-t border-gray-700 p-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={manualQuery}
              onChange={(e) => handleManualSearch(e.target.value)}
              placeholder="Tapez le nom du produit..."
              autoFocus
              className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
            />
            <button
              onClick={() => {
                setShowManualSearch(false);
                setManualQuery('');
                setSuggestions([]);
              }}
              className="p-3 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors"
            >
              <X className="w-5 h-5 text-gray-300" />
            </button>
          </div>
        </div>
      )}

      {mode === 'name' && !showManualSearch && suggestions.length === 0 && nameReady && (
        <div className="flex-shrink-0 bg-gray-900 border-t border-gray-700 p-4 space-y-2" style={{ zIndex: 9999 }}>
          <button
            onClick={analyzeBox}
            disabled={ocrStatus === 'processing'}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 text-white rounded-xl py-5 px-6 font-bold text-lg transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ zIndex: 9999 }}
          >
            {ocrStatus === 'processing' ? (
              <>
                <Loader className="w-6 h-6 animate-spin" />
                Analyse en cours...
              </>
            ) : (
              <>
                <Scan className="w-6 h-6" />
                ANALYSER LA BOÎTE
              </>
            )}
          </button>
          <button
            onClick={() => setShowManualSearch(true)}
            className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl py-3 px-4 text-gray-300 text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Type className="w-4 h-4" />
            Recherche manuelle
          </button>
        </div>
      )}

      {mode === 'name' && suggestions.length > 0 && !quickConfirm && (
        <div className="flex-shrink-0 bg-gray-900 border-t border-gray-700 p-4 space-y-2 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm font-semibold">
              Sélectionnez le produit ({suggestions.length} résultat{suggestions.length > 1 ? 's' : ''})
            </p>
            <button
              onClick={handleDeclineSuggestion}
              className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
            >
              Effacer
            </button>
          </div>
          {suggestions.map(({ medication: med, score }, idx) => (
            <button
              key={med.id}
              onClick={() => handleSelectSuggestion(med)}
              className={`w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all ${
                idx === 0
                  ? 'bg-green-600 hover:bg-green-500 active:bg-green-700 shadow-lg'
                  : 'bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border border-gray-700'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                idx === 0 ? 'bg-green-500 bg-opacity-50' : 'bg-green-900'
              }`}>
                <Package className={`w-5 h-5 ${idx === 0 ? 'text-white' : 'text-green-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${idx === 0 ? 'text-white' : 'text-white'}`}>
                  {med.name}
                </p>
                <p className={`text-xs truncate ${idx === 0 ? 'text-green-200' : 'text-gray-400'}`}>
                  {med.dosage} · Stock: {med.quantity}
                </p>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className={`text-xs font-semibold ${idx === 0 ? 'text-green-100' : 'text-gray-400'}`}>
                  {med.price ? `${med.price.toLocaleString()} F` : '—'}
                </span>
                <span className={`text-xs font-mono ${idx === 0 ? 'text-green-300' : 'text-gray-600'}`}>
                  {Math.round(score * 100)}%
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex-shrink-0 bg-gray-900 border-t border-gray-700 p-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => switchMode('code')}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all active:scale-95 ${
              mode === 'code'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Scan className="w-4 h-4" />
            SCAN CODE
          </button>
          <button
            onClick={() => switchMode('name')}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all active:scale-95 ${
              mode === 'name'
                ? 'bg-green-600 text-white shadow-lg shadow-green-900/40'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Type className="w-4 h-4" />
            SCAN NOM
          </button>
        </div>
      </div>

      {quickConfirm && !linkProposal && (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-black bg-opacity-60 animate-in fade-in duration-200">
          <div className="w-full bg-gray-900 rounded-t-3xl p-6 space-y-4 shadow-2xl border-t-2 border-green-500 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                quickConfirm.score >= 0.95 ? 'bg-green-600' : 'bg-yellow-600'
              }`}>
                <Package className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <p className={`font-bold text-base ${
                  quickConfirm.score >= 0.95 ? 'text-green-400' : quickConfirm.score >= 0.60 ? 'text-yellow-400' : 'text-orange-400'
                }`}>
                  {quickConfirm.score >= 0.95 ? 'Produit détecté' : quickConfirm.score >= 0.60 ? 'Voulez-vous dire' : 'Produit suggéré'}
                </p>
                <p className="text-white text-lg font-bold mt-0.5">
                  {quickConfirm.medication.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-white text-xl font-bold">
                  {quickConfirm.medication.price ? `${quickConfirm.medication.price.toLocaleString()} F` : '—'}
                </p>
                <p className="text-gray-400 text-xs font-mono mt-0.5">
                  {Math.round(quickConfirm.score * 100)}% match
                </p>
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Dosage</span>
                <span className="text-white font-semibold">{quickConfirm.medication.dosage}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-gray-400">Stock disponible</span>
                <span className="text-white font-semibold">{quickConfirm.medication.quantity}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={suggestions.length > 1 ? handleShowAllSuggestions : handleDeclineQuick}
                className="py-3.5 rounded-xl font-bold text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              >
                {suggestions.length > 1 ? 'Voir autres' : 'Annuler'}
              </button>
              <button
                onClick={handleConfirmQuick}
                className="py-3.5 rounded-xl font-bold text-base bg-green-600 hover:bg-green-500 text-white transition-colors flex items-center justify-center gap-2 shadow-lg"
              >
                <CheckCircle className="w-5 h-5" />
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {linkProposal && (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-black bg-opacity-75">
          <div className="w-full bg-gray-900 rounded-t-3xl p-6 space-y-4 shadow-2xl border-t border-gray-700">
            {linkDone ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>
                <p className="text-white font-bold text-center">Code lié avec succès !</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-900 flex items-center justify-center flex-shrink-0">
                    <Link className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">Lier ce code-barres ?</p>
                    <p className="text-gray-400 text-xs font-mono mt-0.5">{linkProposal.barcode}</p>
                  </div>
                </div>
                <div className="bg-gray-800 rounded-xl px-4 py-3">
                  <p className="text-gray-400 text-xs">Produit sélectionné</p>
                  <p className="text-white font-semibold text-sm mt-0.5">
                    {linkProposal.medication.name} {linkProposal.medication.dosage}
                  </p>
                </div>
                <p className="text-gray-400 text-xs text-center leading-relaxed">
                  Ce code sera automatiquement reconnu lors du prochain scan de ce produit.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleDeclineLink}
                    className="py-3 rounded-xl font-semibold text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                  >
                    Non, ignorer
                  </button>
                  <button
                    onClick={handleConfirmLink}
                    disabled={linkSaving}
                    className="py-3 rounded-xl font-semibold text-sm bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {linkSaving ? <Loader className="w-4 h-4 animate-spin" /> : null}
                    Oui, lier
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
