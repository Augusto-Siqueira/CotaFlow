"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  ListFilters,
  emptyListFilter,
  endOfDayIso,
  hasActiveFilter,
  startOfDayIso,
  type ClientFilterOption,
  type ListFilterValue,
} from "@/components/ListFilters";
import { DataTable, type Column } from "@/components/DataTable";
import {
  QUOTE_STATUSES,
  quoteStatusBadgeClass,
  quoteStatusLabel,
} from "@/lib/quoteStatus";
import { useFeedback } from "@/components/Feedback";
import { buttonClasses } from "@/components/Button";

// O Supabase limita cada consulta a 1000 linhas no servidor — pagina pra
// levantar TODOS os locais de coleta/entrega já usados em alguma cotação,
// sem depender do filtro ativo agora (o dropdown precisa listar todas as
// opções possíveis, não só as que batem com o filtro atual). Mesmo padrão
// de fetchAllCityNames em quotes/new e quotes/batches/new.
async function fetchOriginsAndDestinations(): Promise<{
  origins: string[];
  destinations: string[];
}> {
  const pageSize = 1000;
  const origins = new Set<string>();
  const destinations = new Set<string>();

  function collect(data: { origin: string | null; destination: string | null }[] | null) {
    for (const row of data ?? []) {
      if (row.origin) origins.add(row.origin);
      if (row.destination) destinations.add(row.destination);
    }
  }

  // A primeira página informa o total (count); as demais saem em paralelo.
  const first = await supabase
    .from("quotes")
    .select("origin, destination", { count: "exact" })
    .range(0, pageSize - 1);
  if (first.error) return { origins: [], destinations: [] };
  collect(first.data);

  const extraPages = Math.max(
    Math.ceil((first.count ?? first.data?.length ?? 0) / pageSize) - 1,
    0
  );
  const rest = await Promise.all(
    Array.from({ length: extraPages }, (_, i) =>
      supabase
        .from("quotes")
        .select("origin, destination")
        .range((i + 1) * pageSize, (i + 2) * pageSize - 1)
    )
  );
  for (const r of rest) collect(r.data);

  return {
    origins: Array.from(origins).sort(),
    destinations: Array.from(destinations).sort(),
  };
}

interface Quote {
  id: string;
  origin: string | null;
  destination: string | null;
  gross_freight: number | null;
  net_freight: number | null;
  full_freight: number | null;
  status: string;
  created_at: string;
  clients: { name: string } | null;
  vehicles: { type: string } | null;
}

