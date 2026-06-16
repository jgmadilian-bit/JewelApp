import type { Gemstone, ParsedListing, WeightUnit } from '@/src/lib/types';

// Parses the free-text captions dealers post (the heart of a listing). Pure
// string work — free, instant, offline, and runs anywhere (incl. Expo Go).
// Tuned against real group posts, e.g.:
//   "18K, Mid-century bracelet, 60.6 dwts, Ruby Diamonds and enamel
//    (chipped in a few places) 7", 1 ct. White VS-SI diamonds, 10% over,
//    $10,800 plus label"
//   "3.31ct Old Miner - 3.31ct E SI1 EX/VG/None $46,500 + label"
//   "18k white gold semi-mount ... Total carat ~1.24ctw Approx 0.52ctw rounds,
//    G/H, nice SI Approx 0.25ct each pear F/G VS 3.9g Sz 6.5 $1000 shipped"

const GEM_TYPES = [
  'diamond',
  'ruby',
  'sapphire',
  'emerald',
  'amethyst',
  'turquoise',
  'opal',
  'pearl',
  'topaz',
  'garnet',
  'tanzanite',
  'aquamarine',
  'citrine',
  'peridot',
  'tourmaline',
  'morganite',
  'spinel',
];

const SHAPES: Record<string, string> = {
  'round brilliant': 'Round',
  rounds: 'Round',
  round: 'Round',
  princess: 'Princess',
  cushion: 'Cushion',
  oval: 'Oval',
  pears: 'Pear',
  pear: 'Pear',
  marquise: 'Marquise',
  'emerald cut': 'Emerald Cut',
  baguette: 'Baguette',
  asscher: 'Asscher',
  radiant: 'Radiant',
  heart: 'Heart',
  trillion: 'Trillion',
};

const ERAS: { re: RegExp; label: string }[] = [
  { re: /art\s*deco/i, label: 'Art Deco' },
  { re: /art\s*nouveau/i, label: 'Art Nouveau' },
  { re: /mid[-\s]?century/i, label: 'Mid-century' },
  { re: /victorian/i, label: 'Victorian' },
  { re: /edwardian/i, label: 'Edwardian' },
  { re: /georgian/i, label: 'Georgian' },
  { re: /retro/i, label: 'Retro' },
  { re: /antique/i, label: 'Antique' },
  { re: /vintage/i, label: 'Vintage' },
  { re: /estate/i, label: 'Estate' },
  { re: /old\s*(?:miner|mine)/i, label: 'Old Mine' },
  { re: /old\s*european/i, label: 'Old European' },
];

const CATEGORIES: { re: RegExp; label: string }[] = [
  { re: /semi[-\s]?mount/i, label: 'Semi-mount' },
  { re: /bracelet/i, label: 'Bracelet' },
  { re: /bangle/i, label: 'Bangle' },
  { re: /necklace/i, label: 'Necklace' },
  { re: /chain/i, label: 'Chain' },
  { re: /pendant/i, label: 'Pendant' },
  { re: /(?:earrings?|studs|hoops)/i, label: 'Earrings' },
  { re: /brooch|\bpin\b/i, label: 'Brooch' },
  { re: /cuff\s?links?/i, label: 'Cufflinks' },
  { re: /\bring\b/i, label: 'Ring' },
  { re: /\bwatch\b/i, label: 'Watch' },
  { re: /\bmount\b/i, label: 'Mount' },
];

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseMetal(text: string): string | null {
  if (/\bplatinum\b|\bplat\b|\bpt\s?950\b|\b950\s?plat/i.test(text)) return 'Platinum';
  if (/\bsterling\b|\b925\b/i.test(text)) return 'Sterling Silver';
  const k = text.match(/\b(\d{1,2})\s?k(?:t)?\b/i);
  if (!k) {
    if (/\bsilver\b/i.test(text)) return 'Silver';
    if (/\bgold\b/i.test(text)) return 'Gold';
    return null;
  }
  // Only treat a color word as the metal color when it sits next to "gold",
  // so "White VS-SI diamonds" (a stone color) doesn't become white gold.
  const color = text.match(/\b(yellow|white|rose|pink|green)\s+gold\b/i);
  return `${k[1]}K${color ? ` ${titleCase(color[1].toLowerCase())}` : ''} Gold`;
}

