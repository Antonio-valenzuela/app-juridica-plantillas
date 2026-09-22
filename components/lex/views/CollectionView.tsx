"use client";
import type { ReactNode } from "react";
import { PageHeader } from "../PageHeader";
import { Icon } from "../Icon";
import { Badge } from "../ui";

export type LexCollectionItem = {
  id: string; title: string; subtitle?: string; icon?: string; meta?: string;
  badge?: { label: string; tone?: "neutral" | "primary" | "success" | "caution" | "error" };
};

/** Recientes y Favoritos: lista simple de elementos abribles. */
export function CollectionView({
  title, subtitle, items, onOpen, renderActions, emptyIcon = "history", emptyMessage = "Aún no hay elementos.", headerActions,
}: {
  title: string; subtitle?: string; items: LexCollectionItem[]; onOpen: (i: LexCollectionItem) => void;
  renderActions?: (i: LexCollectionItem) => ReactNode; emptyIcon?: string; emptyMessage?: string; headerActions?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col px-5 pb-8">
      <PageHeader title={title} subtitle={subtitle} actions={headerActions} />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-lex-secondary">
          <Icon name={emptyIcon} size={32} /><p className="text-lex-body">{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-lex-surface-lowest shadow-lex-l2">
          {items.map((it, i) => (
            <div key={it.id} onClick={() => onOpen(it)}
              className={`group flex min-h-[52px] cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-lex-container ${i > 0 ? "border-t border-black/[0.06]" : ""}`}>
              <Icon name={it.icon ?? "description"} size={20} className="text-lex-secondary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-lex-body-strong text-lex-on-surface group-hover:text-lex-primary">{it.title}</div>
                {it.subtitle && <div className="truncate text-lex-caption text-lex-secondary">{it.subtitle}</div>}
              </div>
              {it.badge && <Badge tone={it.badge.tone}>{it.badge.label}</Badge>}
              {it.meta && <span className="lex-tabular text-lex-caption text-lex-secondary">{it.meta}</span>}
              <div onClick={(e) => e.stopPropagation()}>{renderActions?.(it)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}