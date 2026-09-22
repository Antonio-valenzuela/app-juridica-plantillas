"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Kbd } from "./ui";

export type LexNavItem = { label: string; href: string; icon: string };
export type LexNavGroup = { title?: string; items: LexNavItem[] };

type AppShellProps = {
  /** Nombre junto al logo. */
  appName?: string;
  /** Logo opcional (<img/> o <Image/>). */
  logo?: ReactNode;
  /** Grupos de navegación. Deben venir de las rutas REALES de la app. */
  nav: LexNavGroup[];
  /** Items al pie del sidebar (ej. Configuración). */
  footerNav?: LexNavItem[];
  /** Slot para el indicador de estado (ej. conexión SCJN) — solo si existe en la app real. */
  statusSlot?: (compact: boolean) => ReactNode;
  /** Migas de pan: ["Workspace", "Plantillas"] */
  breadcrumb?: string[];
  /** Si se pasa, aparece el buscador global y ⌘K lo dispara. */
  onSearch?: () => void;
  searchPlaceholder?: string;
  /** Usuario real autenticado (opcional). */
  user?: { name: string; role?: string };
  /** Slot extra a la derecha del app bar (acciones, ayuda, etc.). */
  topbarActions?: ReactNode;
  children: ReactNode;
};

const LS_KEY = "lex.sidebar.collapsed";

export function AppShell({
  appName = "LexPlantillas",
  logo,
  nav,
  footerNav = [],
  statusSlot,
  breadcrumb = [],
  onSearch,
  searchPlaceholder = "Buscar…",
  user,
  topbarActions,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        return localStorage.getItem(LS_KEY) === "1";
      }
    } catch {}
    return false;
  });

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(LS_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);

  // Atajos: ⌘/Ctrl+B colapsa sidebar, ⌘/Ctrl+K abre búsqueda
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); toggle(); }
      if (k === "k" && onSearch) { e.preventDefault(); onSearch(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, onSearch]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  const NavLink = ({ item }: { item: LexNavItem }) => {
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={`flex items-center rounded px-2 py-1.5 font-lex-ui text-lex-body transition-colors ${
          collapsed ? "justify-center" : "gap-2"
        } ${
          active
            ? "bg-lex-container-high font-medium text-lex-primary shadow-sm"
            : "text-lex-on-variant hover:bg-lex-container hover:text-lex-on-surface"
        }`}
      >
        <Icon name={item.icon} size={18} filled={active} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-lex-surface font-lex-ui text-lex-on-surface antialiased">
      {/* ───── Sidebar: 230px expandido / 64px compacto ───── */}
      <aside
        className={`flex shrink-0 flex-col justify-between bg-lex-surface-low shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition-[width] duration-150 ${
          collapsed ? "w-16" : "w-[230px]"
        }`}
      >
        <div className="flex min-h-0 flex-col overflow-y-auto lex-scroll">
          <div className={`flex h-[52px] items-center gap-2 px-3 ${collapsed ? "justify-center" : ""}`}>
            {logo}
            {!collapsed && <span className="text-lex-heading tracking-tight">{appName}</span>}
          </div>

          {nav.map((group, i) => (
            <div key={i}>
              {i > 0 && <div className="mx-3 my-2 h-px bg-lex-variant" />}
              {group.title && !collapsed && (
                <div className="px-3 pb-1 pt-2 text-lex-caption uppercase tracking-wider text-lex-secondary">{group.title}</div>
              )}
              <nav className="flex flex-col gap-0.5 px-1">
                {group.items.map((it) => (
                  <NavLink key={it.href} item={it} />
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1 p-1">
          {statusSlot?.(collapsed)}
          <nav className="flex flex-col">
            {footerNav.map((it) => (
              <NavLink key={it.href} item={it} />
            ))}
          </nav>
        </div>
      </aside>

      {/* ───── Columna principal ───── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* App bar: 52px */}
        <header className="flex h-[52px] shrink-0 items-center justify-between bg-lex-surface/80 px-3 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={toggle}
              aria-label={collapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
              className="flex h-8 w-8 items-center justify-center rounded text-lex-on-variant transition-colors hover:bg-lex-container hover:text-lex-on-surface"
            >
              <Icon name="menu" size={20} />
            </button>
            <div className="flex min-w-0 items-center gap-1.5 text-lex-meta text-lex-secondary">
              {breadcrumb.map((b, i) => {
                const last = i === breadcrumb.length - 1;
                return (
                  <span key={i} className="flex items-center gap-1.5 truncate">
                    {i > 0 && <Icon name="chevron_right" size={14} />}
                    <span className={last ? "text-lex-meta-medium text-lex-on-surface" : ""}>{b}</span>
                  </span>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onSearch && (
              <button
                onClick={onSearch}
                className="flex h-8 w-64 items-center rounded-lg bg-lex-container px-2 text-lex-body text-lex-on-variant shadow-[0_0_0_1px_rgba(0,0,0,0.04)]"
              >
                <Icon name="search" size={16} className="mr-2" />
                <span className="flex-1 truncate text-left">{searchPlaceholder}</span>
                <Kbd>⌘K</Kbd>
              </button>
            )}
            {topbarActions}
            {user && (
              <div className="flex items-center gap-2 pl-1">
                <div className="flex flex-col text-right leading-tight">
                  <span className="text-lex-caption font-medium">{user.name}</span>
                  {user.role && <span className="text-[10px] text-lex-secondary">{user.role}</span>}
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-lex-primary text-lex-on-primary">
                  <Icon name="person" size={18} />
                </div>
              </div>
            )}
          </div>
        </header>

        {/* El contenido scrollea aquí; el documento domina el área útil */}
        <main className="min-h-0 flex-1 overflow-auto bg-lex-surface lex-scroll">{children}</main>
      </div>
    </div>
  );
}