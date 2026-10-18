'use client';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Diálogo para completar los datos que un escrito exige antes de generarse (ficha del caso, representación…).
 * Se abre solo cuando el sistema pide más requisitos, para que el abogado no tenga que buscar el formulario
 * al final de la página. Cerrado, conserva montado su contenido (oculto) para no perder lo ya escrito.
 */
export function RequirementsDialog({ open, onClose, eyebrow = 'Antes de generar', title, description, children }: {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // `onClose` suele llegar como función nueva en cada render: se guarda en una referencia para que el efecto de
  // abajo dependa solo de `open`. Si dependiera de ella, cada tecla escrita en el formulario lo reiniciaría y
  // devolvería el foco al primer campo.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const root = dialogRef.current;
    const focusable = () => [...(root?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])') || [])];
    (root?.querySelector<HTMLElement>('select:not([disabled]), input:not([disabled])') || focusable()[0])?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; };
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <div className="lex-modal-backdrop" hidden={!open} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role={open ? 'dialog' : undefined} aria-modal={open ? 'true' : undefined} aria-labelledby="requirements-title" className="lex-modal" data-testid="requirements-dialog">
        <header className="lex-modal-header">
          <div>
            <p className="lex-modal-eyebrow">{eyebrow}</p>
            <h2 id="requirements-title" className="lex-modal-title">{title}</h2>
            {description && <p className="lex-help">{description}</p>}
          </div>
          <button type="button" className="lex-modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </header>
        <div className="lex-modal-body">{children}</div>
        <footer className="lex-modal-footer">
          <button type="button" className="lex-button lex-button-ghost" onClick={onClose}>Completar después</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
