import { Capacitor } from '@capacitor/core';

/**
 * Share and read-aloud (round 11 §4). Native plugins on iOS/Android (@capacitor/share 8.0.3,
 * @capacitor-community/text-to-speech 8.0.2, both MIT), Web APIs in a browser.
 * Hebrew read-aloud is offered only when a Hebrew voice exists on the device – never a button that
 * does nothing or reads Hebrew with a foreign voice.
 */
export type SpeechSupport =
  | { available: true; engine: 'native' | 'web' }
  | { available: false; reason: 'no-hebrew-voice' | 'unsupported' };

const isHebrew = (lang: string) => /^(he|iw)([-_]|$)/i.test(lang);

export async function speechSupport(): Promise<SpeechSupport> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      const { languages } = await TextToSpeech.getSupportedLanguages();
      return languages.some(isHebrew) ? { available: true, engine: 'native' } : { available: false, reason: 'no-hebrew-voice' };
    } catch {
      return { available: false, reason: 'unsupported' };
    }
  }
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return { available: false, reason: 'unsupported' };
  const voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const now = window.speechSynthesis.getVoices();
    if (now.length > 0) return resolve(now);
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 800);
  });
  return voices.some((v) => isHebrew(v.lang)) ? { available: true, engine: 'web' } : { available: false, reason: 'no-hebrew-voice' };
}

/** Reads the text aloud; resolves when finished or stopped. */
export async function speak(text: string, onEnd: () => void): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    await TextToSpeech.speak({ text, lang: 'he-IL', rate: 0.9, category: 'playback' }).finally(onEnd);
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'he-IL';
  u.rate = 0.88;
  const voice = window.speechSynthesis.getVoices().find((v) => isHebrew(v.lang));
  if (voice) u.voice = voice;
  u.onend = onEnd;
  u.onerror = onEnd;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export async function stopSpeaking(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    await TextToSpeech.stop().catch(() => undefined);
  } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Shares text through the system sheet; falls back to the clipboard. Only what the caller passes is
 * shared (the item text and its source) – never personal data.
 */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'cancelled' | 'unavailable'> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      if (!(await Share.canShare()).value) return 'unavailable';
      await Share.share({ title, text, dialogTitle: title });
      return 'shared';
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title, text });
      return 'shared';
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
    return 'unavailable';
  } catch {
    return 'cancelled';
  }
}

export const NO_HEBREW_VOICE_HELP =
  'אין במכשיר קול עברי להקראה. אפשר להוסיף קול עברי בהגדרות המכשיר (נגישות ← הקראה / המרת טקסט לדיבור), או לקרוא את הטקסט בגופן מוגדל.';
