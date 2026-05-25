export interface ParsedDataMatrix {
  gtin: string;
  lot: string;
  expiry: string;
  expiryFormatted: string;
}

interface EssentialMedication {
  name: string;
  dosage: string;
  gtin: string;
  supplier: string;
  price: number;
}

export const ESSENTIAL_MEDICATIONS: EssentialMedication[] = [
  { name: 'Coartem', dosage: '20mg/120mg', gtin: '06141234567890', supplier: 'Novartis Pharma', price: 2500 },
  { name: 'Paracétamol', dosage: '500mg', gtin: '06141234567891', supplier: 'Sanofi', price: 500 },
  { name: 'Amoxicilline', dosage: '500mg', gtin: '06141234567892', supplier: 'GSK Pharma', price: 1500 },
  { name: 'Sérum Physiologique', dosage: '10ml', gtin: '06141234567893', supplier: 'B.Braun', price: 750 },
  { name: 'Métronidazole', dosage: '250mg', gtin: '06141234567894', supplier: 'Pfizer', price: 1200 },
  { name: 'Ibuprofène', dosage: '400mg', gtin: '06141234567895', supplier: 'Sanofi', price: 800 },
  { name: 'Artemether', dosage: '80mg', gtin: '06141234567896', supplier: 'Cipla Ltd', price: 3000 },
  { name: 'Zinc Sulfate', dosage: '20mg', gtin: '06141234567897', supplier: 'Nutriset', price: 600 },
  { name: 'Vitamine A', dosage: '200000UI', gtin: '06141234567898', supplier: 'Nutriset', price: 900 },
  { name: 'Cotrimoxazole', dosage: '480mg', gtin: '06141234567899', supplier: 'Mylan', price: 1000 },
];

export const getMedicationInfoByGtin = (gtin: string): EssentialMedication | null => {
  return ESSENTIAL_MEDICATIONS.find(med => med.gtin === gtin) || null;
};

const generateRandomExpiryDate = (): { raw: string; formatted: string; display: string } => {
  const random = Math.random();
  const today = new Date();
  let expiryDate: Date;

  if (random < 0.20) {
    const daysOffset = Math.floor(Math.random() * 180) - 90;
    expiryDate = new Date(today);
    expiryDate.setDate(today.getDate() + daysOffset);
  } else {
    const monthsOffset = Math.floor(Math.random() * 24) + 6;
    expiryDate = new Date(today);
    expiryDate.setMonth(today.getMonth() + monthsOffset);
  }

  const year = expiryDate.getFullYear().toString().substring(2);
  const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
  const day = String(expiryDate.getDate()).padStart(2, '0');

  return {
    raw: `${year}${month}${day}`,
    formatted: `${expiryDate.getFullYear()}-${month}-${day}`,
    display: `${day}/${month}/${expiryDate.getFullYear()}`,
  };
};

const GS1_FIXED_LENGTH: Record<string, number> = {
  '00': 18, '01': 14, '02': 14, '03': 14, '04': 16,
  '11': 6, '12': 6, '13': 6, '14': 6, '15': 6, '16': 6,
  '17': 6, '18': 2, '19': 6, '20': 2,
};

export const parseGS1Code = (raw: string): ParsedDataMatrix | null => {
  try {
    const GS = '\x1d';
    const data = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1c\x1e-\x1f]/g, '');

    const result: Record<string, string> = {};
    const segments = data.split(GS);

    for (const segment of segments) {
      let pos = 0;
      while (pos < segment.length) {
        if (pos + 2 > segment.length) break;

        const ai2 = segment.substring(pos, pos + 2);

        if (GS1_FIXED_LENGTH[ai2] !== undefined) {
          const len = GS1_FIXED_LENGTH[ai2];
          const value = segment.substring(pos + 2, pos + 2 + len);
          result[ai2] = value;
          pos += 2 + len;
        } else {
          const rest = segment.substring(pos + 2);
          result[ai2] = rest;
          break;
        }
      }
    }

    const gtin = result['01'] || '';
    const expiryRaw = result['17'] || '';

    const lotRaw = result['10'] || '';
    const lot = lotRaw.replace(/\x1d.*/, '').replace(/[^\x20-\x7E]/g, '');

    if (!gtin) return null;

    let expiryFormatted = '';
    let expiryDisplay = '';
    if (expiryRaw.length === 6) {
      const year = '20' + expiryRaw.substring(0, 2);
      const month = expiryRaw.substring(2, 4);
      const rawDay = expiryRaw.substring(4, 6);
      const day = rawDay === '00' ? '01' : rawDay;
      expiryFormatted = `${year}-${month}-${day}`;
      expiryDisplay = `${day}/${month}/${year}`;
    }

    return { gtin, lot, expiry: expiryDisplay, expiryFormatted };
  } catch {
    return null;
  }
};

export const parseDataMatrix = (rawData: string): ParsedDataMatrix | null => {
  const gs1 = parseGS1Code(rawData);
  if (gs1) return gs1;

  try {
    const gtin = rawData.match(/01(\d{14})/)?.[1] || '';
    const expiryRaw = rawData.match(/17(\d{6})/)?.[1] || '';
    const lotMatch = rawData.match(/10([A-Za-z0-9\-./]{1,20})(?:\x1d|$)/);
    const lot = lotMatch?.[1] || '';

    if (!gtin) return null;

    const year = expiryRaw ? '20' + expiryRaw.substring(0, 2) : '';
    const month = expiryRaw ? expiryRaw.substring(2, 4) : '';
    const day = expiryRaw ? (expiryRaw.substring(4, 6) === '00' ? '01' : expiryRaw.substring(4, 6)) : '';
    const expiryFormatted = expiryRaw ? `${year}-${month}-${day}` : '';
    const expiryDisplay = expiryRaw ? `${day}/${month}/${year}` : '';

    return { gtin, lot, expiry: expiryDisplay, expiryFormatted };
  } catch {
    return null;
  }
};

export const generateSampleDataMatrix = (): string => {
  const medication = ESSENTIAL_MEDICATIONS[Math.floor(Math.random() * ESSENTIAL_MEDICATIONS.length)];
  const expiry = generateRandomExpiryDate();
  const lotPrefix = ['A', 'B', 'C', 'D', 'E', 'F'][Math.floor(Math.random() * 6)];
  const lotNumber = Math.floor(Math.random() * 9000) + 1000;
  const lot = `${lotPrefix}${lotNumber}`;

  return `01${medication.gtin}17${expiry.raw}10${lot}`;
};

export const playBeepSound = () => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800;
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.1);
};
