/**
 * Design round 1 (26.11.2026): the tokens of the new visual language (same values as @theme in
 * src/index.css – use the Tailwind classes bg-brand, text-ink, … in markup; these are for SVG and
 * icon colours). The older palette below stays for screens that were not redesigned yet.
 */
export const ds = {
  brand: '#263A80',
  brandPress: '#1C2B62',
  brandSoft: '#E9EEFA',
  onBrandMuted: '#C7D2F0',
  lime: '#71E000',
  limeDeep: '#4FA300',
  limeSoft: '#E4F9C8',
  limeInk: '#3D6B00',
  ink: '#172344',
  inkMuted: '#5F6D84',
  canvas: '#F5F8FC',
  surface: '#FFFFFF',
  line: '#DCE4F0',
  track: '#E4EAF5',
  danger: '#C24A3D',
  amberInk: '#8A5A00',
  white: '#FFFFFF',
} as const;

export const colors = {
  background: '#F4F8FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF6F7',
  text: '#17324D',
  textMuted: '#718397',
  primary: '#1B6F8F',
  primaryDark: '#14536C',
  teal: '#2AAE9B',
  mint: '#BDECE3',
  mintSoft: '#E8F8F4',
  blueSoft: '#EAF4FB',
  sky: '#D9EEF7',
  gold: '#F4B942',
  goldSoft: '#FFF5DB',
  coral: '#E8796C',
  coralSoft: '#FDEDEA',
  green: '#4DAA78',
  greenSoft: '#EAF7EF',
  purple: '#7D78C9',
  purpleSoft: '#F0EEFB',
  border: '#DDE8EE',
  divider: '#EAF0F4',
  white: '#FFFFFF',
  shadow: '#19344F',
  danger: '#C95B53',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

export const shadow = {
  shadowColor: colors.shadow,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 18,
  elevation: 4,
};

export const typography = {
  title: 28,
  h1: 24,
  h2: 20,
  h3: 17,
  body: 15,
  small: 13,
  tiny: 11,
};
