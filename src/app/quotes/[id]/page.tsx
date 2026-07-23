import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/format";
import { computeIcmsValue } from "@/lib/quoteCalculations";
import { getCityCoordinates } from "@/lib/geocoding";
import RouteMap, { type RouteMapWaypoint } from "@/components/RouteMap";

interface QuoteDetail {
  id: string;
  base_origin: string | null;
  origin: string | null;
  destination: string | null;
  final_destination: string | null;
  distance_km: number | null;
  product: string | null;
  nf_value: number | null;
  gross_freight: number | null;
  toll_cost: number | null;
  insurance_pct: number | null;
  insurance_value: number | null;
  icms_pct: number | null;
  net_freight: number | null;
  full_freight: number | null;
  transit_time_hours: number | null;
  free_time_hours: number | null;
  over_time_cost: number | null;
  status: string;
  created_at: string;
  version: number;
  duplicated_from_id: string | null;
  clients: {
    name: string;
    document: string | null;
    segment: string | null;
  } | null;
  vehicles: {
    type: string;
    axles: number | null;
    capacity_kg: number | null;
    antt_category: string | null;
  } | null;
}

interface QuoteDelivery {
  id: string;
  destination: string;
  weight_kg: number;
  freight_share_pct: number | null;
  freight_value: number | null;
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, base_origin, origin, destination, final_destination, distance_km, product, nf_value, gross_freight, toll_cost, insurance_pct, insurance_value, icms_pct, net_freight, full_freight, transit_time_hours, free_time_hours, over_time_cost, status, created_at, version, duplicated_from_id, clients(name, document, segment), vehicles(type, axles, capacity_kg, antt_category)"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const quote = data as unknown as QuoteDetail;

  const icmsValue = computeIcmsValue(
    quote.full_freight,
    quote.gross_freight,
    quote.toll_cost,
    quote.insurance_value
  );

  const routeCityNames = [
    quote.base_origin,
    quote.origin,
    quote.destination,
    quote.final_destination,
  ].filter((name): name is string => Boolean(name?.trim()));

  const routeWaypoints: RouteMapWaypoint[] = [];
  for (const name of routeCityNames) {
    const coordinates = await getCityCoordinates(name);
    if (coordinates) {
      routeWaypoints.push({ ...coordinates, label: name });
    }
  }

