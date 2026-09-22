'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LexLogo } from './LexLogo';

export type SidebarState = 'expanded' | 'compact' | 'hidden';

interface LexSidebarProps {
  state: SidebarState;
  onToggleState?: () => void;
  onCloseMobile?: () => void;
  isMobileOpen?: boolean;
}

interface NavItem {
  id: string;
  tab: string;
  label: string;
  icon: string;
}

const MODULOS_PROCESALES: NavItem[] = [
  { id: 'universal', tab: 'universal', label: 'Motor Universal', icon: 'psychology' },
  { id: 'initial_writings', tab: 'initial_writings', label: 'Escritos Iniciales', icon: 'post_add' },
  { id: 'contestaciones', tab: 'responses_resources', label: 'Contestaciones', icon: 'shield' },
  { id: 'plantillas', tab: 'plantillas', label: 'Mis Plantillas', icon: 'library_books' },
];

const HERRAMIENTAS_JUDICIALES: NavItem[] = [
  { id: 'investigacion', tab: 'investigacion', label: 'Jurisprudencia SCJN', icon: 'gavel' },
  { id: 'expedientes', tab: 'expedientes', label: 'Expedientes', icon: 'folder_open' },
  { id: 'terminos', tab: 'inicio', label: 'Cómputo de Términos', icon: 'calendar_clock' },
  { id: 'dof', tab: 'inicio', label: 'Alertas DOF y Boletín', icon: 'newspaper' },
];

export function LexSidebar({
  state,
  onCloseMobile,
  isMobileOpen = false,
}: LexSidebarProps) {
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab') || 'inicio';

  const isCompact = state === 'compact';
  const widthClass = isCompact ? 'w-16' : 'w-64';

  const isItemActive = (tab: string, id: string) => {
    if (tab === 'universal' && currentTab === 'universal') return true;
    if (tab === 'initial_writings' && currentTab === 'initial_writings') return true;
    if (tab === 'contestaciones' && (currentTab === 'contestaciones' || currentTab === 'responses_resources')) return true;
    if (tab === 'responses_resources' && (currentTab === 'contestaciones' || currentTab === 'responses_resources')) return true;
    if (tab === 'plantillas' && (currentTab === 'plantillas' || currentTab === 'my-templates')) return true;
    if (tab === 'investigacion' && currentTab === 'investigacion') return true;
    if (tab === 'expedientes' && currentTab === 'expedientes') return true;
    if (tab === 'inicio' && currentTab === 'inicio' && id === 'inicio') return true;
    return false;
  };

  const renderNavLinks = (items: NavItem[]) => (
    <div className="space-y-space-xxs">
      {items.map((item) => {
        const active = isItemActive(item.tab, item.id);
        return (
          <Link
            key={item.id}
            href={`/machotes?tab=${item.tab}`}
            onClick={onCloseMobile}
            title={item.label}
            className={`flex items-center gap-space-sm px-space-md py-space-sm rounded-lg transition-colors font-label-lg text-label-lg ${
              active
                ? 'bg-primary-container text-on-primary font-semibold shadow-xs'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            } ${isCompact ? 'justify-center px-1' : ''}`}
          >
            <span
              className={`material-symbols-outlined text-[18px] shrink-0 ${
                active ? 'text-on-primary' : 'text-on-surface-variant'
              }`}
              style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
            >
              {item.icon}
            </span>
            {!isCompact && (
              <span className="truncate">{item.label}</span>
            )}
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Main Stitch Sidebar */}
      <aside
        className={`lex-reference-sidebar fixed left-0 top-0 h-full bg-surface-container-low z-50 flex flex-col shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-r border-outline-variant/60 transition-all duration-200 ${widthClass} ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${state === 'hidden' ? 'lg:-translate-x-full' : ''}`}
      >
        {/* Header: Logo & Title */}
        <div className="h-16 px-gutter flex items-center justify-between bg-surface-container-low border-b border-surface-container-high/60">
          <Link
            href="/machotes?tab=universal"
            className="flex items-center gap-space-xs overflow-hidden"
            onClick={onCloseMobile}
          >
            <LexLogo showWordmark={!isCompact} size={isCompact ? 'sm' : 'md'} />
          </Link>
        </div>

        {/* Actuario Virtual Card */}
        {!isCompact && (
          <div className="px-gutter py-space-sm bg-surface-container-lowest mx-space-sm rounded-lg shadow-[0_1px_3px_rgba(120,0,30,0.04)] my-space-sm border border-outline-variant/40">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
                Actuario Virtual
              </span>
              <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse"></span>
            </div>
            <p className="font-code-sm text-code-sm text-on-surface mt-space-xxs truncate font-medium">
              CJF Portal Notificaciones: OK
            </p>
          </div>
        )}

        {/* Scrollable Navigation Area */}
        <div className="flex-1 overflow-y-auto px-space-sm py-space-xs space-y-space-md">
          {/* Módulos Procesales */}
          <div>
            {!isCompact && (
              <div className="px-space-md mb-space-xs">
                <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider px-space-sm block">
                  Módulos Procesales
                </span>
              </div>
            )}
            {renderNavLinks(MODULOS_PROCESALES)}
          </div>

          {/* Herramientas Judiciales */}
          <div className="lex-secondary-tools">
            {!isCompact && (
              <div className="px-space-md mb-space-xs pt-space-xs">
                <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider px-space-sm block">
                  Herramientas Judiciales
                </span>
              </div>
            )}
            {renderNavLinks(HERRAMIENTAS_JUDICIALES)}
          </div>
        </div>

        {/* Bottom Card: FIREL */}
        <div className="p-space-sm border-t border-surface-container-high/60">
          {!isCompact ? (
            <div className="p-space-md bg-surface-container-high rounded-lg border border-outline-variant/40">
              <div className="flex items-center justify-between mb-space-xs">
                <span className="font-label-sm text-label-sm text-on-surface font-semibold">
                  Firma Electrónica
                </span>
                <span className="font-code-sm text-code-sm text-tertiary font-bold bg-tertiary-fixed px-space-xs py-0.5 rounded">
                  FIREL
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Certificado vigente hasta Noviembre 2026
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center p-2 rounded-lg bg-surface-container-high text-tertiary" title="FIREL Certificado Activo">
              <span className="material-symbols-outlined text-[18px]">verified</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export default LexSidebar;