function parseWeight(text: string): { value: number | null; unit: WeightUnit | null } {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(dwts?|grams?|gr|g)\b/i);
  if (!m) return { value: null, unit: null };
  const unit: WeightUnit = /^d/i.test(m[2]) ? 'dwt' : 'g';
  return { value: Number(m[1]), unit };
}

function parsePrice(text: string): number | null {
  const m = text.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

function parsePriceTerms(text: string): string | null {
  const terms: string[] = [];
  const over = text.match(/(\d+%\s*over)/i);
  if (over) terms.push(over[1].toLowerCase());
  if (/(plus\s+label|\+\s*label)/i.test(text)) terms.push('plus label');
  if (/domestic shipping included/i.test(text)) terms.push('domestic shipping included');
  else if (/\bshipped\b|free shipping/i.test(text)) terms.push('shipped');
  if (/payment on receipt/i.test(text)) terms.push('payment on receipt');
  if (/\bfirm\b/i.test(text)) terms.push('firm');
  if (/\bo\.?b\.?o\.?\b/i.test(text)) terms.push('obo');
  if (/\btrade\b/i.test(text)) terms.push('trade');
  return terms.length ? Array.from(new Set(terms)).join(' · ') : null;
}

function parseCategory(text: string): string | null {
  for (const c of CATEGORIES) if (c.re.test(text)) return c.label;
  return null;
}

function parseEra(text: string): string | null {
  for (const e of ERAS) if (e.re.test(text)) return e.label;
  return null;
}

function parseRingSize(text: string): string | null {
  const m = text.match(/\b(?:size|sz)\s*[:.]?\s*(\d+(?:\.\d+)?)/i);
  return m ? m[1] : null;
}

function parseLength(text: string): string | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:"|''|inch(?:es)?\b)/i);
  return m ? `${m[1]}"` : null;
}

function parseTotalCarat(text: string): number | null {
  const m = text.match(/total\s+(?:carat|weight|ct[w]?)[:\s~]*(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : null;
}

function parseCondition(text: string): string | null {
  const paren = text.match(
    /\(([^)]*(?:chip|repair|crack|damage|worn|missing|scratch|as[-\s]?is)[^)]*)\)/i,
  );
  if (paren) return paren[1].trim();
  for (const sentence of text.split(/[.\n]/)) {
    if (/(?:needs?\s+\w*\s*repair|repairs?|chipped|cracked|damaged|missing|as[-\s]?is)/i.test(sentence)) {
      const s = sentence.trim();
      if (s.length > 3 && s.length < 120) return s;
    }
  }
  return null;
}

function scanColor(ctx: string): string | null {
  const range = ctx.match(/\b([D-Z])\s*[/\-]\s*([D-Z])\b/);
  if (range) return `${range[1]}/${range[2]}`.toUpperCase();
  const fancy = ctx.match(/Fancy(?:\s+(?:Light|Intense|Vivid|Deep|Dark))?\s+[A-Za-z]+/i);
  if (fancy) return fancy[0].replace(/\s+/g, ' ');
  if (/\bwhite\b/i.test(ctx)) return 'White';
  const single = ctx.match(/(?<![A-Za-z])([D-Z])(?![A-Za-z0-9])/);
  return single ? single[1].toUpperCase() : null;
}

function scanClarity(ctx: string): string | null {
  const m = ctx.match(/\b(VS-SI|VS\/SI|VVS[12]|VS[12]|SI[123]|VVS|VS|SI|IF|FL|I[123])\b/i);
  return m ? m[1].toUpperCase().replace('VS/SI', 'VS-SI') : null;
}

function scanShape(ctx: string): string | null {
  const lower = ctx.toLowerCase();
  for (const key of Object.keys(SHAPES)) if (lower.includes(key)) return SHAPES[key];
  return null;
}

function scanCut(ctx: string): string | null {
  const m = ctx.match(/\b(EX|VG|GD|Excellent|Very Good|Ideal|Good|Fair|Poor)\b/);
  if (!m) return null;
  const map: Record<string, string> = { EX: 'Excellent', VG: 'Very Good', GD: 'Good' };
  return map[m[1].toUpperCase()] ?? titleCase(m[1].toLowerCase());
}

function gemTypeIn(ctx: string): string | null {
  const lower = ctx.toLowerCase();
  for (const t of GEM_TYPES) if (lower.includes(t)) return titleCase(t);
  return null;
}

