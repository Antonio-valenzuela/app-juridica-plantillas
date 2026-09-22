"use client";

import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { Badge, Kbd, Segmented } from "./ui";
import { PageHeader } from "./PageHeader";

/** Forma mínima que necesita la vista. Mapea tu tipo real de plantilla a esto en la página. */
export type LexTemplateItem = {
  id: string;
  title: string;
  category?: string;      // etiqueta de materia, si existe en tus datos
  description?: string;
  badge?: { label: string; tone?: "neutral" | "primary" | "success" | "caution" | "error"; icon?: string };
  meta?: string;          // línea secundaria (ej. fecha, uso), si existe
};

export type LexCategory = { id: string; label: string; count?: number };

type Props = {
  title?: string;
  subtitle?: string;
  eyebrow?: ReactNode;
  headerActions?: ReactNode;          // ej. <Button>Importar…</Button> <Button variant="primary">Nueva plantilla</Button>

  templates: LexTemplateItem[];       // YA filtradas por tu lógica actual
  onOpen: (t: LexTemplateItem) => void;
  renderCardFooter?: (t: LexTemplateItem) => ReactNode; // acciones propias (favorito, usar, etc.)

  query: string;
  onQueryChange: (q: string) => void;
  searchPlaceholder?: string;

  categories?: LexCategory[];
  activeCategory?: string;
  onCategoryChange?: (id: string) => void;

  view: "list" | "grid";
  onViewChange: (v: "list" | "grid") => void;

  emptyMessage?: string;
};

export function TemplatesCatalog({
  title = "Plantillas",
  subtitle,
  eyebrow,
  headerActions,
  templates,
  onOpen,
  renderCardFooter,
  query,
  onQueryChange,
  searchPlaceholder = "Buscar plantilla…",
  categories,
  activeCategory,
  onCategoryChange,
  view,
  onViewChange,
  emptyMessage = "No hay plantillas que coincidan con la búsqueda.",
}: Props) {
  return (
    <div className="flex w-full flex-col px-5 pb-8">
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} actions={headerActions} />

      {/* Toolbar estilo Finder */}
      <div className="mb-5 flex flex-col gap-2 rounded-xl bg-lex-surface-lowest p-2 shadow-lex-l2">
        <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-center">
          <label className="flex h-9 w-full max-w-xl items-center rounded-lg bg-lex-surface-low px-3 text-lex-on-variant transition-all focus-within:bg-lex-surface-lowest focus-within:shadow-lex-focus">
            <Icon name="search" size={18} className="mr-2 text-lex-secondary" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full border-none bg-transparent text-lex-body text-lex-on-surface outline-none placeholder:text-lex-secondary"
            />
            <Kbd>⌘F</Kbd>
          </label>
          <Segmented
            ariaLabel="Vista"
            value={view}
            onChange={onViewChange}
            options={[
              { value: "list", icon: "view_list", title: "Vista de lista" },
              { value: "grid", icon: "grid_view", title: "Vista de mosaico" },
            ]}
          />
        </div>

        {categories && categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 lex-scroll">
            {categories.map((c) => {
              const active = c.id === activeCategory;
              return (
                <button
                  key={c.id}
                  onClick={() => onCategoryChange?.(c.id)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-lex-caption transition-colors ${
                    active
                      ? "bg-lex-primary-container font-medium text-lex-on-primary shadow-sm"
                      : "text-lex-secondary hover:bg-lex-surface-low hover:text-lex-on-surface"
                  }`}
                >
                  {c.label}
                  {typeof c.count === "number" && <span className="lex-tabular"> ({c.count})</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {templates.length === 0 ? (
        <p className="py-16 text-center text-lex-body text-lex-secondary">{emptyMessage}</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <article
              key={t.id}
              onClick={() => onOpen(t)}
              className="group flex cursor-pointer flex-col justify-between rounded-xl bg-lex-surface-lowest p-3 shadow-lex-l2 transition-shadow hover:shadow-md"
            >
              <div>
                <div className="mb-3 flex items-start justify-between gap-2">
                  {t.category ? (
                    <span className="flex items-center gap-1.5 rounded bg-lex-surface-low px-2 py-1 text-[11px] font-medium text-lex-on-variant">
                      <span className="h-1.5 w-1.5 rounded-full bg-lex-primary" />
                      {t.category}
                    </span>
                  ) : <span />}
                  {t.badge && <Badge tone={t.badge.tone} icon={t.badge.icon}>{t.badge.label}</Badge>}
                </div>
                <h3 className="text-lex-heading leading-snug text-lex-on-surface transition-colors group-hover:text-lex-primary">{t.title}</h3>
                {t.description && <p className="mt-1 line-clamp-3 text-lex-meta text-lex-secondary">{t.description}</p>}
              </div>
              {(t.meta || renderCardFooter) && (
                <div className="mt-3 flex items-center justify-between border-t border-black/[0.06] pt-2" onClick={(e) => e.stopPropagation()}>
                  <span className="text-lex-caption text-lex-secondary">{t.meta}</span>
                  {renderCardFooter?.(t)}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-lex-surface-lowest shadow-lex-l2">
          {templates.map((t, i) => (
            <div
              key={t.id}
              onClick={() => onOpen(t)}
              className={`group flex min-h-[44px] cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-lex-container ${
                i > 0 ? "border-t border-black/[0.06]" : ""
              }`}
            >
              <Icon name="description" size={18} className="text-lex-secondary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-lex-body-strong text-lex-on-surface group-hover:text-lex-primary">{t.title}</div>
                {t.description && <div className="truncate text-lex-caption text-lex-secondary">{t.description}</div>}
              </div>
              {t.category && <span className="hidden rounded bg-lex-container-high px-2 py-0.5 text-[11px] text-lex-secondary md:inline">{t.category}</span>}
              {t.badge && <Badge tone={t.badge.tone} icon={t.badge.icon}>{t.badge.label}</Badge>}
              {t.meta && <span className="lex-tabular hidden text-lex-caption text-lex-secondary lg:inline">{t.meta}</span>}
              <div onClick={(e) => e.stopPropagation()}>{renderCardFooter?.(t)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}