import type { Medication } from './supabase';
import Fuse from 'fuse.js';

const STOP_WORDS = new Set([
  'comprime', 'comprimes', 'comprimé', 'comprimés',
  'pellicule', 'pelliculé', 'pelliculée', 'pelliculées', 'enrobé', 'enrobés',
  'boite', 'boîte', 'boites', 'boîtes', 'dosage',
  'usage', 'oral', 'orale', 'oraux',
  'laboratoire', 'laboratoires', 'lab', 'pharma',
  'gelule', 'gelules', 'gélule', 'gélules',
  'injectable', 'injection', 'injections',
  'suspension', 'solution', 'solute', 'soluté',
  'flacon', 'flacons', 'ampoule', 'ampoules',
  'sirop', 'pommade', 'creme', 'crème',
  'lotion', 'spray', 'patch', 'gel', 'gels',
  'sachet', 'sachets', 'suppositoire', 'suppositoires',
  'lyophilisat', 'granule', 'granules', 'granulé', 'poudre',
  'cutane', 'cutané', 'cutanée', 'topique', 'ophtalmique',
  'auriculaire', 'nasal', 'buccal', 'buccale',
  'liberation', 'libération', 'prolongée', 'prolongee', 'immediate',
  'effervescent', 'dispersible',
  'notice', 'posologie', 'contre', 'indications', 'indication',
  'exp', 'lot', 'lot:',
  'mg', 'ml', 'mcg', 'ui', 'iu', 'miu',
  'upsa', 'sans', 'sucre', 'adultes', 'adulte', 'enfants', 'enfant',
  'cp', 'cpr', 'comp', 'caps',
  'avec', 'pour', 'des', 'les', 'aux', 'par',
  'fort', 'forte',
]);

export interface MatchResult {
  medication: Medication;
  score: number;
}

function isAllCaps(word: string): boolean {
  return word === word.toUpperCase() && /[A-Z]/.test(word);
}

function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[la][lb];
}

function extractProductName(fullName: string): string {
  const words = fullName.trim().split(/\s+/);
  const result: string[] = [];
  for (const w of words) {
    const lower = w.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, '');
    if (STOP_WORDS.has(lower)) continue;
    if (/^\d+$/.test(lower)) continue;
    if (/^\d+(mg|ml|g|mcg|ui)$/i.test(w)) continue;
    result.push(w);
  }
  return result.join(' ') || words[0] || fullName;
}

function nameWordCount(name: string): number {
  return name.trim().split(/\s+/).length;
}

function createFuseInstance(medications: Medication[]): Fuse<Medication> {
  return new Fuse(medications, {
    keys: [{ name: 'name', weight: 1.0 }],
    threshold: 0.45,
    distance: 150,
    minMatchCharLength: 2,
    ignoreLocation: true,
    includeScore: true,
    shouldSort: true,
  });
}

export function tokenizeOcr(raw: string): string[] {
  const words = raw
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-ZÀ-ÿ0-9]/g, ''))
    .filter(w => w.length >= 3)
    .filter(w => !STOP_WORDS.has(w.toLowerCase()))
    .filter(w => !/^\d+$/.test(w));

  const upperWords = words.filter(isAllCaps);
  const capitalizedWords = words.filter(w => !isAllCaps(w) && /^[A-ZÀ-Ý]/.test(w));
  const otherWords = words.filter(w => !isAllCaps(w) && !/^[A-ZÀ-Ý]/.test(w));
  return [...upperWords, ...capitalizedWords, ...otherWords];
}

const OCR_CONFUSIONS: Record<string, string[]> = {
  'R': ['V', 'K', 'B', 'P'],
  'V': ['R', 'U', 'W', 'Y'],
  'E': ['F', 'B', 'C'],
  'I': ['L', '1', 'T'],
  'O': ['0', 'Q', 'D', 'C'],
  'S': ['5', 'Z'],
  'B': ['8', 'D', 'R'],
  'G': ['6', 'C', 'Q'],
  'U': ['V', 'W'],
  'D': ['O', 'B', 'P'],
  'N': ['M', 'H'],
  'M': ['N', 'H'],
  'C': ['G', 'O', 'E'],
  'P': ['R', 'B', 'D'],
  'F': ['E', 'P'],
  'H': ['N', 'M', 'K'],
  'T': ['I', 'L', 'Y'],
  'W': ['V', 'U', 'M'],
  'K': ['R', 'H', 'X'],
  'Y': ['V', 'T'],
};

