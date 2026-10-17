'use client';

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DetailDrawerProps {
  open: boolean;
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Panel lateral derecho para el detalle de un registro: fondo atenuado, cierre con Esc, clic fuera o «Cerrar»,
 * foco atrapado y devuelto al control que lo abrió. Solo cambia dónde se muestra el contenido, no su lógica.
 */
export function DetailDrawer({ open, title, eyebrow, onClose, children }: DetailDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    // Mismo sistema visual que el modal «Opciones de redacción» (.lex-modal*); .lex-drawer solo lo ancla a la derecha.
    <div className="lex-modal-backdrop lex-drawer-backdrop" data-testid="detail-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCloseRef.current(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="lex-modal lex-drawer">
        <header className="lex-modal-header">
          <div>{eyebrow && <p className="lex-modal-eyebrow">{eyebrow}</p>}<h2 id={titleId} className="lex-modal-title">{title}</h2></div>
          <button type="button" className="lex-modal-close" onClick={() => onCloseRef.current()} aria-label="Cerrar" title="Cerrar">×</button>
        </header>
        <div className="lex-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
