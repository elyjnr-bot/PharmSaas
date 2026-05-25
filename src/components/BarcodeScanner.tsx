import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, CameraOff, RefreshCw } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
  continuous?: boolean;
  title?: string;
  subtitle?: string;
}

type ScannerState = 'initializing' | 'active' | 'paused' | 'error' | 'permission-denied';

const SCANNER_ELEMENT_ID = 'html5-qrcode-scanner';
const SCAN_COOLDOWN_MS = 2000;

export default function BarcodeScanner({ onScan, onClose, continuous = false, title = 'Scanner', subtitle }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);
  const firedRef = useRef(false);
  const [state, setState] = useState<ScannerState>('initializing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastScannedCode, setLastScannedCode] = useState<string>('');

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const isRunning = scannerRef.current.isScanning;
        if (isRunning) {
          await scannerRef.current.stop();
        }
      } catch {
      }
      try {
        scannerRef.current.clear();
      } catch {
      }
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    setState('initializing');
    setErrorMessage('');

    await stopScanner();

    await new Promise(r => setTimeout(r, 100));

    const el = document.getElementById(SCANNER_ELEMENT_ID);
    if (!el) return;

    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, {
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
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 260, height: 180 }, aspectRatio: 1.0 },
        (decodedText) => {
          if (!continuous && firedRef.current) return;

          const now = Date.now();
          if (
            decodedText === lastScannedRef.current &&
            now - lastScannedTimeRef.current < SCAN_COOLDOWN_MS
          ) {
            return;
          }
          lastScannedRef.current = decodedText;
          lastScannedTimeRef.current = now;
          setLastScannedCode(decodedText);

          if (!continuous) {
            firedRef.current = true;
            onScan(decodedText);
            stopScanner().then(() => onClose());
          } else {
            onScan(decodedText);
            setState('paused');
            setTimeout(() => setState('active'), SCAN_COOLDOWN_MS);
          }
        },
        () => {},
      );
      setState('active');
    } catch (err: any) {
      const msg: string = err?.message || String(err);
      if (
        msg.toLowerCase().includes('permission') ||
        msg.toLowerCase().includes('notallowed') ||
        msg.toLowerCase().includes('denied')
      ) {
        setState('permission-denied');
        setErrorMessage("Accès à la caméra refusé. Veuillez autoriser l'accès à la caméra dans les paramètres de votre navigateur.");
      } else if (msg.toLowerCase().includes('notfound') || msg.toLowerCase().includes('no camera')) {
        setState('error');
        setErrorMessage("Aucune caméra détectée sur cet appareil.");
      } else {
        setState('error');
        setErrorMessage(`Impossible de démarrer la caméra: ${msg}`);
      }
    }
  }, [onScan, onClose, continuous, stopScanner]);

  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };
  }, []);

  const handleClose = useCallback(async () => {
    await stopScanner();
    onClose();
  }, [stopScanner, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-700">
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

      <div className="flex-1 relative flex flex-col items-center justify-center bg-black">
        <div
          id={SCANNER_ELEMENT_ID}
          className="w-full max-w-md"
          style={{ minHeight: 300 }}
        />

        {state === 'initializing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-80">
            <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
            <p className="text-white text-sm">Initialisation de la caméra...</p>
          </div>
        )}

        {(state === 'error' || state === 'permission-denied') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-90 px-6">
            <div className="bg-gray-800 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
              {state === 'permission-denied' ? (
                <CameraOff className="w-14 h-14 text-red-400 mx-auto" />
              ) : (
                <Camera className="w-14 h-14 text-gray-400 mx-auto" />
              )}
              <p className="text-white font-semibold">{errorMessage}</p>
              <div className="flex gap-3">
                {state === 'error' && (
                  <button
                    onClick={startScanner}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Réessayer
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-3 rounded-xl font-semibold transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}

        {state === 'active' && (
          <div className="absolute bottom-4 left-4 right-4">
            <p className="text-center text-white text-sm bg-black bg-opacity-50 py-2 px-4 rounded-full">
              {continuous ? 'Pointez vers un code-barres — caméra reste ouverte' : 'Pointez vers un code-barres'}
            </p>
          </div>
        )}

        {state === 'paused' && lastScannedCode && (
          <div className="absolute bottom-4 left-4 right-4">
            <div className="bg-green-600 text-white py-3 px-4 rounded-xl text-center">
              <p className="font-bold text-sm">Code lu: {lastScannedCode}</p>
              <p className="text-xs text-green-100 mt-1">Prêt pour le prochain scan...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