function ocrAwareDistance(query: string, target: string): number {
  const q = query.toUpperCase();
  const t = target.toUpperCase();
  let dist = 0;
  const maxLen = Math.max(q.length, t.length);
  const minLen = Math.min(q.length, t.length);

  dist += (maxLen - minLen) * 0.8;

  for (let i = 0; i < minLen; i++) {
    if (q[i] !== t[i]) {
      const confusions = OCR_CONFUSIONS[q[i]];
      if (confusions && confusions.includes(t[i])) {
        dist += 0.4;
      } else {
        dist += 1.0;
      }
    }
  }

  return dist;
}

export function findTopMatchesWithScores(
  ocrText: string,
  medications: Medication[],
  limit = 5
): MatchResult[] {
  const tokens = tokenizeOcr(ocrText);
  if (tokens.length === 0 || medications.length === 0) return [];

  const query = tokens[0];
  console.log('[FuzzyMatch] Query token:', query, '| All tokens:', tokens);

  if (query.length < 3) {
    const exactMatch = medications.find(m =>
      m.name.toLowerCase() === query.toLowerCase()
    );
    if (exactMatch) return [{ medication: exactMatch, score: 1.0 }];
    return [];
  }

  const qLower = query.toLowerCase();

  const exactFirst = medications.find(m => {
    const first = m.name.toLowerCase().split(/\s+/)[0];
    return first === qLower;
  });
  if (exactFirst) {
    const others = medications
      .filter(m => m !== exactFirst && m.name.toLowerCase().split(/\s+/)[0] === qLower)
      .map(m => ({ medication: m, score: 0.99 }));
    return [{ medication: exactFirst, score: 1.0 }, ...others].slice(0, limit);
  }

  const fuse = createFuseInstance(medications);
  const results = fuse.search(query, { limit: 20 });

  const scored = results.map(result => {
    const medName = result.item.name;
    const coreName = extractProductName(medName);
    const firstWord = medName.split(/\s+/)[0].toLowerCase();
    const coreFirst = coreName.split(/\s+/)[0].toLowerCase();

    const editDist = levenshtein(qLower, firstWord);
    const ocrDist = ocrAwareDistance(query, firstWord);
    const coreEditDist = levenshtein(qLower, coreFirst);

    const bestDist = Math.min(editDist, coreEditDist);
    const bestOcrDist = Math.min(ocrDist, ocrAwareDistance(query, coreFirst));

    let score: number;

    if (bestDist === 0) {
      score = 1.0;
    } else if (bestDist === 1 && qLower.length >= 5) {
      score = bestOcrDist < 0.8 ? 0.92 : 0.85;
    } else if (bestDist === 1 && qLower.length >= 4) {
      score = bestOcrDist < 0.8 ? 0.88 : 0.80;
    } else if (bestDist === 2 && qLower.length >= 6) {
      score = bestOcrDist < 1.2 ? 0.75 : 0.65;
    } else {
      const maxLen = Math.max(qLower.length, firstWord.length);
      score = Math.max(0, 1 - (bestDist / maxLen)) * 0.7;
    }

    if (firstWord.startsWith(qLower.slice(0, 3)) && qLower.startsWith(firstWord.slice(0, 3))) {
      score = Math.max(score, score + 0.05);
    }

    const wordCount = nameWordCount(medName);
    if (wordCount > 2) {
      score *= (1 - (wordCount - 2) * 0.03);
    }

    if (result.item.quantity > 0) {
      score = Math.min(1.0, score * 1.05);
    }

    score = Math.min(1.0, Math.max(0, score));

    console.log(`[FuzzyMatch]  "${medName}" | edit=${bestDist} ocrDist=${bestOcrDist.toFixed(1)} -> score=${score.toFixed(3)}`);

    return { medication: result.item, score };
  });

  const filtered = scored
    .filter(r => r.score >= 0.25)
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (Math.abs(diff) < 0.02) {
        const aStock = a.medication.quantity > 0;
        const bStock = b.medication.quantity > 0;
        if (aStock !== bStock) return bStock ? 1 : -1;
        return nameWordCount(a.medication.name) - nameWordCount(b.medication.name);
      }
      return diff;
    })
    .slice(0, limit);

  console.log('[FuzzyMatch] Final results:', filtered.map(r => `${r.medication.name} (${r.score.toFixed(3)})`));
  return filtered;
}

export function findTopMatches(
  ocrText: string,
  medications: Medication[],
  limit = 3
): Medication[] {
  return findTopMatchesWithScores(ocrText, medications, limit).map(r => r.medication);
}
