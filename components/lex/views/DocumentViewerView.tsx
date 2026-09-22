"use client";
import type { ReactNode } from "react";
import { DocumentWorkspace, type WorkspaceApi } from "../DocumentWorkspace";
import { Tabs } from "../Panels";

/**
 * Visor de documento / expediente. `children` = tu visor REAL (PDF.js canvas, editor, etc.).
 * Cubre "Contestación – visor paginado" y "Expediente – visor".
 */
export function DocumentViewerView<Tab extends string = string>({
  eyebrow, title, subtitle, badges, headerActions,
  tabs, activeTab, onTabChange,
  toolbar, toc, tocTitle, inspector, inspectorTitle, children,
}: {
  eyebrow?: ReactNode; title: string; subtitle?: string; badges?: ReactNode; headerActions?: ReactNode;
  tabs?: { value: Tab; label: string; icon?: string }[]; activeTab?: Tab; onTabChange?: (t: Tab) => void;
  toolbar?: (api: WorkspaceApi) => ReactNode; toc?: ReactNode; tocTitle?: string; inspector?: ReactNode; inspectorTitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col px-5 pb-4">
      <div className="flex items-start justify-between gap-4 pb-3 pt-3">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-lex-caption text-lex-secondary">{eyebrow}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lex-section text-lex-on-surface">{title}</h1>
            {badges}
          </div>
          {subtitle && <p className="mt-0.5 truncate text-lex-meta text-lex-secondary">{subtitle}</p>}
        </div>
        {headerActions && <div className="flex shrink-0 items-center gap-2">{headerActions}</div>}
      </div>
      {tabs && activeTab && onTabChange && <div className="pb-3"><Tabs value={activeTab} onChange={onTabChange} tabs={tabs} /></div>}
      <div className="min-h-0 flex-1">
        <DocumentWorkspace toolbar={toolbar} toc={toc} tocTitle={tocTitle} inspector={inspector} inspectorTitle={inspectorTitle}>
          {children}
        </DocumentWorkspace>
      </div>
    </div>
  );
}