  const { data: deliveries } = await supabase
    .from("quote_deliveries")
    .select("id, destination, weight_kg, freight_share_pct, freight_value")
    .eq("quote_id", id)
    .order("weight_kg", { ascending: false });

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <Link
            href="/quotes"
            className="text-sm text-navy-500 hover:text-navy-700"
          >
            ← Cotações
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy-900">
            Cotação #{quote.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Criada em {formatDate(quote.created_at)} · versão {quote.version}
          </p>
          {quote.duplicated_from_id && (
            <p className="mt-1 text-xs text-navy-500">
              Duplicada da{" "}
              <Link
                href={`/quotes/${quote.duplicated_from_id}`}
                className="text-brand-700 underline hover:text-brand-800"
              >
                cotação #{quote.duplicated_from_id.slice(0, 8).toUpperCase()}
              </Link>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-navy-100 px-3 py-1 text-xs font-medium text-navy-700">
            {quote.status}
          </span>
          <Link
            href={`/quotes/new?duplicate=${quote.id}`}
            className="inline-flex items-center justify-center rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100"
          >
            Duplicar cotação
          </Link>
          <a
            href={`/api/quotes/${quote.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Baixar PDF
          </a>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium uppercase tracking-wide text-navy-500">
            Cliente
          </h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-navy-500">Nome</dt>
              <dd className="font-medium text-navy-900">
                {quote.clients?.name ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-500">Documento</dt>
              <dd className="text-navy-900">
                {quote.clients?.document ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-500">Segmento</dt>
              <dd className="text-navy-900">
                {quote.clients?.segment ?? "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-medium uppercase tracking-wide text-navy-500">
            Veículo
          </h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-navy-500">Tipo</dt>
              <dd className="font-medium text-navy-900">
                {quote.vehicles?.type ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-500">Eixos</dt>
              <dd className="text-navy-900">
                {quote.vehicles?.axles ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-navy-500">Categoria ANTT</dt>
              <dd className="text-navy-900">
                {quote.vehicles?.antt_category ?? "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm sm:col-span-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-navy-500">
            Rota e carga
          </h2>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {quote.base_origin && (
              <div>
                <dt className="text-navy-500">Origem</dt>
                <dd className="font-medium text-navy-900">
                  {quote.base_origin}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-navy-500">Coleta</dt>
              <dd className="font-medium text-navy-900">
                {quote.origin ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-navy-500">Entrega</dt>
              <dd className="font-medium text-navy-900">
                {quote.destination ?? "—"}
              </dd>
            </div>
            {quote.final_destination && (
              <div>
                <dt className="text-navy-500">Destino final</dt>
                <dd className="font-medium text-navy-900">
                  {quote.final_destination}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-navy-500">Distância</dt>
              <dd className="font-medium text-navy-900">
                {quote.distance_km !== null ? `${quote.distance_km} km` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-navy-500">Produto</dt>
              <dd className="font-medium text-navy-900">
                {quote.product ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-navy-500">Valor da NF</dt>
              <dd className="font-medium text-navy-900">
                {formatCurrency(quote.nf_value)}
              </dd>
            </div>
            <div>
              <dt className="text-navy-500">Transit time</dt>
              <dd className="font-medium text-navy-900">
                {quote.transit_time_hours !== null
                  ? `${quote.transit_time_hours}h`
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm sm:col-span-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-navy-500">
            Mapa da rota
          </h2>
          <div className="mt-3">
            <RouteMap waypoints={routeWaypoints} showDistance />
          </div>
        </div>

        <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm sm:col-span-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-navy-500">
            Custos
          </h2>
          <div className="mt-3 divide-y divide-navy-100 text-sm">
            <div className="flex justify-between py-2">
              <span className="text-navy-600">Frete Gross</span>
              <span className="font-medium text-navy-900">
                {formatCurrency(quote.gross_freight)}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-navy-600">Pedágio</span>
              <span className="font-medium text-navy-900">
                {formatCurrency(quote.toll_cost)}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-navy-600">
                Seguro
                {quote.insurance_pct !== null
                  ? ` (${quote.insurance_pct}%)`
                  : ""}
              </span>
              <span className="font-medium text-navy-900">
                {formatCurrency(quote.insurance_value)}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-navy-600">
                ICMS{quote.icms_pct !== null ? ` (${quote.icms_pct}%)` : ""}
              </span>
              <span className="font-medium text-navy-900">
                {formatCurrency(icmsValue)}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-navy-600">Frete Net (PIS/COFINS)</span>
              <span className="font-medium text-navy-900">
                {formatCurrency(quote.net_freight)}
              </span>
            </div>
          </div>
          <div className="mt-3 flex justify-between rounded-lg bg-navy-50 px-4 py-3">
            <span className="text-base font-semibold text-navy-900">
              Frete Full
            </span>
            <span className="text-base font-semibold text-navy-900">
              {formatCurrency(quote.full_freight)}
            </span>
          </div>
        </div>

        {deliveries && deliveries.length > 0 && (
          <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm sm:col-span-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-navy-500">
              Fracionado — entregas
            </h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-navy-500">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Destino</th>
                  <th className="py-1.5 pr-3 font-medium">Peso</th>
                  <th className="py-1.5 pr-3 font-medium">%</th>
                  <th className="py-1.5 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {(deliveries as QuoteDelivery[]).map((d) => (
                  <tr key={d.id}>
                    <td className="py-2 pr-3 text-navy-900">
                      {d.destination}
                    </td>
                    <td className="py-2 pr-3 text-navy-600">
                      {d.weight_kg.toLocaleString("pt-BR")} kg
                    </td>
                    <td className="py-2 pr-3 text-navy-600">
                      {d.freight_share_pct !== null
                        ? `${d.freight_share_pct.toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="py-2 text-navy-900">
                      {formatCurrency(d.freight_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
