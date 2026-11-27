import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Shared modal behaviour (round 13, review U2). Every dialog and sheet of the app uses it:
 *  - initial focus is set ONCE, when the dialog opens – a parent that renders every second (the
 *    speech-guard timer) and passes a new callback no longer pulls the focus back;
 *  - Tab / Shift+Tab stay inside the topmost dialog; Escape closes only the topmost one;
 *  - the page behind is inert (not focusable, not announced by a screen reader) while a dialog is
 *    open: dialogs are rendered outside #root, and #root gets the `inert` attribute;
 *  - on close, the focus returns to the element that opened the dialog.
 */
const stack: HTMLElement[] = [];

function syncBackground() {
  const root = typeof document !== 'undefined' ? document.getElementById('root') : null;
  if (!root) return;
  if (stack.length > 0) {
    root.setAttribute('inert', '');
    root.setAttribute('aria-hidden', 'true');
  } else {
    root.removeAttribute('inert');
    root.removeAttribute('aria-hidden');
  }
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const focusables = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.closest('[inert]') && n.getClientRects().length > 0);

export function useModal(panel: React.RefObject<HTMLElement | null>, onClose: () => void, initialFocus?: React.RefObject<HTMLElement | null>) {
  // The latest callback, without re-running the effect (and without moving the focus) when it changes.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stack.push(el);
    syncBackground();
    (initialFocus?.current ?? focusables(el)[0] ?? el).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== el) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(el);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(el);
      if (i >= 0) stack.splice(i, 1);
      syncBackground();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    // Once per opening: the dialog mounts when it opens and unmounts when it closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

type ModalLayerProps = {
  label: string;
  onClose: () => void;
  /** The full-screen layer behind the panel (position, alignment, dimming). */
  backdropClassName: string;
  panelClassName: string;
  /** A tap on the dimmed background closes (default). A sheet that is busy can refuse. */
  closeOnBackdrop?: boolean;
  initialFocus?: React.RefObject<HTMLElement | null>;
  panelProps?: Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'role' | 'onClick'>;
  children: React.ReactNode;
};

/** A dialog or sheet: rendered outside #root, with the shared behaviour of useModal. */
export function ModalLayer({ label, onClose, backdropClassName, panelClassName, closeOnBackdrop = true, initialFocus, panelProps, children }: ModalLayerProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  useModal(panel, onClose, initialFocus);
  return createPortal(
    <div className={backdropClassName} onClick={() => closeOnBackdrop && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        dir="rtl"
        tabIndex={-1}
        {...panelProps}
        className={`outline-none ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
