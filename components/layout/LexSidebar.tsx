'use client';

import React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

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

/* Solo destinos reales del workspace (modos válidos de app/machotes/page.tsx).
   No se agregan módulos inexistentes. */
const NAV_ITEMS: NavItem[] = [
  { id: 'universal', tab: 'universal', label: 'Motor Jurídico', icon: 'psychology' },
  { id: 'initial_writings', tab: 'initial_writings', label: 'Escritos Iniciales', icon: 'post_add' },
  { id: 'contestaciones', tab: 'responses_resources', label: 'Contestaciones', icon: 'shield' },
  { id: 'plantillas', tab: 'my-templates', label: 'Mis Plantillas', icon: 'library_books' },
];

const VALID_TABS = ['universal', 'initial_writings', 'responses_resources', 'my-templates'];

export function LexSidebar({
  state,
  onCloseMobile,
  isMobileOpen = false,
}: LexSidebarProps) {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab') || 'universal';
  const currentTab = VALID_TABS.includes(rawTab) ? rawTab : 'universal';

  const isCompact = state === 'compact';
  const widthClass = isCompact ? 'w-[68px]' : 'w-[250px]';

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar navy — única navegación lateral de la app */}
      <aside
        className={`fixed left-0 top-16 bottom-0 bg-[#0B2545] z-40 flex flex-col transition-[transform,width] duration-200 ease-out ${widthClass} ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } ${state === 'hidden' ? 'lg:-translate-x-full' : ''}`}
        aria-label="Navegación principal"
      >
        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Módulos">
          {NAV_ITEMS.map((item) => {
            const active = currentTab === item.tab;
            return (
              <Link
                key={item.id}
                href={`/machotes?tab=${item.tab}`}
                onClick={onCloseMobile}
                title={isCompact ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors ${
                  isCompact ? 'justify-center px-0' : ''
                } ${
                  active
                    ? 'bg-[#1B3A5C] text-white font-semibold'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white font-medium'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[20px] shrink-0"
                  style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                {!isCompact && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Tarjeta Firma Electrónica (texto informativo existente) */}
        {!isCompact && (
          <div className="p-3">
            <div className="rounded-xl bg-white/5 border border-white/10 p-3.5">
              <div className="flex items-center justify-between">
                <span className="material-symbols-outlined text-[18px] text-slate-300" aria-hidden="true">
                  verified
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              </div>
              <p className="mt-2 text-[12px] font-semibold text-white">Firma Electrónica</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                Certificado vigente hasta Noviembre 2026
              </p>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

export default LexSidebar;
