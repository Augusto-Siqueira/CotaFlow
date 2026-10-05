"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useHomeData } from "@/lib/useHomeData";
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
  { href: "/quotes/batches", label: "Lotes", hint: "Várias rotas por cliente", d: "M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4" },
  { href: "/clients", label: "Clientes", hint: "Cadastro e comparativo", d: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21c0-4 4-6 8-6s8 2 8 6" },
  { href: "/vehicles", label: "Veículos", hint: "Tipos, eixos e taxas", d: "M3 16V6h11v10M14 9h4l3 3v4h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z" },
  { href: "/antt-coefficients", label: "ANTT", hint: "Piso mínimo de frete", d: "M4 20V10M10 20V4M16 20v-8M22 20H2" },
  { href: "/icms-rates", label: "ICMS", hint: "Alíquotas por UF", d: "M19 5L5 19M7 7h.01M17 17h.01" },
  { href: "/addresses", label: "Endereços", hint: "Origens e destinos fixos", d: "M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12zM12 12a2 2 0 100-4 2 2 0 000 4z" },
];

function LogisticsArt() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 560 380"
      preserveAspectRatio="xMaxYMax slice"
      className="pointer-events-none absolute inset-y-0 right-0 h-full w-full max-w-2xl text-white"
      style={{
        maskImage: "linear-gradient(to right, transparent 0%, black 40%)",
        WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 40%)",
      }}
    >
      <g stroke="currentColor" strokeOpacity="0.14" strokeWidth="1">
        {[60, 120, 180, 240, 300].map((y) => (
          <line key={y} x1="0" y1={y} x2="560" y2={y} />
        ))}
        {[100, 180, 260, 340, 420, 500].map((x) => (
          <line key={x} x1={x} y1="0" x2={x} y2="380" />
        ))}
      </g>

      <path
        d="M70 305 C 140 295, 190 232, 300 238 S 440 248, 505 212"
        fill="none"
        stroke="#75c779"
        strokeOpacity="0.95"
        strokeWidth="3"
        strokeDasharray="2 9"
        strokeLinecap="round"
      />
      {[
        [70, 305],
        [300, 238],
        [505, 212],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="16" fill="#4db753" fillOpacity="0.3" />
          <circle cx={cx} cy={cy} r="7" fill="#4db753" />
          <circle cx={cx} cy={cy} r="3" fill="#ffffff" />
        </g>
      ))}

      <line x1="120" y1="352" x2="560" y2="352" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" />
      <line x1="120" y1="366" x2="560" y2="366" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" strokeDasharray="22 16" />

      <g transform="translate(235 262)" fill="currentColor" opacity="0.32">
        <rect x="0" y="0" width="200" height="62" rx="5" />
        <rect x="14" y="14" width="172" height="3" rx="1.5" fill="#192134" fillOpacity="0.25" />
        <rect x="14" y="26" width="172" height="3" rx="1.5" fill="#192134" fillOpacity="0.25" />
        <rect x="200" y="50" width="14" height="8" />
        <path d="M214 66 V26 H246 L270 44 H284 V66 Z" />
        <path d="M232 32 H244 L258 44 H232 Z" fill="#192134" />
        <rect x="0" y="64" width="284" height="5" />
        {[34, 64, 150, 180, 236, 268].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="80" r="12" />
            <circle cx={cx} cy="80" r="5" fill="#192134" />
          </g>
        ))}
      </g>
    </svg>
  );
}

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
