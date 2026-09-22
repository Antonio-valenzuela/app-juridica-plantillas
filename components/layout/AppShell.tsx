'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type SidebarItem = {
  href?: string;
  label: string;
  icon: string;
  tab?: string;
  disabled?: boolean;
};

const MAIN_ITEMS: SidebarItem[] = [
  { href: '/', label: 'Inicio', icon: '⌂' },
  { href: '/machotes?tab=universal', label: 'Motor Jurídico', icon: '▣', tab: 'universal' },
  { href: '/machotes?tab=initial_writings', label: 'Escritos Iniciales', icon: '▤', tab: 'initial_writings' },
  { href: '/machotes?tab=responses_resources', label: 'Contestaciones', icon: '⚖', tab: 'responses_resources' },
  { href: '/machotes?tab=my-templates', label: 'Mis Plantillas', icon: '□', tab: 'my-templates' },
  { href: '/machotes?tab=universal', label: 'Expedientes', icon: '▱' },
  { href: '/machotes?tab=universal', label: 'Cómputo de Términos', icon: '◷' },
  { href: '/machotes?tab=universal', label: 'Jurisprudencia SCJN', icon: '♜' },
  { href: '/machotes?tab=universal', label: 'Biblioteca', icon: '▥' },
  { href: '/machotes?tab=universal', label: 'Alertas DOF y Boletín', icon: '♧' },
];

const BOTTOM_ITEMS: SidebarItem[] = [
  { href: '/machotes?tab=universal', label: 'Configuración', icon: '⚙' },
  { href: '/machotes?tab=universal', label: 'Ayuda', icon: '?' },
];

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [menuOpen, setMenuOpen] = useState(false);

  const currentTab = searchParams.get('tab') || 'universal';

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const isActive = (item: SidebarItem) => {
    if (item.tab) {
      return pathname === '/machotes' && currentTab === item.tab;
    }

    return pathname === item.href;
  };

  const renderItem = (item: SidebarItem) => {
    const active = isActive(item);

    if (!item.href || item.disabled) {
      return (
        <div
          key={item.label}
          className="lex-sidebar-item lex-sidebar-item-disabled"
          title="Módulo disponible próximamente"
        >
          <span className="lex-sidebar-icon">{item.icon}</span>
          <span>{item.label}</span>
        </div>
      );
    }

    return (
      <Link
        key={item.label}
        href={item.href}
        className={`lex-sidebar-item ${active ? 'is-active' : ''}`}
        onClick={() => setMenuOpen(false)}
      >
        <span className="lex-sidebar-icon">{item.icon}</span>
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      <header className="global-header lex-header">
        <div className="lex-header-search">
          <span className="lex-search-icon">⌕</span>

          <input
            type="search"
            placeholder="Buscar expedientes, documentos, plantillas..."
            aria-label="Buscar expedientes, documentos y plantillas"
          />

          <kbd>Ctrl K</kbd>
        </div>

        <div className="lex-header-right">
          <div className="lex-build-status">
            <span className="lex-status-dot" />
            <span>NVIDIA Build Activo</span>
          </div>

          <div className="lex-header-case">
            <strong>EXP-800/2026</strong>
            <span>Juzgado 3º Civil CDMX</span>
          </div>

          <button
            type="button"
            className="lex-notification"
            aria-label="Notificaciones"
          >
            ♧
            <span className="lex-notification-dot" />
          </button>

          <div className="lex-user">
            <div className="lex-user-avatar">YN</div>

            <div className="lex-user-copy">
              <strong>Yahir</strong>
              <span>Abogado</span>
            </div>

            <span className="lex-user-chevron">⌄</span>
          </div>

          <button
            type="button"
            className="lex-mobile-menu"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? '×' : '☰'}
          </button>
        </div>
      </header>

      {menuOpen && (
        <button
          type="button"
          className="lex-sidebar-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside className={`lex-sidebar ${menuOpen ? 'is-mobile-open' : ''}`}>
        <div className="lex-brand">
          <div className="lex-brand-mark">
            <span>✚</span>
          </div>

          <div className="lex-brand-copy">
            <strong>LEXPLANTILLAS</strong>
            <span>SISTEMA JURÍDICO MEXICANO</span>
          </div>
        </div>

        <nav className="lex-sidebar-nav" aria-label="Navegación principal">
          {MAIN_ITEMS.map(renderItem)}
        </nav>

        <div className="lex-sidebar-bottom">
          <div className="lex-sidebar-divider" />

          {BOTTOM_ITEMS.map(renderItem)}

          <div className="lex-signature-card">
            <div className="lex-signature-icon">
              ✓
            </div>

            <div>
              <strong>Firma Electrónica</strong>
              <span>
                <i />
                Certificado vigente
              </span>
              <small>hasta Noviembre 2026</small>
            </div>
          </div>
        </div>
      </aside>

      <div className="appshell-content lex-content">
        {children}
      </div>
    </>
  );
}