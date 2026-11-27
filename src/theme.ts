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

/**
 * The colours of the screens built before the design rounds. Round 14 (review v4 §5): mapped onto the
 * roles of the design system, so every active screen speaks one language – a primary action on a
 * light surface is brand blue, lime marks progress on blue, success is lime (its text in lime-ink),
 * text is ink. Category colours (gold, coral, purple) keep their meaning.
 */
export const colors = {
  background: ds.canvas,
  surface: ds.surface,
  surfaceAlt: ds.brandSoft,
  text: ds.ink,
  textMuted: ds.inkMuted,
  primary: ds.brand,
  primaryDark: ds.brandPress,
  teal: ds.brand,
  mint: '#C9D4F0',
  mintSoft: ds.brandSoft,
  blueSoft: ds.brandSoft,
  sky: '#C9D4F0',
  gold: '#F4B942',
  goldSoft: '#FFF5DB',
  coral: '#E8796C',
  coralSoft: '#FDEDEA',
  green: ds.limeDeep,
  greenSoft: ds.limeSoft,
  purple: '#7D78C9',
  purpleSoft: '#F0EEFB',
  border: ds.line,
  divider: '#E8EDF6',
  white: '#FFFFFF',
  shadow: '#19344F',
  danger: ds.danger,
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
