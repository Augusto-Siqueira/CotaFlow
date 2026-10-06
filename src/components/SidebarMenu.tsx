"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { APP_VERSION } from "@/lib/version";

interface NavLeaf {
  href: string;
  label: string;
  adminOnly?: boolean;
}

interface NavEntry {
  key: string;
  label: string;
  icon: string;
  href?: string;
  items?: NavLeaf[];
}

export const NAV: NavEntry[] = [
  { key: "inicio", label: "Início", href: "/", icon: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  {
    key: "comercial",
    label: "Comercial",
    icon: "M9 12h6M9 16h6M7 3h7l5 5v13H7zM14 3v5h5",
    items: [
      { href: "/quotes", label: "Cotações" },
      { href: "/quotes/batches", label: "Cotações em Lote" },
      { href: "/propostas", label: "Propostas", adminOnly: true },
    ],
  },
  {
    key: "programacao",
    label: "Programação",
    href: "/programacao",
    icon: "M8 3v4M16 3v4M4 9h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM9 14l2 2 4-4",
  },
  {
    key: "cadastros",
    label: "Cadastros",
    icon: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21c0-4 4-6 8-6s8 2 8 6",
    items: [
      { href: "/clients", label: "Clientes" },
      { href: "/vehicles", label: "Veículos e motoristas" },
      { href: "/addresses", label: "Endereços" },
    ],
  },
  {
    key: "tabelas",
    label: "Tabelas de frete",
    icon: "M4 20V10M10 20V4M16 20v-8M22 20H2",
    items: [
      { href: "/antt-coefficients", label: "ANTT" },
      { href: "/icms-rates", label: "ICMS" },
    ],
  },
];

function allLeaves(): { href: string; label: string }[] {
  return NAV.flatMap((e) =>
    e.items ? e.items : e.href ? [{ href: e.href, label: e.label }] : []
  );
}

/** href mais específico que casa com a rota atual (em /quotes/batches/x marca "Lotes"). */
export function activeHref(pathname: string): string | undefined {
  return allLeaves()
    .filter((l) =>
      l.href === "/"
        ? pathname === "/"
        : pathname === l.href || pathname.startsWith(`${l.href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function currentPageTitle(pathname: string): string {
  const href = activeHref(pathname);
  return allLeaves().find((l) => l.href === href)?.label ?? "";
}

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * Menu lateral (gaveta): fica fechado e abre pelo botão de 3 tracinhos da
 * barra de cima. Os grupos se expandem; o grupo da página atual já abre
 * aberto. Fecha com Esc, clique fora ou ao escolher uma página.
 */
export function SidebarMenu({
  pathname,
  role,
  onClose,
  onChangePassword,
}: {
  pathname: string;
  role: string | null;
  onClose: () => void;
  onChangePassword: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panelRef, onClose);

  const active = activeHref(pathname);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const open = new Set<string>();
    for (const e of NAV) {
      if (e.items?.some((i) => i.href === active)) open.add(e.key);
    }
    return open;
  });

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const leafClasses = (href: string) =>
    `flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
      href === active
        ? "bg-chrome-800 font-semibold text-white"
        : "text-chrome-200 hover:bg-chrome-800 hover:text-white"
    }`;

  return (
    <div className="fixed inset-0 z-50 print:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/55" aria-hidden="true" />
      <aside
        ref={panelRef}
        id="menu-lateral"
        role="dialog"
        aria-modal="true"
        aria-label="Menu principal"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-[drawer-in_0.2s_ease-out] flex-col overflow-y-auto bg-chrome-950 text-chrome-200 shadow-2xl outline-none motion-reduce:animate-none"
      >
        <div className="flex items-center justify-between border-b border-chrome-800 px-4 py-4">
          <Link
            href="/"
            onClick={onClose}
            className="flex items-center gap-2 text-lg font-bold tracking-tight text-white"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-brand-500" />
            CotaFlow
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="rounded-lg p-2 text-chrome-200 hover:bg-chrome-800 hover:text-white"
          >
            <Icon d="M6 6l12 12M18 6L6 18" size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-3" aria-label="Principal">
          <ul className="flex flex-col gap-1">
            {NAV.map((entry) => {
              if (entry.href) {
                return (
                  <li key={entry.key}>
                    <Link
                      href={entry.href}
                      onClick={onClose}
                      className={`${leafClasses(entry.href)} gap-3 uppercase tracking-wide`}
                    >
                      <span className="text-brand-400">
                        <Icon d={entry.icon} />
                      </span>
                      {entry.label}
                    </Link>
                  </li>
                );
              }
              const items = (entry.items ?? []).filter(
                (i) => !i.adminOnly || role === "admin"
              );
              if (items.length === 0) return null;
              const isOpen = expanded.has(entry.key);
              return (
                <li key={entry.key}>
                  <button
                    type="button"
                    onClick={() => toggle(entry.key)}
                    aria-expanded={isOpen}
                    aria-controls={`grupo-${entry.key}`}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm uppercase tracking-wide text-chrome-200 transition-colors hover:bg-chrome-800 hover:text-white"
                  >
                    <span className="text-brand-400">
                      <Icon d={entry.icon} />
                    </span>
                    <span className="flex-1 text-left">{entry.label}</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                  {isOpen && (
                    <ul
                      id={`grupo-${entry.key}`}
                      className="mt-1 flex flex-col gap-0.5 border-l border-chrome-800 pl-4 ml-6"
                    >
                      {items.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={onClose}
                            className={leafClasses(item.href)}
                          >
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center justify-between border-t border-chrome-800 px-4 py-3 text-xs text-chrome-300">
          <button
            type="button"
            onClick={() => {
              onClose();
              onChangePassword();
            }}
            className="font-medium text-chrome-200 transition-colors hover:text-brand-400"
          >
            Trocar senha
          </button>
          <Link
            href="/versao"
            onClick={onClose}
            className="transition-colors hover:text-brand-400"
            title="Histórico de versões"
          >
            v{APP_VERSION}
          </Link>
        </div>
      </aside>
    </div>
  );
}
