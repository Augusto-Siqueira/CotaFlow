"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
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
  MobileCard,
  MobileCardList,
} from "@/components/MobileCard";

interface QuoteBatch {
  id: string;
  product: string | null;
  created_at: string;
  clients: { name: string } | null;
  quotes: { id: string }[];
}

export default function QuoteBatchesPage() {
  const [batches, setBatches] = useState<QuoteBatch[]>([]);
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
    async function loadBatches() {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("quote_batches")
        .select("id, product, created_at, clients(name), quotes(id)")
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
        setBatches((data as unknown as QuoteBatch[]) ?? []);
      }
      setLoading(false);
    }
    loadBatches();
  }, [filter]);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
            Lotes de cotação
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Cotações com múltiplas rotas agrupadas para o mesmo cliente.
          </p>
        </div>
        <Link
          href="/quotes/batches/new"
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Novo lote
        </Link>
      </div>

      <ListFilters
        clients={clients}
        value={filter}
        onChange={setFilter}
        resultCount={batches.length}
        resultNoun={["lote encontrado", "lotes encontrados"]}
      />

      <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">
            Carregando lotes...
          </div>
        ) : error ? (
          <div className="px-6 py-10 text-center text-sm text-red-600">
            Erro ao carregar lotes: {error}
          </div>
        ) : batches.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">
            {hasActiveFilter(filter)
              ? "Nenhum lote encontrado com esses filtros."
              : "Nenhum lote cadastrado ainda."}
          </div>
        ) : (
          <>
            <MobileCardList>
              {batches.map((batch) => {
                const nRotas = batch.quotes?.length ?? 0;
                return (
                  <MobileCard key={batch.id}>
                    <CardHeader
                      title={batch.clients?.name ?? "—"}
                      subtitle={formatDate(batch.created_at)}
                      badge={
                        <CardBadge tone="brand">
                          {nRotas} {nRotas === 1 ? "rota" : "rotas"}
                        </CardBadge>
                      }
                    />
                    <CardFields>
                      <CardField
                        label="Produto"
                        value={batch.product ?? "—"}
                        wide
                      />
                    </CardFields>
                    <CardActions>
                      <Link
                        href={`/quotes/batches/${batch.id}`}
                        className="text-brand-700 underline hover:text-brand-800"
                      >
                        Ver lote
                      </Link>
                    </CardActions>
                  </MobileCard>
                );
              })}
            </MobileCardList>

            <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Cliente</th>
                  <th className="px-6 py-3 font-medium">Produto</th>
                  <th className="px-6 py-3 font-medium">Rotas</th>
                  <th className="px-6 py-3 font-medium">Data</th>
                  <th className="px-6 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-navy-50">
                    <td className="px-6 py-3 font-medium text-navy-900">
                      {batch.clients?.name ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-navy-600">
                      {batch.product ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-navy-600">
                      {batch.quotes?.length ?? 0}
                    </td>
                    <td className="px-6 py-3 text-navy-500">
                      {formatDate(batch.created_at)}
                    </td>
                    <td className="px-6 py-3">
                      <Link
                        href={`/quotes/batches/${batch.id}`}
                        className="font-medium text-brand-700 underline hover:text-brand-800"
                      >
                        Detalhes
                      </Link>
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
