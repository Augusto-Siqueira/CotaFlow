"use client";

import { buttonClasses } from "@/components/Button";

export interface ClientFilterOption {
  id: string;
  name: string;
}

export interface StatusFilterOption {
  value: string;
  label: string;
}

export interface ListFilterValue {
  clientId: string;
  from: string;
  to: string;
  // Vazio = "todos os status/coleta/entrega". Os três seguem o mesmo padrão:
  // ignorados por telas que não passam `statuses`/`origins`/`destinations`
  // pra <ListFilters> (ex: lotes) — ficam sempre "" nelas, sem UI pra mudar.
  status: string;
  origin: string;
  destination: string;
}

export const emptyListFilter: ListFilterValue = {
  clientId: "",
  from: "",
  to: "",
  status: "",
  origin: "",
  destination: "",
};

export function hasActiveFilter(value: ListFilterValue): boolean {
  return Boolean(
    value.clientId ||
      value.from ||
      value.to ||
      value.status ||
      value.origin ||
      value.destination
  );
}

/**
 * As datas dos inputs são dias no fuso do usuário; `created_at` é timestamptz.
 * Passar "2026-08-04" cru faria o Postgres assumir UTC e cortar o dia no lugar
 * errado, então converte o dia local para o instante UTC equivalente.
 */
export function startOfDayIso(date: string): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function endOfDayIso(date: string): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T23:59:59.999`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function ListFilters({
  clients,
  statuses,
  origins,
  destinations,
  value,
  onChange,
  resultCount,
  resultNoun,
}: {
  clients: ClientFilterOption[];
  // Omitido = tela sem conceito de status (ex: lotes) — não renderiza o
  // filtro. Passe a lista de opções (ex: QUOTE_STATUSES) pra habilitá-lo.
  statuses?: readonly StatusFilterOption[];
  // Idem, pros filtros de Coleta e Entrega — passe a lista de valores
  // distintos já usados (ex: todo `origin`/`destination` de `quotes`).
  origins?: string[];
  destinations?: string[];
  value: ListFilterValue;
  onChange: (value: ListFilterValue) => void;
  resultCount: number;
  resultNoun: [singular: string, plural: string];
}) {
  const active = hasActiveFilter(value);
  const invalidRange = Boolean(value.from && value.to && value.from > value.to);

  function update<K extends keyof ListFilterValue>(
    key: K,
    next: ListFilterValue[K]
  ) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="mb-4 rounded-xl border border-navy-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[200px] flex-1">
          <label className="text-xs font-bold text-navy-600" htmlFor="filtro-cliente">Cliente</label>
          <select id="filtro-cliente"
            value={value.clientId}
            onChange={(e) => update("clientId", e.target.value)}
            className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            <option value="">Todos os clientes</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mr-3 text-xs font-bold text-navy-600" htmlFor="filtro-de">De</label>
          <input id="filtro-de"
            type="date"
            value={value.from}
            onChange={(e) => update("from", e.target.value)}
            className="mt-1 rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mr-3 text-xs font-bold text-navy-600" htmlFor="filtro-ate">Até</label>
          <input id="filtro-ate"
            type="date"
            value={value.to}
            onChange={(e) => update("to", e.target.value)}
            className="mt-1 rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        {statuses && (
          <div className="min-w-[160px]">
            <label className="text-xs font-bold text-navy-600" htmlFor="filtro-status">Status</label>
            <select id="filtro-status"
              value={value.status}
              onChange={(e) => update("status", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Todos os status</option>
              {statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {origins && (
          <div className="min-w-[180px]">
            <label className="text-xs font-bold text-navy-600" htmlFor="filtro-coleta">Coleta</label>
            <select id="filtro-coleta"
              value={value.origin}
              onChange={(e) => update("origin", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Todos os locais de coleta</option>
              {origins.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        )}
        {destinations && (
          <div className="min-w-[180px]">
            <label className="text-xs font-bold text-navy-600" htmlFor="filtro-entrega">Entrega</label>
            <select id="filtro-entrega"
              value={value.destination}
              onChange={(e) => update("destination", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Todos os locais de entrega</option>
              {destinations.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
        {active && (
          <button
            type="button"
            onClick={() => onChange(emptyListFilter)}
            className={buttonClasses("secondary", "md")}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {invalidRange ? (
        <p className="mt-3 text-xs text-red-600">
          A data inicial é posterior à final — nenhum resultado será encontrado.
        </p>
      ) : (
        active && (
          <p className="mt-3 text-xs text-navy-500">
            {resultCount}{" "}
            {resultCount === 1 ? resultNoun[0] : resultNoun[1]} no filtro atual.
          </p>
        )
      )}
    </div>
  );
}
