"use client";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { WorkspaceApi } from "./DocumentWorkspace";

const iconBtn = "flex h-7 w-7 items-center justify-center rounded text-lex-on-variant transition-colors hover:bg-lex-container disabled:opacity-40";

/** Toolbar estilo macOS Preview. Úsala como `toolbar={(api) => <ViewerToolbar api={api} .../>}`. */
export function ViewerToolbar({
  api, page, pageCount, onPageChange, zoom, onZoomChange, onSearch, hasToc = true, hasInspector = true, extra,
}: {
  api: WorkspaceApi; page?: number; pageCount?: number; onPageChange?: (p: number) => void;
  zoom?: number; onZoomChange?: (z: number) => void; onSearch?: () => void;
  hasToc?: boolean; hasInspector?: boolean; extra?: ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-1">
        {hasToc && <button className={iconBtn} onClick={api.toggleToc} aria-pressed={api.tocOpen} title="Esquema"><Icon name="format_list_bulleted" size={18} /></button>}
        {page !== undefined && pageCount !== undefined && onPageChange && (
          <div className="flex items-center gap-1 pl-2 text-lex-caption text-lex-secondary">
            <button className={iconBtn} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior"><Icon name="keyboard_arrow_up" size={18} /></button>
            <span className="lex-tabular">Pág. {page} / {pageCount}</span>
            <button className={iconBtn} disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label="Página siguiente"><Icon name="keyboard_arrow_down" size={18} /></button>
          </div>
        )}
      </div>

      {zoom !== undefined && onZoomChange && (
        <div className="flex items-center gap-1 text-lex-caption text-lex-secondary">
          <button className={iconBtn} onClick={() => onZoomChange(Math.max(50, zoom - 10))} aria-label="Reducir"><Icon name="remove" size={18} /></button>
          <span className="lex-tabular w-10 text-center">{zoom}%</span>
          <button className={iconBtn} onClick={() => onZoomChange(Math.min(200, zoom + 10))} aria-label="Ampliar"><Icon name="add" size={18} /></button>
        </div>
      )}

      <div className="flex items-center gap-1">
        {extra}
        {onSearch && <button className={iconBtn} onClick={onSearch} title="Buscar en el documento"><Icon name="search" size={18} /></button>}
        <button className={iconBtn} onClick={api.toggleFocus} aria-pressed={api.focus} title="Modo documento"><Icon name={api.focus ? "close_fullscreen" : "open_in_full"} size={18} /></button>
        {hasInspector && <button className={iconBtn} onClick={api.toggleInspector} aria-pressed={api.inspectorOpen} title="Inspector"><Icon name="right_panel_open" size={18} /></button>}
      </div>
    </>
  );
}