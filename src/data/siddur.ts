import { Nusach } from '../types';

export const nusachLabel: Record<Nusach, string> = {
  ashkenaz: 'אשכנז',
  sefard: 'ספרד',
  edot: 'עדות המזרח',
};

/** The full siddur of each nusach on Sefaria (public domain texts). */
export const siddurUrl: Record<Nusach, string> = {
  ashkenaz: 'https://www.sefaria.org/Siddur_Ashkenaz?tab=contents',
  sefard: 'https://www.sefaria.org/Siddur_Sefard?tab=contents',
  edot: 'https://www.sefaria.org/Siddur_Edot_HaMizrach?tab=contents',
};
