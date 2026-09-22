"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export type WorkspaceApi = {
  tocOpen: boolean;
  inspectorOpen: boolean;
  focus: boolean;
  toggleToc: () => void;
  toggleInspector: () => void;
  toggleFocus: () => void;
};

type Props = {
  /** Barra superior tipo macOS Preview (44px). Recibe la api para poner los botones de paneles. */
  toolbar?: (api: WorkspaceApi) => ReactNode;
  /** Panel izquierdo (índice / esquema). Cerrado por defecto. */
  toc?: ReactNode;
  tocTitle?: string;
  /** Panel derecho (análisis, criterios, términos). */
  inspector?: ReactNode;
  inspectorTitle?: string;
  defaultInspectorOpen?: boolean;
  /** Tu visor REAL (PDF.js, editor, etc.) — se renderiza dentro del canvas. */
  children: ReactNode;
};

/**
 * Workspace documental: [ TOC 256px | canvas | Inspector 360px ].
 * Modo "documento" (focus) oculta ambos paneles para que el documento use todo el ancho.
 * NO contiene datos: todo llega por props/slots.
 */
export function DocumentWorkspace({
  toolbar,
  toc,
  tocTitle = "Esquema",
  inspector,
  inspectorTitle = "Análisis",
  defaultInspectorOpen = true,
  children,
}: Props) {
  const [tocOpen, setToc] = useState(false);
  const [inspectorOpen, setInspector] = useState(defaultInspectorOpen);
  const [focus, setFocus] = useState(false);

  const api: WorkspaceApi = {
    tocOpen,
    inspectorOpen,
    focus,
    toggleToc: () => setToc((v) => !v),
    toggleInspector: () => setInspector((v) => !v),
    toggleFocus: () => setFocus((v) => !v),
  };

  const showToc = !!toc && tocOpen && !focus;
  const showInspector = !!inspector && inspectorOpen && !focus;

  return (
    <div className="flex h-full min-h-[480px] flex-col overflow-hidden rounded-xl bg-lex-container shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      {toolbar && (
        <div className="z-20 flex h-11 shrink-0 items-center justify-between bg-lex-surface-low/95 px-3 shadow-[0_1px_4px_rgba(0,0,0,0.03)] backdrop-blur-md">
          {toolbar(api)}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {showToc && (
          <aside className="z-10 flex w-64 shrink-0 flex-col bg-lex-surface-lowest shadow-lg">
            <PanelHeader title={tocTitle} onClose={api.toggleToc} />
            <div className="min-h-0 flex-1 overflow-y-auto p-3 lex-scroll">{toc}</div>
          </aside>
        )}

        {/* Canvas central */}
        <div className="min-w-0 flex-1 overflow-auto px-6 py-8 lex-scroll">
          <div className="mx-auto w-full max-w-[816px]">{children}</div>
        </div>

        {showInspector && (
          <aside className="z-10 flex w-[360px] shrink-0 flex-col bg-lex-surface-lowest shadow-[-4px_0_16px_rgba(0,0,0,0.04)]">
            <PanelHeader title={inspectorTitle} onClose={api.toggleInspector} />
            <div className="min-h-0 flex-1 overflow-y-auto p-4 lex-scroll">{inspector}</div>
          </aside>
        )}
      </div>
    </div>
  );
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between px-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-lex-secondary">{title}</h2>
      <button
        onClick={onClose}
        aria-label={`Cerrar ${title}`}
        className="flex h-7 w-7 items-center justify-center rounded text-lex-on-variant transition-colors hover:bg-lex-container"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

/** Hoja de documento (papel). Úsala solo si renderizas texto; si ya usas PDF.js, deja su canvas tal cual. */
export function DocumentSheet({ children }: { children: ReactNode }) {
  return (
    <article className="w-full rounded-sm bg-white p-14 font-lex-doc text-lex-doc-body text-[#1A1A1C] shadow-lex-sheet select-text">
      {children}
    </article>
  );
}