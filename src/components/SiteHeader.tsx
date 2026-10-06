"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { APP_VERSION } from "@/lib/version";

const NAV_LINKS: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/quotes", label: "Cotações" },
  { href: "/quotes/batches", label: "Lotes" },
  { href: "/programacao", label: "Programação" },
  { href: "/propostas", label: "Propostas", adminOnly: true },
  { href: "/clients", label: "Clientes" },
  { href: "/vehicles", label: "Veículos" },
  { href: "/antt-coefficients", label: "ANTT" },
  { href: "/icms-rates", label: "ICMS" },
  { href: "/addresses", label: "Endereços" },
];

/**
 * Com o menu recolhido no celular o usuário perde a referência de onde está,
 * então o item da página atual fica destacado. Vence o href mais longo que
 * casa: em `/quotes/batches/<id>` isso marca "Lotes", não "Cotações".
 */
function activeHref(pathname: string): string | undefined {
  return NAV_LINKS.filter(
    (l) => pathname === l.href || pathname.startsWith(`${l.href}/`)
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = activeHref(pathname);
  const { user, role } = useAuth();
  const visibleLinks = NAV_LINKS.filter((l) => !l.adminOnly || role === "admin");

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  const userBox = user && (
    <div className="flex items-center gap-3 text-xs text-navy-200">
      <span className="rounded-full bg-navy-800 px-2 py-0.5 font-medium text-navy-100">
        {role === "admin"
          ? "Comercial"
          : role === "logistica"
            ? "Logística"
            : "Somente leitura"}
      </span>
      <Link
        href="/versao"
        className="text-navy-400 transition-colors hover:text-brand-400"
        title="Histórico de versões"
      >
        v{APP_VERSION}
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        className="font-medium transition-colors hover:text-brand-400"
      >
        Sair
      </button>
    </div>
  );

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function linkClasses(href: string): string {
    return href === active
      ? "font-semibold text-white"
      : "text-navy-200 transition-colors hover:text-brand-400";
  }

  if (pathname === "/login" || pathname.startsWith("/proposta/")) return null;

  return (
    <header className="bg-navy-900">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold tracking-tight text-white"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-brand-500" />
          CotaFlow
        </Link>

        {/* Menu em linha a partir de sm; no celular fica atrás do botão. */}
        {user && (
          <nav className="hidden items-center gap-5 text-sm font-medium sm:flex">
            {visibleLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={linkClasses(link.href)}
              >
                {link.label}
              </Link>
            ))}
            {userBox}
          </nav>
        )}

        {user && (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          className="-mr-2 inline-flex items-center justify-center rounded-lg p-2 text-navy-200 hover:bg-navy-800 hover:text-white sm:hidden"
        >
          {open ? (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
        )}
      </div>

      {user && open && (
        <nav
          id="menu-mobile"
          className="border-t border-navy-800 px-4 pb-3 text-sm font-medium sm:hidden"
        >
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block rounded-lg px-3 py-2.5 ${
                link.href === active
                  ? "bg-navy-800 font-semibold text-white"
                  : "text-navy-200 hover:bg-navy-800 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="px-3 pt-3">{userBox}</div>
        </nav>
      )}
    </header>
  );
}
