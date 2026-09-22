'use client';

import React from 'react';
import Link from 'next/link';
import { useLegalWorkspaceContext } from '@/context/LegalWorkspaceContext';
import { useSearchParams } from 'next/navigation';

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
  const { activeCase, activeDocument } = useLegalWorkspaceContext();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab') || 'inicio';

  const leftOffsetClass =
    sidebarState === 'expanded'
      ? 'lg:left-64'
      : sidebarState === 'compact'
      ? 'lg:left-16'
      : 'left-0';

  const isNavActive = (tab: string) => {
    if (tab === 'universal' && currentTab === 'universal') return true;
    if (tab === 'initial_writings' && currentTab === 'initial_writings') return true;
    if (tab === 'contestaciones' && (currentTab === 'contestaciones' || currentTab === 'responses_resources')) return true;
    if (tab === 'plantillas' && (currentTab === 'plantillas' || currentTab === 'my-templates')) return true;
    return false;
  };

  return (
    <>
      {/* ── Main Topbar Header (Fixed top, 64px) ── */}
      <header
        className={`lex-reference-topbar fixed top-0 left-0 right-0 h-16 bg-surface/90 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-outline-variant/50 z-40 flex items-center justify-between px-gutter transition-all duration-200 ${leftOffsetClass}`}
      >
        {/* Left: Hamburger & Brand Tags */}
        <div className="flex items-center gap-space-sm sm:gap-space-md">
          <button
            onClick={onToggleSidebar}
            className="p-space-xs rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors lg:hidden"
            aria-label="Alternar barra lateral"
            title="Alternar barra lateral"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>

          <span className="font-headline-sm text-headline-sm text-primary tracking-tight font-bold hidden sm:inline-block">
            LexPlantillas
          </span>

          <span className="lex-release-badge bg-emerald-100 text-emerald-800 px-space-xs py-space-xxs rounded font-code-sm text-code-sm font-semibold">
            v1.0 RC1 Producción
          </span>

          <span className="hidden md:flex bg-tertiary-fixed text-on-tertiary-fixed px-space-xs py-space-xxs rounded font-code-sm text-code-sm items-center gap-space-xxs font-semibold">
            <span className="material-symbols-outlined text-[14px]">verified</span>
            FIREL Cotejada
          </span>
        </div>

        {/* Center: Primary Module Navigation Tabs */}
        <nav className="hidden xl:flex items-center gap-space-xs">
          <Link
            href="/machotes?tab=universal"
            className={`px-space-md py-space-xs font-label-md text-label-md rounded-lg transition-colors ${
              isNavActive('universal')
                ? 'bg-primary-container text-on-primary font-semibold'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            Motor Universal
          </Link>
          <Link
            href="/machotes?tab=initial_writings"
            className={`px-space-md py-space-xs font-label-md text-label-md rounded-lg transition-colors ${
              isNavActive('initial_writings')
                ? 'bg-primary-container text-on-primary font-semibold'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            Escritos Iniciales
          </Link>
          <Link
            href="/machotes?tab=responses_resources"
            className={`px-space-md py-space-xs font-label-md text-label-md rounded-lg transition-colors ${
              isNavActive('contestaciones')
                ? 'bg-primary-container text-on-primary font-semibold'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            Contestaciones
          </Link>
          <Link
            href="/machotes?tab=plantillas"
            className={`px-space-md py-space-xs font-label-md text-label-md rounded-lg transition-colors ${
              isNavActive('plantillas')
                ? 'bg-primary-container text-on-primary font-semibold'
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
            }`}
          >
            Mis Plantillas
          </Link>
        </nav>

        {/* Secondary actions stay available without crowding the primary tabs. */}
        <details className="lex-secondary-menu hidden lg:block relative">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-outline-variant/50 bg-surface-container-lowest px-2 py-1 text-[11px] font-semibold text-on-surface-variant">
            <span className="material-symbols-outlined text-[15px]">menu</span>
            <span>Más</span>
          </summary>
          <div className="absolute right-0 top-8 z-[70] min-w-[190px] rounded-md border border-outline-variant/60 bg-white p-1.5 shadow-lg">
            <Link href="/machotes?tab=investigacion" className="block rounded px-2.5 py-2 text-xs text-on-surface hover:bg-surface-container-low">Jurisprudencia SCJN</Link>
            <Link href="/machotes?tab=expedientes" className="block rounded px-2.5 py-2 text-xs text-on-surface hover:bg-surface-container-low">Expedientes</Link>
            <Link href="/machotes?tab=inicio" className="block rounded px-2.5 py-2 text-xs text-on-surface hover:bg-surface-container-low">Cómputo de términos</Link>
            <Link href="/machotes?tab=inicio" className="block rounded px-2.5 py-2 text-xs text-on-surface hover:bg-surface-container-low">Alertas DOF y Boletín</Link>
          </div>
        </details>

        {/* Right: Engine Telemetry & Active Case & User */}
        <div className="flex items-center gap-space-sm sm:gap-space-md">
          {/* Engine indicator */}
          <div className="lex-engine-badge hidden md:flex items-center gap-space-xs px-space-sm py-space-xxs bg-surface-container rounded-lg border border-outline-variant/40">
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse"></span>
            <span className="font-code-sm text-code-sm text-on-surface font-semibold">NVIDIA Build Activo</span>
          </div>

          {/* Active Case chip */}
          <div className="lex-active-case-chip hidden 2xl:flex items-center gap-space-xs px-space-sm py-space-xxs bg-surface-container-low rounded-lg border border-outline-variant/50">
            <span className="material-symbols-outlined text-[16px] text-primary">folder_open</span>
            <span className="font-code-sm text-code-sm text-on-surface font-medium truncate max-w-[220px]">
              {activeCase?.expedienteNumber ? `EXP-${activeCase.expedienteNumber}` : 'EXP-800/2026 - Juzgado 3° Civil CDMX'}
            </span>
          </div>

          {/* Search Trigger */}
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-space-xs px-space-sm py-space-xxs bg-surface-container-highest hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface rounded-lg transition-colors"
            title="Buscar (⌘K)"
          >
            <span className="material-symbols-outlined text-[16px]">search</span>
            <kbd className="font-code-sm text-code-sm bg-surface-container-lowest px-space-xxs rounded text-on-surface font-mono">
              ⌘K
            </kbd>
          </button>

          {/* User profile avatar in Imperial Burgundy */}
          <div
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center cursor-pointer shadow-xs"
            title="Perfil Litigante"
          >
            <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
          </div>
        </div>
      </header>

      {/* ── Secondary Sub-Header Status Strip (Fixed top-16, 40px) ── */}
      <div
        className={`lex-reference-subbar fixed top-16 left-0 right-0 h-10 bg-surface-container-low/95 backdrop-blur-sm z-30 flex items-center justify-between px-gutter shadow-[0_1px_3px_rgba(120,0,30,0.02)] border-b border-outline-variant/40 transition-all duration-200 ${leftOffsetClass}`}
      >
        <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant truncate">
          <Link href="/machotes?tab=universal" className="hover:text-primary cursor-pointer transition-colors">
            LexPlantillas
          </Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="hover:text-primary cursor-pointer transition-colors">Litigio Federal</span>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-on-surface font-semibold">
            {activeDocument?.templateName || 'Redacción Jurídica Activa'}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-space-sm shrink-0">
          <span className="bg-surface-container-highest text-on-surface-variant px-space-sm py-space-xxs rounded-full font-code-sm text-code-sm uppercase tracking-wide">
            {activeCase?.matter ? `Materia ${activeCase.matter}` : 'Materia Civil Federal / Ordinario Mercantil'}
          </span>
          <span className="font-code-sm text-code-sm text-secondary font-semibold">
            Término: 3 Días Hábiles
          </span>
        </div>
      </div>
    </>
  );
}

export default LexTopbar;
