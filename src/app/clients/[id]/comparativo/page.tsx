import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/format";

interface ClientInfo {
  id: string;
  name: string;
}

interface QuoteRow {
  id: string;
  origin: string | null;
  destination: string | null;
  gross_freight: number | null;
  net_freight: number | null;
  full_freight: number | null;
  status: string;
  created_at: string;
  version: number;
  duplicated_from_id: string | null;
}

interface RouteGroup {
  routeKey: string;
  origin: string;
  destination: string;
  quotes: QuoteRow[];
}

function routeLabel(origin: string | null, destination: string | null): string {
  return `${origin || "—"} → ${destination || "—"}`;
}

function variationPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export default async function ClientComparativoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: clientData, error: clientError } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", id)
    .single();

  if (clientError || !clientData) {
    notFound();
  }

  const client = clientData as ClientInfo;

  const { data: quotesData, error: quotesError } = await supabase
    .from("quotes")
    .select(
      "id, origin, destination, gross_freight, net_freight, full_freight, status, created_at, version, duplicated_from_id"
    )
    .eq("client_id", id)
    .order("created_at", { ascending: true });

  const quotes = (quotesData as QuoteRow[]) ?? [];

  const groups: RouteGroup[] = [];
  const groupIndexByKey = new Map<string, number>();

  for (const quote of quotes) {
    const key = routeLabel(quote.origin, quote.destination);
    let index = groupIndexByKey.get(key);
    if (index === undefined) {
      index = groups.length;
      groupIndexByKey.set(key, index);
      groups.push({
        routeKey: key,
        origin: quote.origin || "—",
        destination: quote.destination || "—",
        quotes: [],
      });
    }
    groups[index].quotes.push(quote);
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <div className="mb-8">
        <Link href="/clients" className="text-sm text-navy-500 hover:text-navy-700">
          ← Clientes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy-900">
          Comparativo de preços — {client.name}
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          Evolução do frete cotado por rota ao longo do tempo.
        </p>
      </div>

      {quotesError ? (
        <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-red-600 shadow-sm">
          Erro ao carregar cotações: {quotesError.message}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500 shadow-sm">
          Nenhuma cotação registrada para este cliente ainda.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div
              key={group.routeKey}
              className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-navy-200 px-6 py-4">
                <h2 className="text-base font-medium text-navy-900">
                  {group.routeKey}
                </h2>
                <span className="text-sm text-navy-500">
                  {group.quotes.length}{" "}
                  {group.quotes.length === 1 ? "cotação" : "cotações"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
                    <tr>
                      <th className="px-6 py-3 font-medium">Data</th>
                      <th className="px-6 py-3 font-medium">Versão</th>
                      <th className="px-6 py-3 font-medium">Gross</th>
                      <th className="px-6 py-3 font-medium">Net</th>
                      <th className="px-6 py-3 font-medium">Full</th>
                      <th className="px-6 py-3 font-medium">Variação</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {group.quotes.map((quote, i) => {
                      const previous = i > 0 ? group.quotes[i - 1] : null;
                      const delta = variationPct(
                        quote.full_freight,
                        previous?.full_freight ?? null
                      );
                      return (
                        <tr key={quote.id} className="hover:bg-navy-50">
                          <td className="px-6 py-3 text-navy-600">
                            {formatDate(quote.created_at)}
                          </td>
                          <td className="px-6 py-3 text-navy-600">
                            v{quote.version}
                          </td>
                          <td className="px-6 py-3 text-navy-600">
                            {formatCurrency(quote.gross_freight)}
                          </td>
                          <td className="px-6 py-3 text-navy-600">
                            {formatCurrency(quote.net_freight)}
                          </td>
                          <td className="px-6 py-3 font-medium text-navy-900">
                            {formatCurrency(quote.full_freight)}
                          </td>
                          <td className="px-6 py-3">
                            {delta === null ? (
                              <span className="text-navy-400">—</span>
                            ) : (
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                  delta > 0
                                    ? "bg-red-50 text-red-700"
                                    : delta < 0
                                    ? "bg-brand-50 text-brand-700"
                                    : "bg-navy-100 text-navy-600"
                                }`}
                              >
                                {delta > 0 ? "▲" : delta < 0 ? "▼" : "="}{" "}
                                {Math.abs(delta).toFixed(1)}%
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-medium text-navy-700">
                                {quote.status}
                              </span>
                              <Link
                                href={`/quotes/${quote.id}`}
                                className="text-xs font-medium text-brand-700 underline hover:text-brand-800"
                              >
                                Detalhes
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
