'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type NavItem = {
  href: string;
  label: string;
  icon?: string;
};

const MAIN_NAV_ITEMS: NavItem[] = [
  { href: '/machotes', label: 'Workspace de Machotes', icon: '📝' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  return (
    <>
      <header className="global-header">
        <Link href="/" className="logo" onClick={() => setMenuOpen(false)}>
          <div className="logo-icon" />
          Plantillas & Machotes
        </Link>
        <button
          className={`hamburger-btn ${menuOpen ? 'is-active' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
          aria-expanded={menuOpen}
          aria-controls="global-drawer"
        >
          <span />
          <span />
          <span />
        </button>
      </header>

      {/* Backdrop */}
      {menuOpen && (
        <div
          className="drawer-backdrop jr-glass-strong"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Side Drawer */}
      <aside
        id="global-drawer"
        className={`global-drawer jr-glass-strong ${menuOpen ? 'is-open' : ''}`}
        aria-hidden={!menuOpen}
      >
        <nav className="drawer-nav">
          <div className="drawer-section">
            <span className="drawer-section-title">Módulo de Machotes</span>
            {MAIN_NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`drawer-link ${isActive ? 'is-active' : ''}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>

      <div className="appshell-content">
        {children}
      </div>
    </>
  );
}
