import type { ParsedCertificate } from '@/src/lib/types';

// Vocabularies on printed diamond/stone reports. Longer phrases first so
// "Round Brilliant" wins over "Round" and "Very Good" over "Good".
const SHAPES = [
  'Round Brilliant',
  'Cushion Brilliant',
  'Cushion Modified',
  'Emerald Cut',
  'Square Emerald',
  'Round',
  'Princess',
  'Cushion',
  'Oval',
  'Emerald',
  'Pear',
  'Marquise',
  'Radiant',
  'Asscher',
  'Heart',
  'Trilliant',
  'Baguette',
];

// Order matters: check FL/IF before the VVS/VS/SI/I families when scanning.
const CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'SI3', 'I1', 'I2', 'I3'];
const CUTS = ['Excellent', 'Very Good', 'Ideal', 'Good', 'Fair', 'Poor'];
const LABS = ['GIA', 'IGI', 'GCAL', 'AGS', 'HRD', 'EGL'];
const STONE_TYPES = [
  'Diamond',
  'Sapphire',
  'Ruby',
  'Emerald',
  'Spinel',
  'Tanzanite',
  'Aquamarine',
  'Topaz',
  'Tourmaline',
  'Garnet',
  'Opal',
  'Amethyst',
  'Morganite',
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** First vocabulary token that appears as a whole word in the text. */
function scanVocabulary(text: string, vocab: string[]): string | null {
  for (const token of vocab) {
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(token)}(?![A-Za-z0-9])`, 'i');
    if (re.test(text)) return token;
  }
  return null;
}

/** Value after a label, either inline ("Color: D") or on the following line. */
function valueForLabel(lines: string[], labels: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    for (const label of labels) {
      const idx = lower.indexOf(label.toLowerCase());
      if (idx === -1) continue;
      const after = lines[i]
        .slice(idx + label.length)
        .replace(/^[\s:.\-–—]+/, '')
        .trim();
      if (after) return after;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim()) return lines[j].trim();
      }
    }
  }
  return null;
}

function parseCarat(text: string, lines: string[]): number | null {
  const labeled = valueForLabel(lines, ['Carat Weight', 'Carat', 'Weight']);
  const fromLabel = labeled?.match(/(\d+\.\d{1,2})/);
  if (fromLabel) return Number(fromLabel[1]);
  const inline = text.match(/(\d+\.\d{1,2})\s*(?:ct\b|carat)/i);
  return inline ? Number(inline[1]) : null;
}

function parseColor(text: string, lines: string[]): string | null {
  const fancy = text.match(/Fancy(?:\s+(?:Light|Intense|Vivid|Deep|Dark))?\s+[A-Za-z]+/i);
  if (fancy) return fancy[0].replace(/\s+/g, ' ').trim();
  const labeled = valueForLabel(lines, ['Color Grade', 'Colour Grade', 'Color', 'Colour']);
  const grade = labeled?.match(/\b([D-Z])\b/);
  return grade ? grade[1].toUpperCase() : null;
}

function parseCut(text: string, lines: string[]): string | null {
  // Prefer the labeled "Cut Grade" so we don't grab a Polish/Symmetry value.
  const labeled = valueForLabel(lines, ['Cut Grade', 'Cut']);
  if (labeled) {
    const found = scanVocabulary(labeled, CUTS);
    if (found) return found;
  }
  return scanVocabulary(text, CUTS);
}

function parseMeasurements(text: string): string | null {
  const m = text.match(
    /(\d{1,2}\.\d{1,2})\s*[-x×]\s*(\d{1,2}\.\d{1,2})\s*[x×]\s*(\d{1,2}\.\d{1,2})\s*(?:mm)?/i,
  );
  return m ? `${m[1]} - ${m[2]} x ${m[3]} mm` : null;
}

function parseCertNumber(text: string, lines: string[]): string | null {
  const labeled = valueForLabel(lines, [
    'Report Number',
    'Report No',
    'Certificate Number',
    'Certificate No',
    'GIA Report Number',
    'IGI Report Number',
  ]);
  const fromLabel = labeled?.match(/(\d[\d\s]{6,})/);
  if (fromLabel) return fromLabel[1].replace(/\s+/g, '');
  const run = text.match(/\b(\d{8,12})\b/);
  return run ? run[1] : null;
}

function buildTitle(p: Omit<ParsedCertificate, 'title' | 'mock'>): string {
  const parts: string[] = [];
  if (p.carat != null) parts.push(`${p.carat}ct`);
  if (p.shape) parts.push(p.shape);
  if (p.stone_type && p.stone_type.toLowerCase() !== 'diamond') parts.push(p.stone_type);
  if (p.color) parts.push(p.color);
  if (p.clarity) parts.push(p.clarity);
  return parts.join(' ').trim();
}

/**
 * Heuristic extraction of stone attributes from the raw OCR text of a printed
 * lab report. Tuned for GIA/IGI layouts; every field is best-effort and the UI
 * keeps them editable. Returns `mock: false` (this is real on-device OCR).
 */
export function parseCertificateText(rawText: string): ParsedCertificate {
  const text = rawText.replace(/ /g, ' ');
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  const fields = {
    stone_type: scanVocabulary(text, STONE_TYPES),
    shape: scanVocabulary(text, SHAPES) ?? valueForLabel(lines, ['Shape', 'Shape and Cutting Style']),
    carat: parseCarat(text, lines),
    color: parseColor(text, lines),
    clarity: scanVocabulary(text, CLARITIES),
    cut: parseCut(text, lines),
    measurements: parseMeasurements(text),
    lab: scanVocabulary(text, LABS),
    cert_number: parseCertNumber(text, lines),
  };

  // If it grades like a diamond but the word never appeared, assume Diamond.
  if (!fields.stone_type && fields.color && fields.clarity) {
    fields.stone_type = 'Diamond';
  }

  return { ...fields, title: buildTitle(fields), mock: false };
}

/** True when at least one meaningful stone attribute was extracted. */
export function hasUsefulFields(p: ParsedCertificate): boolean {
  return Boolean(
    p.carat || p.color || p.clarity || p.cut || p.shape || p.measurements || p.cert_number,
  );
}
