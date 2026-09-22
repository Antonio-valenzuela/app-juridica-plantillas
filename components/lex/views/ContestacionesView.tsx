"use client";

import type { ReactNode } from "react";
import { PageHeader } from "../PageHeader";
import { FilterBar } from "../FilterBar";
import { DataTable, Pagination, type LexColumn } from "../DataTable";

/** Pantalla "Contestaciones y recursos": stats arriba, tabla + rail lateral opcional. */
export function ContestacionesView<T>({
  title = "Contestaciones y recursos", subtitle, headerActions, stats,
  query, onQueryChange, chips, activeChip, onChipChange, filtersRight,
  columns, rows, rowKey, selectedKey, onRowClick,
  page, pageCount, onPageChange, footerText, sideRail, emptyMessage,
}: {
  title?: string; subtitle?: string; headerActions?: ReactNode; stats?: ReactNode;
  query: string; onQueryChange: (q: string) => void;
  chips?: { id: string; label: string; count?: number }[]; activeChip?: string; onChipChange?: (id: string) => void; filtersRight?: ReactNode;
  columns: LexColumn<T>[]; rows: T[]; rowKey: (r: T) => string; selectedKey?: string; onRowClick?: (r: T) => void;
  page?: number; pageCount?: number; onPageChange?: (p: number) => void; footerText?: ReactNode;
  sideRail?: ReactNode; emptyMessage?: string;
}) {
  return (
    <div className="flex w-full flex-col px-5 pb-8">
      <PageHeader title={title} subtitle={subtitle} actions={headerActions} />
      {stats && <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">{stats}</div>}
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <FilterBar query={query} onQueryChange={onQueryChange} chips={chips} activeChip={activeChip} onChipChange={onChipChange} right={filtersRight} />
          <DataTable columns={columns} rows={rows} rowKey={rowKey} selectedKey={selectedKey} onRowClick={onRowClick} emptyMessage={emptyMessage} />
          {(footerText || (page && pageCount && onPageChange)) && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-lex-surface-low px-4 py-2 text-lex-caption text-lex-secondary">
              <span>{footerText}</span>
              {page && pageCount && onPageChange && <Pagination page={page} pageCount={pageCount} onChange={onPageChange} />}
            </div>
          )}
        </div>
        {sideRail && <aside className="hidden w-[320px] shrink-0 flex-col gap-3 xl:flex">{sideRail}</aside>}
      </div>
    </div>
  );
}