/** Extract each "X ct(w) ..." cluster as a gemstone, skipping the total line. */
function extractGemstones(text: string): { gems: Gemstone[]; totalCarat: number | null } {
  const gems: Gemstone[] = [];
  let totalCarat = parseTotalCarat(text);
  const re = /(\d+(?:\.\d+)?)\s*(?:ct(w)?|carats?)\b\.?\s*(each)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 28), m.index);
    // Skip the "Total carat ~1.24ctw" figure — captured separately as total.
    if (/total\b[^\d]*$/i.test(before)) {
      if (totalCarat == null) totalCarat = Number(m[1]);
      continue;
    }
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
    const ctx = `${before} ${after}`;
    gems.push({
      carat: Number(m[1]),
      ctw: Boolean(m[2]),
      each: Boolean(m[3]),
      type: gemTypeIn(ctx),
      color: scanColor(after),
      clarity: scanClarity(after),
      // Descriptor usually follows the carat ("0.25ct each pear"); fall back to before.
      shape: scanShape(after) ?? scanShape(before),
    });
  }
  // Collapse duplicates (a carat is often repeated in a caption).
  const seen = new Set<string>();
  const deduped = gems.filter((g) => {
    const key = `${g.carat}|${g.ctw}|${g.each}|${g.type}|${g.color}|${g.clarity}|${g.shape}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { gems: deduped, totalCarat };
}

function buildTitle(p: Omit<ParsedListing, 'title' | 'description'>, gemTypes: string[]): string {
  const loose = !p.category || p.category === 'Loose stone';
  if (loose) {
    const parts = [
      p.carat != null ? `${p.carat}ct` : null,
      p.era,
      p.shape,
      p.stone_type ?? gemTypes[0] ?? 'Stone',
      p.color,
      p.clarity,
    ].filter(Boolean);
    return parts.join(' ').trim();
  }
  const gemSummary = gemTypes.slice(0, 2).join(' & ');
  return [p.era, p.metal, gemSummary || null, p.category].filter(Boolean).join(' ').trim();
}

export function parseCaption(raw: string): ParsedListing {
  const text = raw.replace(/ /g, ' ').trim();

  const { gems, totalCarat } = extractGemstones(text);
  // All gem types named anywhere in the caption (incl. ones with no carat,
  // e.g. "Ruby" in "Ruby Diamonds"), ordered by where they appear.
  const lower = text.toLowerCase();
  const allTypes = GEM_TYPES.filter((t) => lower.includes(t))
    .map((t) => ({ label: titleCase(t), at: lower.indexOf(t) }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.label);

  // Primary/headline stone: largest single (non-ctw) stone with a grade, else
  // the first gemstone found.
  const graded = gems.filter((g) => g.color || g.clarity);
  const primary =
    graded.sort((a, b) => (b.carat ?? 0) - (a.carat ?? 0))[0] ?? gems[0] ?? null;

  let stone_type = primary?.type ?? (allTypes[0] ?? null);
  const cut = scanCut(text);
  if (!stone_type && (primary?.color || primary?.clarity || cut)) stone_type = 'Diamond';

  const category = parseCategory(text) ?? (cut || /loose/i.test(text) ? 'Loose stone' : null);
  const metal = parseMetal(text);
  const { value: gross_weight, unit: weight_unit } = parseWeight(text);

  const base: Omit<ParsedListing, 'title' | 'description'> = {
    category,
    metal,
    gross_weight,
    weight_unit,
    ring_size: parseRingSize(text),
    item_length: parseLength(text),
    condition: parseCondition(text),
    era: parseEra(text),
    total_carat: totalCarat,
    price_terms: parsePriceTerms(text),
    price: parsePrice(text),
    gemstones: gems,
    // Primary stone (StoneDetails):
    stone_type,
    shape: primary?.shape ?? scanShape(text),
    carat: primary?.carat ?? null,
    color: primary?.color ?? null,
    clarity: primary?.clarity ?? null,
    cut,
    measurements: null,
    lab: /\bgia\b/i.test(text) ? 'GIA' : /\bigi\b/i.test(text) ? 'IGI' : null,
    cert_number: null,
  };

  return { ...base, title: buildTitle(base, allTypes), description: text };
}
