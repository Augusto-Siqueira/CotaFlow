"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useHomeData } from "@/lib/useHomeData";
import { LogisticsArt } from "@/components/LogisticsArt";
import { formatCurrency, revisionLabel } from "@/lib/format";
import { quoteStatusBadgeClass, quoteStatusLabel } from "@/lib/quoteStatus";

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const MODULES = [
  { href: "/quotes", label: "Cotações", hint: "Histórico e revisões", d: "M9 12h6M9 16h6M7 3h7l5 5v13H7zM14 3v5h5" },
  { href: "/programacao", label: "Programação", hint: "Carregamentos do dia", d: "M8 3v4M16 3v4M4 9h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM9 14l2 2 4-4" },
  { href: "/quotes/batches", label: "Lotes", hint: "Várias rotas por cliente", d: "M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4" },
  { href: "/clients", label: "Clientes", hint: "Cadastro e comparativo", d: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21c0-4 4-6 8-6s8 2 8 6" },
  { href: "/vehicles", label: "Veículos", hint: "Tipos, eixos e taxas", d: "M3 16V6h11v10M14 9h4l3 3v4h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z" },
  { href: "/antt-coefficients", label: "ANTT", hint: "Piso mínimo de frete", d: "M4 20V10M10 20V4M16 20v-8M22 20H2" },
  { href: "/icms-rates", label: "ICMS", hint: "Alíquotas por UF", d: "M19 5L5 19M7 7h.01M17 17h.01" },
  { href: "/addresses", label: "Endereços", hint: "Origens e destinos fixos", d: "M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12zM12 12a2 2 0 100-4 2 2 0 000 4z" },
];

export default function Home() {
  const { isAdmin } = useAuth();
  const { stats, recent } = useHomeData(5);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 p-8 text-white lg:col-span-2">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/20 blur-2xl" />
          <LogisticsArt />
          <p className="relative text-sm font-medium text-brand-300">
            {isAdmin ? "Comercial" : "Somente leitura"}
          </p>
          <h1 className="relative mt-2 text-3xl font-semibold tracking-tight">
            {isAdmin ? "Pronto para a próxima cotação?" : "Consulte as cotações"}
          </h1>
          <p className="relative mt-2 max-w-md text-sm text-navy-200">
            {stats
              ? `${stats.vigentes} vigentes e ${stats.rascunhos} rascunhos em andamento.`
              : "Carregando..."}
          </p>
          <div className="relative mt-6 flex flex-wrap gap-3">
            {isAdmin && (
              <Link
                href="/quotes/new"
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
              >
                + Nova cotação
              </Link>
            )}
            <Link
              href="/quotes"
              className="rounded-lg border border-white/30 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10"
            >
              Ver cotações
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-navy-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-navy-900">Recentes</h2>
          <ul className="mt-3 divide-y divide-navy-100">
            {recent === null ? (
              <li className="py-6 text-center text-xs text-navy-500">
                Carregando...
              </li>
            ) : recent.length === 0 ? (
              <li className="py-6 text-center text-xs text-navy-500">
                Nenhuma cotação ainda.
              </li>
            ) : (
              recent.map((q) => (
                <li key={q.id}>
                  <Link
                    href={`/quotes/${q.id}`}
                    className="block py-2.5 hover:opacity-80"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-navy-900">
                        {q.clients?.name ?? "—"}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${quoteStatusBadgeClass(
                          q.status
                        )}`}
                      >
                        {quoteStatusLabel(q.status)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-xs text-navy-500">
                      <span>{revisionLabel(q.version)}</span>
                      <span className="font-medium text-navy-700">
                        {formatCurrency(q.full_freight)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <h2 className="mt-10 text-xs font-medium uppercase tracking-wide text-navy-500">
        Módulos
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {MODULES.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="group rounded-xl border border-navy-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 group-hover:bg-brand-100">
              <Icon d={m.d} />
            </span>
            <div className="mt-3 text-sm font-semibold text-navy-900">
              {m.label}
            </div>
            <div className="mt-0.5 text-xs text-navy-500">{m.hint}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
