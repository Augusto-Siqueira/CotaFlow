"use client";

export interface ClientFilterOption {
  id: string;
  name: string;
}

export interface ListFilterValue {
  clientId: string;
  from: string;
  to: string;
}

export const emptyListFilter: ListFilterValue = {
  clientId: "",
  from: "",
  to: "",
};

export function hasActiveFilter(value: ListFilterValue): boolean {
  return Boolean(value.clientId || value.from || value.to);
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
  value,
  onChange,
  resultCount,
  resultNoun,
}: {
  clients: ClientFilterOption[];
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
          <label className="text-xs font-bold text-navy-600">Cliente</label>
          <select
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
          <label className="mr-3 text-xs font-bold text-navy-600">De</label>
          <input
            type="date"
            value={value.from}
            onChange={(e) => update("from", e.target.value)}
            className="mt-1 rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="mr-3 text-xs font-bold text-navy-600">Até</label>
          <input
            type="date"
            value={value.to}
            onChange={(e) => update("to", e.target.value)}
            className="mt-1 rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        {active && (
          <button
            type="button"
            onClick={() => onChange(emptyListFilter)}
            className="rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100"
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
