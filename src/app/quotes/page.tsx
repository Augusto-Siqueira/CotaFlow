"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import {
  CardActions,
  CardBadge,
  CardFields,
  CardField,
  CardHeader,
  CardHighlight,
  MobileCard,
  MobileCardList,
} from "@/components/MobileCard";

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

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clients, setClients] = useState<ClientFilterOption[]>([]);
  const [filter, setFilter] = useState<ListFilterValue>(emptyListFilter);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadClients() {
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      setClients(data ?? []);
    }
    loadClients();
  }, []);

  useEffect(() => {
    async function loadQuotes() {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("quotes")
        .select(
          "id, origin, destination, gross_freight, net_freight, full_freight, status, created_at, clients(name), vehicles(type)"
        )
        .order("created_at", { ascending: false });

      if (filter.clientId) query = query.eq("client_id", filter.clientId);
      const from = startOfDayIso(filter.from);
      if (from) query = query.gte("created_at", from);
      const to = endOfDayIso(filter.to);
      if (to) query = query.lte("created_at", to);

      const { data, error } = await query;

      if (error) {
        setError(error.message);
      } else {
        setQuotes((data as unknown as Quote[]) ?? []);
      }
      setLoading(false);
    }
    loadQuotes();
  }, [filter]);

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
        <div className="flex items-center gap-3">
          <Link
            href="/quotes/batches/new"
            className="inline-flex items-center justify-center rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100"
          >
            Cotação em lote
          </Link>
          <Link
            href="/quotes/new"
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Nova cotação
          </Link>
        </div>
      </div>

      <ListFilters
        clients={clients}
        value={filter}
        onChange={setFilter}
        resultCount={quotes.length}
        resultNoun={["cotação encontrada", "cotações encontradas"]}
      />

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
            <MobileCardList>
              {quotes.map((quote) => (
                <MobileCard key={quote.id}>
                  <CardHeader
                    title={
                      <>
                        {quote.origin ?? "—"}{" "}
                        <span className="text-navy-400">→</span>{" "}
                        {quote.destination ?? "—"}
                      </>
                    }
                    subtitle={
                      <>
                        {quote.clients?.name ?? "—"}
                        {quote.vehicles?.type && ` · ${quote.vehicles.type}`}
                      </>
                    }
                    badge={<CardBadge>{quote.status}</CardBadge>}
                  />

                  <CardHighlight
                    label="Frete Full"
                    value={formatCurrency(quote.full_freight)}
                  />

                  <CardFields>
                    <CardField
                      label="Net"
                      value={formatCurrency(quote.net_freight)}
                    />
                    <CardField
                      label="Gross"
                      value={formatCurrency(quote.gross_freight)}
                    />
                    <CardField
                      label="Data"
                      value={formatDate(quote.created_at)}
                    />
                  </CardFields>

                  <CardActions>
                    <Link
                      href={`/quotes/${quote.id}`}
                      className="text-brand-700 underline hover:text-brand-800"
                    >
                      Detalhes
                    </Link>
                    <a
                      href={`/api/quotes/${quote.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-700 underline hover:text-brand-800"
                    >
                      PDF
                    </a>
                  </CardActions>
                </MobileCard>
              ))}
            </MobileCardList>

            <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Cliente</th>
                  <th className="px-6 py-3 font-medium">Rota</th>
                  <th className="px-6 py-3 font-medium">Veículo</th>
                  <th className="px-6 py-3 font-medium">Gross</th>
                  <th className="px-6 py-3 font-medium">Net</th>
                  <th className="px-6 py-3 font-medium">Full</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Data</th>
                  <th className="px-6 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {quotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-navy-50">
                    <td className="px-6 py-3 font-medium text-navy-900">
                      {quote.clients?.name ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-navy-600">
                      {quote.origin} → {quote.destination}
                    </td>
                    <td className="px-6 py-3 text-navy-600">
                      {quote.vehicles?.type ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-navy-600">
                      {formatCurrency(quote.gross_freight)}
                    </td>
                    <td className="px-6 py-3 text-navy-600">
                      {formatCurrency(quote.net_freight)}
                    </td>
                    <td className="px-6 py-3 text-navy-600">
                      {formatCurrency(quote.full_freight)}
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-medium text-navy-700">
                        {quote.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-navy-500">
                      {formatDate(quote.created_at)}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/quotes/${quote.id}`}
                          className="font-medium text-brand-700 underline hover:text-brand-800"
                        >
                          Detalhes
                        </Link>
                        <a
                          href={`/api/quotes/${quote.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-brand-700 underline hover:text-brand-800"
                        >
                          PDF
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
