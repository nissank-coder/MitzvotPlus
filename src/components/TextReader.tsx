import React from 'react';
import { Segment } from '../content/packs';
import { useAppStore } from '../store/AppStore';

export const FONT_MIN = 16;
export const FONT_MAX = 34;

/** Font-size control shared by the Siddur and Tehillim readers (saved in settings). */
export function FontSizeControl() {
  const { state, updateSettings } = useAppStore();
  const size = state.settings.readerFontSize ?? 21;
  const set = (v: number) => updateSettings({ readerFontSize: Math.min(FONT_MAX, Math.max(FONT_MIN, v)) });
  return (
    <div dir="rtl" className="flex flex-row items-center gap-2" role="group" aria-label="גודל גופן">
      <button type="button" onClick={() => set(size + 2)} aria-label="הגדלת גופן" className="w-10 h-10 rounded-full bg-white border border-[#DDE8EE] text-[#17324D] text-[18px] font-black">
        א+
      </button>
      <button type="button" onClick={() => set(size - 2)} aria-label="הקטנת גופן" className="w-10 h-10 rounded-full bg-white border border-[#DDE8EE] text-[#17324D] text-[14px] font-black">
        א−
      </button>
    </div>
  );
}

/** Renders text segments; instructions (notes) are smaller and quieter, as in a printed siddur. */
export function TextReader({ segments }: { segments: Segment[] }) {
  const { state } = useAppStore();
  const size = state.settings.readerFontSize ?? 21;
  return (
    <div dir="rtl" lang="he" className="flex flex-col gap-3">
      {segments.map((seg, i) =>
        seg.note ? (
          <p key={i} className="reader-text text-[#718397]" style={{ fontSize: Math.round(size * 0.72) }}>
            {seg.text}
          </p>
        ) : (
          <p key={i} className="reader-text text-[#17324D] whitespace-pre-line" style={{ fontSize: size }}>
            {seg.text}
          </p>
        ),
      )}
    </div>
  );
}

export function ReviewNotice() {
  return (
    <p dir="rtl" className="text-[11px] leading-5 text-[#966500] bg-[#FFF5DB] rounded-[14px] px-3 py-2 mb-3">
      הנוסח נלקח כלשונו מספריא וממתין לבדיקה רבנית. בכל ספק – לנהוג לפי הסידור המודפס והוראת הרב.
    </p>
  );
}
