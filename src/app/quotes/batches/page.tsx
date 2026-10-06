"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
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
import { CardBadge } from "@/components/MobileCard";
import { DataTable, type Column } from "@/components/DataTable";
import { buttonClasses } from "@/components/Button";

interface QuoteBatch {
  id: string;
  product: string | null;
  created_at: string;
  clients: { name: string } | null;
  quotes: { id: string }[];
}

const batchColumns: Column<QuoteBatch>[] = [
  {
    key: "client",
    header: "Cliente",
    cell: (b) => b.clients?.name ?? "—",
    mobile: "title",
    className: "font-medium text-navy-900",
  },
  {
    key: "product",
    header: "Produto",
    cell: (b) => b.product ?? "—",
    mobile: "wideField",
  },
  {
    key: "routes",
    header: "Rotas",
    cell: (b) => b.quotes?.length ?? 0,
    mobile: "badge",
    mobileCell: (b) => {
      const n = b.quotes?.length ?? 0;
      return (
        <CardBadge tone="brand">
          {n} {n === 1 ? "rota" : "rotas"}
        </CardBadge>
      );
    },
  },
  {
    key: "date",
    header: "Data",
    cell: (b) => formatDate(b.created_at),
    mobile: "subtitle",
    className: "text-navy-500",
  },
  {
    key: "actions",
    header: "Ações",
    cell: (b) => (
      <Link
        href={`/quotes/batches/${b.id}`}
        className={buttonClasses("soft", "sm")}
      >
        Detalhes
      </Link>
    ),
    mobileCell: (b) => (
      <Link
        href={`/quotes/batches/${b.id}`}
        className={buttonClasses("soft", "sm")}
      >
        Ver lote
      </Link>
    ),
    mobile: "actions",
  },
];

export default function QuoteBatchesPage() {
  const { isAdmin } = useAuth();
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
        {isAdmin && (
        <Link
          href="/quotes/batches/new"
          className="inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          Novo lote
        </Link>
        )}
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
          <DataTable
            rows={batches}
            rowKey={(b) => b.id}
            columns={batchColumns}
          />
        )}
      </div>
    </div>
  );
}
