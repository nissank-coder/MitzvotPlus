import React, { useRef } from 'react';
import { ModalLayer } from './Modal';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  /** The cancel button only (not Escape or the background) – for a choice between two answers. */
  onCancel?: () => void;
  /** After any of: confirm, cancel, Escape, a tap on the background. */
  onClose: () => void;
};

/**
 * Confirmation dialog (design round 1 tokens). Escape and the background close it; the focus
 * starts on "cancel" once, when it opens (round 13, U2: a parent that renders every second no
 * longer pulls it back), stays inside the dialog, and returns to the opener afterwards.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'אישור',
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
  onClose,
}: ConfirmDialogProps) {
  const first = useRef<HTMLButtonElement | null>(null);
  if (!open) return null;

  return (
    <ModalLayer
      label={title}
      onClose={onClose}
      initialFocus={first}
      backdropClassName="fixed inset-0 z-50 flex items-center justify-center bg-[#0E1630]/45 px-5"
      panelClassName="w-full max-w-[360px] rounded-[24px] bg-surface p-6 ds-shadow"
    >
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
            onClick={() => {
              onCancel?.();
              onClose();
            }}
            className="flex-1 min-h-[48px] rounded-[14px] border border-line bg-surface px-4 text-[15px] font-bold text-ink"
          >
            {cancelLabel}
          </button>
        ) : null}
      </div>
    </ModalLayer>
  );
}
