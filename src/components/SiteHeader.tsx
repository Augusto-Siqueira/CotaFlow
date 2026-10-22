"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth, MANUAL_LOGOUT_KEY } from "@/lib/auth";
import { roleLabel } from "@/lib/roles";
import { listOutbox } from "@/lib/offline/outbox";
import { useFeedback } from "@/components/Feedback";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SidebarMenu, currentPageTitle } from "@/components/SidebarMenu";

export function SiteHeader() {
  const pathname = usePathname();
  const { user, role, isDriver, isPortalClient, isInspector } = useAuth();
  // Motorista, cliente externo e inspetor não usam o menu do sistema.
  const hasMenu = Boolean(user) && !isDriver && !isPortalClient && !isInspector;
  const { confirm: askConfirm } = useFeedback();
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  async function handleLogout() {
    // Itens salvos sem sinal e ainda não enviados: avisa e mantém a fila.
    if (user) {
      const waiting = (await listOutbox(user.id).catch(() => [])).length;
      if (
        waiting > 0 &&
        !(await askConfirm(
          `Há ${waiting} ${waiting === 1 ? "lançamento" : "lançamentos"} aguardando envio. Eles continuam salvos no celular e serão enviados quando você entrar de novo com sinal. Sair mesmo assim?`,
          { confirmLabel: "Sair" }
        ))
      ) {
        return;
      }
    }
    try {
      sessionStorage.setItem(MANUAL_LOGOUT_KEY, "1");
    } catch {}
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  if (pathname === "/login" || pathname.startsWith("/proposta/")) return null;

  const title = currentPageTitle(pathname);

  return (
    <header className="bg-chrome-900 print:hidden">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {hasMenu && (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-controls="menu-lateral"
              aria-label="Abrir menu"
              className="-ml-2 inline-flex items-center justify-center rounded-lg p-2 text-chrome-200 hover:bg-chrome-800 hover:text-white"
            >
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
            </button>
          )}
          <Link
            href={isDriver ? "/motorista" : isPortalClient ? "/portal" : isInspector ? "/checklist-mensal" : "/"}
            className="flex items-center gap-2 text-lg font-bold tracking-tight text-white"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-brand-500" />
            CotaFlow
          </Link>
          {title && (
            <span className="hidden min-w-0 items-center gap-3 text-sm text-chrome-200 sm:flex">
              <span aria-hidden="true" className="text-chrome-300">
                /
              </span>
              <span className="truncate font-medium text-white">{title}</span>
            </span>
          )}
        </div>

        {user && (
          <div className="flex shrink-0 items-center gap-3 text-xs text-chrome-200">
            <span className="hidden rounded-full bg-chrome-800 px-2 py-0.5 font-medium text-chrome-100 sm:inline">
              {roleLabel(role)}
            </span>
            <ThemeToggle className="text-chrome-300 hover:text-brand-400" />
            {(isPortalClient || isInspector) && (
              <button
                type="button"
                onClick={() => setPasswordOpen(true)}
                className="font-medium transition-colors hover:text-brand-400"
              >
                Trocar senha
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="font-medium transition-colors hover:text-brand-400"
            >
              Sair
            </button>
          </div>
        )}
      </div>

      {hasMenu && menuOpen && (
        <SidebarMenu
          pathname={pathname}
          role={role}
          onClose={() => setMenuOpen(false)}
          onChangePassword={() => setPasswordOpen(true)}
        />
      )}
      {passwordOpen && (
        <ChangePasswordDialog onClose={() => setPasswordOpen(false)} />
      )}
    </header>
  );
}
