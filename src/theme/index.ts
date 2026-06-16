// Design tokens for JewelApp. Dark, premium aesthetic with a gold accent that
// suits a jewelry trade audience. Mobile-first.

export const colors = {
  bg: '#0B0B0F',
  surface: '#16161D',
  surfaceAlt: '#1E1E27',
  surfaceHi: '#262630',
  border: '#2A2A35',
  borderHi: '#3A3A47',

  text: '#F5F5F7',
  textMuted: '#9A9AA8',
  textFaint: '#6B6B78',

  gold: '#D4AF37',
  goldSoft: '#E5C46B',
  goldDeep: '#9C7C1E',

  green: '#34C759',
  greenDeep: '#1F7A3D',
  red: '#FF453A',
  redDeep: '#8A2018',
  blue: '#0A84FF',

  onGold: '#1A1505',
  overlay: 'rgba(0,0,0,0.66)',
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

/** 4px base spacing scale. spacing(4) === 16. */
export const spacing = (n: number) => n * 4;

export const font = {
  // System fonts keep the bundle light; SF Pro on iOS reads as premium.
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: 0.2 },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.6 },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;
