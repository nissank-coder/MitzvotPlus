import React from 'react';

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
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0C1F30]/40 px-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[340px] rounded-[24px] bg-white p-6 border border-[#DDE8EE] card-shadow"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <h3 className="text-[19px] font-black text-[#17324D] text-right">{title}</h3>
        <p className="mt-2 text-[14px] leading-6 text-[#718397] text-right">{message}</p>
        <div className="mt-5 flex items-center justify-end gap-2.5">
          {cancelLabel ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#DDE8EE] bg-[#F4F8FB] px-4 py-2.5 text-[13px] font-extrabold text-[#17324D] hover:bg-[#EAF0F4] transition-colors"
            >
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onConfirm?.();
              onClose();
            }}
            className={`rounded-xl px-4 py-2.5 text-[13px] font-extrabold text-white transition-opacity hover:opacity-90 ${
              destructive ? 'bg-[#C95B53]' : 'bg-[#2AAE9B]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
