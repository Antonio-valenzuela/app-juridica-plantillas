'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useLegalWorkspaceContext } from '@/context/LegalWorkspaceContext';
import { LexLogo } from './LexLogo';

interface LexTopbarProps {
  sidebarState: 'expanded' | 'compact' | 'hidden';
  onToggleSidebar: () => void;
  onOpenSearch?: () => void;
}

export function LexTopbar({
  sidebarState,
  onToggleSidebar,
  onOpenSearch,
}: LexTopbarProps) {
  const { activeCase } = useLegalWorkspaceContext();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Ctrl/⌘K enfoca el buscador (convención ya usada en la app).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // El buscador delega en el asistente legal existente (contrato 'open-legal-chat').
  const submitSearch = () => {
    const q = query.trim();
    if (!q) return;
    if (onOpenSearch) {
      onOpenSearch();
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent('open-legal-chat', { detail: { query: q } }));
    } catch {
      /* sin asistente disponible: no-op */
    }
  };

  const leftOffsetClass =
    sidebarState === 'expanded'
      ? 'lg:left-[250px]'
      : sidebarState === 'compact'
      ? 'lg:left-[68px]'
      : 'left-0';

  return (
    <header
      className={`fixed top-0 right-0 left-0 h-16 bg-white border-b border-slate-200 z-40 flex items-center gap-4 px-4 sm:px-5 transition-[left] duration-200 ease-out ${leftOffsetClass}`}
    >
      {/* Izquierda: hamburguesa (móvil) + logo */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors lg:hidden"
          aria-label="Abrir menú de navegación"
        >
          <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
            menu
          </span>
        </button>
        <LexLogo size="sm" />
      </div>

      {/* Centro: buscador */}
      <form
        className="flex-1 min-w-0 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          submitSearch();
        }}
        role="search"
      >
        <label className="flex items-center gap-2 h-10 px-3 rounded-lg bg-slate-100 border border-slate-200 focus-within:bg-white focus-within:border-[#007aff] focus-within:ring-2 focus-within:ring-[#007aff]/15 transition-colors">
          <span className="material-symbols-outlined text-[18px] text-slate-400 shrink-0" aria-hidden="true">
            search
          </span>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar expedientes, documentos, plantillas..."
            aria-label="Buscar en el asistente legal"
            className="w-full min-w-0 bg-transparent outline-none text-[13px] text-slate-900 placeholder:text-slate-400"
          />
          <kbd className="hidden sm:inline-block shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 font-mono">
            Ctrl K
          </kbd>
        </label>
      </form>

      {/* Derecha: estado real existente */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
        <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 whitespace-nowrap">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          NVIDIA Build Activo
        </span>
        <span className="hidden xl:block text-right leading-tight">
          <span className="block text-[12px] font-semibold text-slate-900 font-mono truncate max-w-[180px]">
            {activeCase?.expedienteNumber ? `EXP-${activeCase.expedienteNumber}` : 'EXP-800/2026'}
          </span>
          <span className="block text-[11px] text-slate-500 truncate max-w-[180px]">
            {activeCase?.court || 'Juzgado 3° Civil CDMX'}
          </span>
        </span>
        <span
          className="w-8 h-8 rounded-full bg-[#0B2545] text-white flex items-center justify-center shrink-0"
          title="Perfil Litigante"
          aria-label="Perfil Litigante"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            person
          </span>
        </span>
      </div>
    </header>
  );
}

export default LexTopbar;
