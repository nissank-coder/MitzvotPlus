import React from 'react';
import { cities } from '../data/locations';
import { nusachLabel } from '../data/siddur';
import { NUSACH_AVAILABILITY, nusachAvailabilityText } from '../content/nusach';
import { Gender, Nusach, UserProfile } from '../types';
import { Chip } from './ui';

/** Gender, nusach and city – shared by onboarding and the profile screen. */
export function ProfileFields({ value, onChange }: { value: UserProfile; onChange: (patch: Partial<UserProfile>) => void }) {
  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div>
        <p className="text-ink text-[14px] font-extrabold mb-2">המצוות שיוצגו לי</p>
        <div className="flex flex-row gap-2">
          {(
            [
              ['male', 'גבר'],
              ['female', 'אישה'],
            ] as Array<[Gender, string]>
          ).map(([g, label]) => (
            <Chip key={g} active={value.gender === g} onPress={() => onChange({ gender: g })}>
              {label}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <p className="text-ink text-[14px] font-extrabold mb-2">נוסח התפילה</p>
        <div className="flex flex-row flex-wrap gap-2">
          {(Object.keys(nusachLabel) as Nusach[]).map((n) => (
            <Chip key={n} active={value.nusach === n} onPress={() => onChange({ nusach: n })}>
              {nusachLabel[n]}
              {NUSACH_AVAILABILITY[n] === 'outside-link' ? ' · בספריא' : ''}
            </Chip>
          ))}
        </div>
        {/* Round 14: what the app can show for this choice – said where the choice is made. */}
        <p className="mt-2 text-[12px] leading-5 text-ink-muted" data-testid="nusach-availability">
          {nusachAvailabilityText(value.nusach)}
        </p>
      </div>
      <div>
        <label htmlFor="city-select" className="text-ink text-[14px] font-extrabold mb-2 block">
          עיר (לזמני היום ולכניסת שבת)
        </label>
        <select
          id="city-select"
          value={value.cityId}
          onChange={(e) => onChange({ cityId: e.target.value })}
          className="w-full min-h-[48px] rounded-[16px] border border-line px-3 text-[15px] text-ink bg-surface outline-none focus:border-brand"
        >
          <optgroup label="ארץ ישראל">
            {cities.filter((c) => c.il).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
          <optgroup label="חוץ לארץ">
            {cities.filter((c) => !c.il).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        </select>
      </div>
    </div>
  );
}
