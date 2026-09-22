"use client";
import type { ReactNode } from "react";
import { PageHeader } from "../PageHeader";
import { FilterBar } from "../FilterBar";
import { DataTable, Pagination, type LexColumn } from "../DataTable";
import { Segmented } from "../ui";

export function ExpedientesView<T>({
  title = "Expedientes", subtitle, eyebrow, headerActions, summary,
  query, onQueryChange, chips, activeChip, onChipChange,
  view, onViewChange, columns, rows, rowKey, onRowClick, renderCard,
  selectedKeys, onSelectionChange, page, pageCount, onPageChange, footerText, emptyMessage,
}: {
  title?: string; subtitle?: string; eyebrow?: ReactNode; headerActions?: ReactNode; summary?: ReactNode;
  query: string; onQueryChange: (q: string) => void;
  chips?: { id: string; label: string; count?: number }[]; activeChip?: string; onChipChange?: (id: string) => void;
  view: "list" | "cards"; onViewChange: (v: "list" | "cards") => void;
  columns: LexColumn<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; renderCard?: (r: T) => ReactNode;
  selectedKeys?: string[]; onSelectionChange?: (k: string[]) => void;
  page?: number; pageCount?: number; onPageChange?: (p: number) => void; footerText?: ReactNode; emptyMessage?: string;
}) {
  return (
    <div className="flex w-full flex-col px-5 pb-8">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
        </div>
        {summary && <div className="mb-5 flex shrink-0 items-center gap-2">{summary}</div>}
      </div>
      <FilterBar
        query={query} onQueryChange={onQueryChange} chips={chips} activeChip={activeChip} onChipChange={onChipChange}
        right={<>
          <Segmented ariaLabel="Vista" value={view} onChange={onViewChange}
            options={[{ value: "list", label: "Lista", icon: "view_list" }, { value: "cards", label: "Tarjetas", icon: "grid_view" }]} />
          {headerActions}
        </>}
      />
      {view === "list" || !renderCard ? (
        <DataTable columns={columns} rows={rows} rowKey={rowKey} onRowClick={onRowClick} selectable selectedKeys={selectedKeys} onSelectionChange={onSelectionChange} emptyMessage={emptyMessage} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((r) => <div key={rowKey(r)}>{renderCard(r)}</div>)}</div>
      )}
      <div className="mt-2 flex items-center justify-between rounded-lg bg-lex-surface-low px-4 py-2 text-lex-caption text-lex-secondary">
        <span>{footerText}</span>
        {page && pageCount && onPageChange && <Pagination page={page} pageCount={pageCount} onChange={onPageChange} />}
      </div>
    </div>
  );
}