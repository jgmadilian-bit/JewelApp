// Design tokens for JewelApp. A restrained, premium dark theme: warm near-black
// surfaces, a soft champagne accent used sparingly, and quiet borders. The goal
// is elegant and clean — not flashy.

export const colors = {
  bg: '#0C0C0E',
  surface: '#141417',
  surfaceAlt: '#1A1A1E',
  surfaceHi: '#232329',
  border: '#26262C',
  borderHi: '#33333A',

  text: '#F2F1EE', // warm off-white reads more premium than pure white
  textMuted: '#9B99A0',
  textFaint: '#66646B',

  // Champagne, not bright gold — muted on purpose so it accents rather than shouts.
  gold: '#C6A96C',
  goldSoft: '#DCC596',
  goldDeep: '#857043',

  green: '#43B581',
  greenDeep: '#1F6B45',
  red: '#E0594C',
  redDeep: '#73291F',
  amber: '#D8A24A',
  blue: '#5B8DEF',

  onGold: '#1B1606',
  overlay: 'rgba(0,0,0,0.62)',
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** 4px base spacing scale. spacing(4) === 16. */
export const spacing = (n: number) => n * 4;

export const font = {
  // System fonts keep the bundle light; SF Pro on iOS reads as premium.
  h1: { fontSize: 27, fontWeight: '700' as const, letterSpacing: -0.4 },
  h2: { fontSize: 21, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.8 },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const;
