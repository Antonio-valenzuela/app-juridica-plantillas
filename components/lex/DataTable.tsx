"use client";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export type LexColumn<T> = { key: string; header: string; render: (row: T) => ReactNode; width?: string; className?: string };

const Check = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
  <button
    role="checkbox" aria-checked={checked} aria-label={label}
    onClick={(e) => { e.stopPropagation(); onChange(); }}
    className={`flex h-4 w-4 items-center justify-center rounded-[4px] border ${checked ? "border-lex-primary-container bg-lex-primary-container text-white" : "border-[#D1D1D6] bg-white"}`}
  >
    {checked && <Icon name="check" size={12} />}
  </button>
);

export function DataTable<T>({
  columns, rows, rowKey, selectedKey, onRowClick, selectable = false, selectedKeys = [], onSelectionChange, dense = false, emptyMessage = "Sin resultados.",
}: {
  columns: LexColumn<T>[]; rows: T[]; rowKey: (r: T) => string;
  selectedKey?: string; onRowClick?: (r: T) => void;
  selectable?: boolean; selectedKeys?: string[]; onSelectionChange?: (keys: string[]) => void;
  dense?: boolean; emptyMessage?: string;
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedKeys.includes(rowKey(r)));
  const toggleAll = () => onSelectionChange?.(allSelected ? [] : rows.map(rowKey));
  const toggleOne = (k: string) => onSelectionChange?.(selectedKeys.includes(k) ? selectedKeys.filter((x) => x !== k) : [...selectedKeys, k]);
  const py = dense ? "py-2" : "py-3";

  return (
    <div className="overflow-x-auto rounded-xl bg-lex-surface-lowest shadow-lex-l2 lex-scroll">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-lex-surface-low">
            {selectable && <th className="w-10 px-4 py-2"><Check checked={allSelected} onChange={toggleAll} label="Seleccionar todo" /></th>}
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width }} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-lex-secondary">{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center text-lex-body text-lex-secondary">{emptyMessage}</td></tr>
          )}
          {rows.map((r) => {
            const k = rowKey(r);
            const active = k === selectedKey;
            return (
              <tr
                key={k}
                onClick={() => onRowClick?.(r)}
                className={`border-t border-black/[0.06] transition-colors ${onRowClick ? "cursor-pointer" : ""} ${active ? "bg-lex-container shadow-[inset_3px_0_0_#9B1C31]" : "hover:bg-lex-container/60"}`}
              >
                {selectable && <td className={`px-4 ${py}`}><Check checked={selectedKeys.includes(k)} onChange={() => toggleOne(k)} label="Seleccionar fila" /></td>}
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 ${py} align-top text-lex-body ${c.className ?? ""}`}>{c.render(r)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (p: number) => void }) {
  return (
    <div className="flex items-center gap-2 text-lex-caption text-lex-secondary">
      <span className="lex-tabular">Pág {page} de {pageCount}</span>
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Anterior" className="flex h-7 w-7 items-center justify-center rounded hover:bg-lex-container disabled:opacity-40"><Icon name="chevron_left" size={18} /></button>
      <button disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label="Siguiente" className="flex h-7 w-7 items-center justify-center rounded hover:bg-lex-container disabled:opacity-40"><Icon name="chevron_right" size={18} /></button>
    </div>
  );
}