import React, { useEffect, useRef } from 'react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
};

/** Confirmation dialog (design round 1 tokens). Escape and the backdrop close it; focus starts on cancel. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'אישור',
  cancelLabel,
  destructive = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const first = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0E1630]/45 px-5" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-[360px] rounded-[24px] bg-surface p-6 ds-shadow" onClick={(e) => e.stopPropagation()} dir="rtl">
        <h3 className="text-[19px] font-extrabold text-ink">{title}</h3>
        <p className="mt-2 text-[15px] leading-6 text-ink-muted">{message}</p>
        <div className="mt-6 flex flex-row items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              onConfirm?.();
              onClose();
            }}
            className={`flex-1 min-h-[48px] rounded-[14px] px-4 text-[15px] font-bold ${destructive ? 'bg-danger text-white' : 'bg-brand text-on-brand'}`}
          >
            {confirmLabel}
          </button>
          {cancelLabel ? (
            <button
              ref={first}
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[48px] rounded-[14px] border border-line bg-surface px-4 text-[15px] font-bold text-ink"
            >
              {cancelLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
