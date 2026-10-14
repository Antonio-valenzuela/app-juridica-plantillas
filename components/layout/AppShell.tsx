'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLegalWorkspaceContext } from '@/context/LegalWorkspaceContext';
import { deriveProviderIndicator, type ProviderIndicator } from '@/lib/runtime/providerStatus';
import { LexIcon, type LexIconName } from './LexIcon';

type SidebarItem = {
  href?: string;
  label: string;
  icon: LexIconName;
  tab?: string;
  disabled?: boolean;
};

const MAIN_ITEMS: SidebarItem[] = [
  { href: '/machotes?tab=inicio', label: 'Inicio', icon: 'home', tab: 'inicio' },
  { href: '/machotes?tab=universal', label: 'Motor Jurídico', icon: 'scale', tab: 'universal' },
  { href: '/machotes?tab=initial_writings', label: 'Escritos Iniciales', icon: 'document', tab: 'initial_writings' },
  { href: '/machotes?tab=responses_resources', label: 'Contestaciones', icon: 'scale', tab: 'responses_resources' },
  { href: '/machotes?tab=my-templates', label: 'Mis Plantillas', icon: 'library', tab: 'my-templates' },
  { href: '/machotes?tab=expedientes', label: 'Expedientes', icon: 'folder', tab: 'expedientes' },
  { href: '/machotes?tab=terminos', label: 'Cómputo de Términos', icon: 'calendar', tab: 'terminos' },
  { href: '/machotes?tab=jurisprudencia', label: 'Jurisprudencia SCJN', icon: 'book', tab: 'jurisprudencia' },
  { href: '/machotes?tab=biblioteca', label: 'Biblioteca', icon: 'library', tab: 'biblioteca' },
  { href: '/machotes?tab=alertas', label: 'Alertas DOF y Boletín', icon: 'bell', tab: 'alertas' },
];

const BOTTOM_ITEMS: SidebarItem[] = [
  { href: '/machotes?tab=configuracion', label: 'Configuración', icon: 'settings', tab: 'configuracion' },
  { href: '/machotes?tab=ayuda', label: 'Ayuda', icon: 'help', tab: 'ayuda' },
];

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { activeCase } = useLegalWorkspaceContext();

  const [menuOpen, setMenuOpen] = useState(false);
  // Escritorio: el menú lateral se puede ocultar para dar más espacio al área de trabajo (preferencia persistente).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [providerIndicator, setProviderIndicator] = useState<ProviderIndicator>(() => deriveProviderIndicator(null));

  const currentTab = searchParams.get('tab') || 'universal';

  useEffect(() => {
    try { setSidebarCollapsed(window.localStorage.getItem('lex.sidebar.collapsed') === '1'); } catch { /* sin almacenamiento */ }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.sidebar = sidebarCollapsed ? 'collapsed' : 'expanded';
    try { window.localStorage.setItem('lex.sidebar.collapsed', sidebarCollapsed ? '1' : '0'); } catch { /* sin almacenamiento */ }
  }, [sidebarCollapsed]);

  // En pantallas angostas el menú es un panel superpuesto; en escritorio se colapsa para ampliar el espacio de trabajo.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const query = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 980px)') : undefined;
    if (!query) return;
    const sync = () => setIsNarrow(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);
  const navigationVisible = isNarrow ? menuOpen : !sidebarCollapsed;
  const toggleMenu = () => (isNarrow ? setMenuOpen((value) => !value) : setSidebarCollapsed((value) => !value));

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

  useEffect(() => {
    let disposed = false;

    const checkProviderHealth = async () => {
      try {
        const response = await fetch('/api/health/providers', { cache: 'no-store' });
        const snapshot = await response.json().catch(() => null);
        if (!disposed) setProviderIndicator(deriveProviderIndicator(snapshot));
      } catch {
        if (!disposed) setProviderIndicator(deriveProviderIndicator(null));
      }
    };

    void checkProviderHealth();
    const intervalId = window.setInterval(() => void checkProviderHealth(), 30_000);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const isActive = (item: SidebarItem) => {
    if (item.tab) {
      return (pathname === '/machotes' || pathname === '/') && currentTab === item.tab;
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
          <span className="lex-sidebar-icon"><LexIcon name={item.icon} size={17} /></span>
          <span>{item.label}</span>
        </div>
      );
    }

    return (
      <Link
        key={item.label}
        href={item.href}
        className={`lex-sidebar-item ${active ? 'is-active' : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => setMenuOpen(false)}
      >
        <span className="lex-sidebar-icon"><LexIcon name={item.icon} size={17} /></span>
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      <header className="global-header lex-header">
        <button
          type="button"
          className="lex-menu-toggle"
          aria-label={navigationVisible ? 'Ocultar menú de navegación' : 'Mostrar menú de navegación'}
          aria-controls="lex-sidebar"
          aria-expanded={navigationVisible}
          title={navigationVisible ? 'Ocultar menú para ampliar el área de trabajo' : 'Mostrar menú'}
          onClick={toggleMenu}
        >
          <LexIcon name="menu" size={19} />
        </button>
        <div className="lex-header-right">
          <div className={`lex-build-status ${providerIndicator.tone === 'danger' ? 'is-error' : providerIndicator.tone === 'warning' ? 'is-warning' : ''}`} title={providerIndicator.detail}>
            <span className="lex-status-dot" />
            <span>{providerIndicator.label}</span>
          </div>

          <div className="lex-header-case">
            <strong>{activeCase?.expedienteNumber ? `EXP-${activeCase.expedienteNumber}` : 'Sin expediente seleccionado'}</strong>
            <span>{activeCase?.court || 'Sin órgano jurisdiccional'}</span>
          </div>

          <Link
            className="lex-notification"
            href="/machotes?tab=alertas"
            aria-label="Abrir alertas DOF y Boletín"
          >
            <LexIcon name="bell" size={19} />
          </Link>

          <div className="lex-user">
            <div className="lex-user-avatar">YN</div>

            <div className="lex-user-copy">
              <strong>Yahir</strong>
              <span>Abogado</span>
            </div>

            <span className="lex-user-chevron"><LexIcon name="chevron-down" size={15} /></span>
          </div>

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

      <aside id="lex-sidebar" className={`lex-sidebar ${menuOpen ? 'is-mobile-open' : ''}`}>
        <div className="lex-brand">
          <div className="lex-brand-mark">
            <LexIcon name="plus" size={20} />
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
              <LexIcon name="check" size={15} />
            </div>

            <div>
              <strong>Firma Electrónica</strong>
                <span>
                  <i />
                  Estado no disponible
                </span>
                <small>Configura el certificado en el despacho</small>
            </div>
          </div>
        </div>
      </aside>

      <div className="appshell-content lex-content" data-active-tab={currentTab}>
        {children}
      </div>
    </>
  );
}