// Só leitura, de propósito: trocar o status é ação restrita à tela de
// Detalhes (ver QuoteStatusSelect) — aqui na lista, editar linha a linha
// numa tabela rolando vira bagunça fácil de clicar sem querer.
function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${quoteStatusBadgeClass(
        status
      )}`}
    >
      {quoteStatusLabel(status)}
    </span>
  );
}

const PAGE_SIZE = 50;

export default function QuotesPage() {
  const { isAdmin } = useAuth();
  const { toastError, confirm: askConfirm } = useFeedback();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<ClientFilterOption[]>([]);
  const [origins, setOrigins] = useState<string[]>([]);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [filter, setFilter] = useState<ListFilterValue>(emptyListFilter);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === quotes.length ? new Set() : new Set(quotes.map((q) => q.id))
    );
  }

  async function deleteQuotes(ids: string[]) {
    const label = ids.length === 1 ? "esta cotação" : `${ids.length} cotações`;
    if (!await askConfirm(`Excluir ${label}? Essa ação não pode ser desfeita.`)) return;

    setDeleting(true);
    const { error } = await supabase.from("quotes").delete().in("id", ids);
    setDeleting(false);

    if (error) {
      toastError(`Não foi possível excluir (${error.message}).`);
      return;
    }
    setSelected(new Set());
    setReloadKey((k) => k + 1);
  }

  useEffect(() => {
    async function loadClients() {
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      setClients(data ?? []);
    }
    loadClients();

    async function loadLocations() {
      const { origins, destinations } = await fetchOriginsAndDestinations();
      setOrigins(origins);
      setDestinations(destinations);
    }
    loadLocations();
  }, []);

  useEffect(() => {
    async function loadQuotes() {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("quotes")
        .select(
          "id, origin, destination, gross_freight, net_freight, full_freight, status, created_at, clients(name), vehicles(type)",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (filter.clientId) query = query.eq("client_id", filter.clientId);
      if (filter.status) query = query.eq("status", filter.status);
      if (filter.origin) query = query.eq("origin", filter.origin);
      if (filter.destination) query = query.eq("destination", filter.destination);
      const from = startOfDayIso(filter.from);
      if (from) query = query.gte("created_at", from);
      const to = endOfDayIso(filter.to);
      if (to) query = query.lte("created_at", to);

      const { data, error, count } = await query;

      if (error) {
        setError(error.message);
      } else if ((data ?? []).length === 0 && page > 0) {
        // Apagou tudo da última página: volta uma.
        setPage(page - 1);
        return;
      } else {
        setQuotes((data as unknown as Quote[]) ?? []);
        setTotal(count ?? 0);
      }
      setLoading(false);
    }
    loadQuotes();
  }, [filter, page, reloadKey]);

  const quoteColumns: Column<Quote>[] = [
    {
      key: "client",
      header: "Cliente",
      cell: (q) => q.clients?.name ?? "—",
      mobile: "subtitle",
      className: "font-medium text-navy-900",
    },
    {
      key: "route",
      header: "Rota",
      cell: (q) => `${q.origin} → ${q.destination}`,
      mobile: "title",
      mobileCell: (q) => (
        <>
          {q.origin ?? "—"} <span className="text-navy-500">→</span>{" "}
          {q.destination ?? "—"}
        </>
      ),
    },
    {
      key: "vehicle",
      header: "Veículo",
      cell: (q) => q.vehicles?.type ?? "—",
      mobile: "subtitle",
      mobileCell: (q) => q.vehicles?.type || null,
    },
    {
      key: "gross",
      header: "Gross",
      cell: (q) => formatCurrency(q.gross_freight),
      mobile: "field",
      mobileOrder: 3.5,
    },
    {
      key: "net",
      header: "Net",
      cell: (q) => formatCurrency(q.net_freight),
      mobile: "field",
      mobileOrder: 3,
    },
    {
      key: "full",
      header: "Full",
      cell: (q) => formatCurrency(q.full_freight),
      mobile: "highlight",
    },
    {
      key: "status",
      header: "Status",
      cell: (q) => <StatusBadge status={q.status} />,
      mobile: "badge",
      className: "",
    },
    {
      key: "date",
      header: "Data",
      cell: (q) => formatDate(q.created_at),
      mobile: "field",
      className: "text-navy-500",
    },
    {
      key: "actions",
      header: "Ações",
      cell: (q) => (
        <div className="flex items-center gap-2">
          <Link href={`/quotes/${q.id}`} className={buttonClasses("soft", "sm")}>
            Detalhes
          </Link>
          <a
            href={`/api/quotes/${q.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses("soft", "sm")}
          >
            PDF
          </a>
          {isAdmin && (
            <button
              type="button"
              disabled={deleting}
              onClick={() => deleteQuotes([q.id])}
              className={buttonClasses("danger", "sm")}
            >
              Excluir
            </button>
          )}
        </div>
      ),
      mobile: "actions",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
            Cotações
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Histórico de cotações geradas.
          </p>
        </div>
        {isAdmin && (
        <div className="flex items-center gap-3">
          <Link
            href="/quotes/batches/new"
            className="inline-flex items-center justify-center rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100"
          >
            Cotação em lote
          </Link>
          <Link
            href="/quotes/new"
            className="inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
          >
            Nova cotação
          </Link>
        </div>
        )}
      </div>

      <ListFilters
        clients={clients}
        statuses={QUOTE_STATUSES}
        origins={origins}
        destinations={destinations}
        value={filter}
        onChange={(value) => {
          setFilter(value);
          setPage(0);
          setSelected(new Set());
        }}
        resultCount={total}
        resultNoun={["cotação encontrada", "cotações encontradas"]}
      />

      {isAdmin && selected.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm">
          <span className="text-red-800">
            {selected.size}{" "}
            {selected.size === 1 ? "cotação selecionada" : "cotações selecionadas"}
          </span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-navy-600 underline hover:text-navy-800"
            >
              Limpar seleção
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => deleteQuotes([...selected])}
              className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Excluindo..." : "Excluir selecionadas"}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">
            Carregando cotações...
          </div>
        ) : error ? (
          <div className="px-6 py-10 text-center text-sm text-red-600">
            Erro ao carregar cotações: {error}
          </div>
        ) : quotes.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">
            {hasActiveFilter(filter)
              ? "Nenhuma cotação encontrada com esses filtros."
              : "Nenhuma cotação cadastrada ainda."}
          </div>
        ) : (
            <>
              <DataTable
                rows={quotes}
                rowKey={(q) => q.id}
                columns={quoteColumns}
                selection={
                  isAdmin
                    ? {
                        isSelected: (q) => selected.has(q.id),
                        onToggle: (q) => toggleSelected(q.id),
                        allSelected: quotes.length > 0 && selected.size === quotes.length,
                        onToggleAll: toggleAll,
                      }
                    : undefined
                }
              />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-navy-200 px-6 py-3 text-sm text-navy-600">
              <span>
                {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + quotes.length} de {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelected(new Set());
                    setPage((p) => Math.max(p - 1, 0));
                  }}
                  disabled={page === 0}
                  className="rounded-lg border border-navy-300 px-3 py-1.5 font-medium text-navy-700 hover:bg-navy-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anterior
                </button>
                <span className="px-1">
                  Página {page + 1} de {Math.max(Math.ceil(total / PAGE_SIZE), 1)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(new Set());
                    setPage((p) => p + 1);
                  }}
                  disabled={(page + 1) * PAGE_SIZE >= total}
                  className="rounded-lg border border-navy-300 px-3 py-1.5 font-medium text-navy-700 hover:bg-navy-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
