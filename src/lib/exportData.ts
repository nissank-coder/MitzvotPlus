import type { AppState } from '../types';
import { BUILD_INFO } from '../config/buildInfo';

/**
 * "Export my data" (round 12): everything stored on this device, as JSON, for the user only –
 * including private parts (speech timer, reflections), because it is the user's own copy and never
 * leaves the device unless the user shares the file.
 */
export function exportLocalJson(state: AppState, at = Date.now()): string {
  return JSON.stringify(
    {
      app: 'mitzvot-plus',
      exportedAt: new Date(at).toISOString(),
      appVersion: BUILD_INFO.version,
      note: 'כל הנתונים השמורים במכשיר זה. הקובץ כולל מידע פרטי – שמרו אותו במקום בטוח.',
      data: state,
    },
    null,
    2,
  );
}

/** Saves the file in a browser; on a phone opens the share sheet with the text. */
export async function saveExport(json: string, fileName = 'mitzvot-plus-export.json'): Promise<'downloaded' | 'shared' | 'failed'> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: fileName, text: json, dialogTitle: 'ייצוא הנתונים שלי' });
      return 'shared';
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
