"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import {
  FREIGHT_UNIT_LABEL,
  freightByUnit,
  type FreightUnit,
} from "@/lib/freightUnit";
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

export interface BatchRoute {
  id: string;
  origin: string | null;
  destination: string | null;
  final_destination: string | null;
  min_load_ton: number | null;
  toll_cost: number | null;
  gross_freight: number | null;
  net_freight: number | null;
  full_freight: number | null;
  transit_time_hours: number | null;
  over_time_cost: number | null;
  icms_pct: number | null;
  vehicles: { type: string } | null;
}

const UNIT_OPTIONS: { value: FreightUnit; label: string }[] = [
  { value: "viagem", label: "R$ / viagem" },
  { value: "tonelada", label: "R$ / tonelada" },
];

export function RoutesTable({
  batchId,
  initialRoutes: routes,
}: {
  batchId: string;
  initialRoutes: BatchRoute[];
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [unit, setUnit] = useState<FreightUnit>("viagem");

  async function handleDelete(routeId: string) {
    if (!confirm("Excluir esta rota do lote?")) return;

    setDeletingId(routeId);
    const { error } = await supabase.from("quotes").delete().eq("id", routeId);

    if (error) {
      alert(`Não foi possível excluir a rota: ${error.message}`);
      setDeletingId(null);
      return;
    }

    router.refresh();
    setDeletingId(null);
  }

  if (routes.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-navy-500">
        Nenhuma rota neste lote.
      </div>
    );
  }

  const perTon = unit === "tonelada";
  const unitSuffix = perTon ? ` (${FREIGHT_UNIT_LABEL.tonelada})` : "";
  const exportQuery = perTon ? "?unit=tonelada" : "";
  const missingMinLoad = routes.filter(
    (r) => r.min_load_ton === null || r.min_load_ton <= 0
  ).length;

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-navy-200 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-navy-500">
            Fretes em
          </span>
          {/* No mobile o seletor ocupa a largura toda, com metade para cada
              opção — alvo de toque confortável em vez de dois botõezinhos. */}
          <div className="inline-flex rounded-lg border border-navy-300 p-0.5">
            {UNIT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setUnit(option.value)}
                className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium sm:flex-none ${
                  unit === option.value
                    ? "bg-brand-600 text-white"
                    : "text-navy-600 hover:bg-navy-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/api/quotes/batches/${batchId}/xlsx${exportQuery}`}
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100 sm:flex-none"
          >
            Exportar Excel
          </a>
          <a
            href={`/api/quotes/batches/${batchId}/pdf${exportQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 sm:flex-none"
          >
            Baixar PDF
          </a>
        </div>
      </div>

      {perTon && missingMinLoad > 0 && (
        <p className="border-b border-navy-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {missingMinLoad}{" "}
          {missingMinLoad === 1
            ? "rota está sem lotação mínima, então não tem"
            : "rotas estão sem lotação mínima, então não têm"}{" "}
          preço por tonelada. Informe a lotação na rota para converter.
        </p>
      )}

      <MobileCardList>
        {routes.map((route) => (
          <MobileCard key={route.id}>
            <CardHeader
              title={
                <>
                  {route.origin ?? "—"}{" "}
                  <span className="text-navy-400">→</span>{" "}
                  {route.destination ?? "—"}
                </>
              }
              subtitle={
                <>
                  {route.vehicles?.type ?? "Veículo não definido"}
                  {route.min_load_ton !== null && ` · ${route.min_load_ton} ton`}
                </>
              }
              badge={
                route.icms_pct !== null ? (
                  <CardBadge>ICMS {route.icms_pct}%</CardBadge>
                ) : null
              }
            />

            <CardHighlight
              label={`Frete Full${perTon ? ` · ${FREIGHT_UNIT_LABEL.tonelada}` : ""}`}
              value={formatCurrency(
                freightByUnit(route.full_freight, route.min_load_ton, unit)
              )}
            />

            <CardFields>
              <CardField
                label="Net"
                value={formatCurrency(
                  freightByUnit(route.net_freight, route.min_load_ton, unit)
                )}
              />
              <CardField
                label="Gross"
                value={formatCurrency(
                  freightByUnit(route.gross_freight, route.min_load_ton, unit)
                )}
              />
              <CardField
                label="Pedágio"
                value={formatCurrency(route.toll_cost)}
              />
              <CardField
                label="Transit"
                value={
                  route.transit_time_hours !== null
                    ? `${route.transit_time_hours}h`
                    : "—"
                }
              />
              <CardField
                label="Over time"
                value={
                  route.over_time_cost !== null
                    ? `${formatCurrency(route.over_time_cost)}/h`
                    : "—"
                }
              />
              <CardField
                label="Fim de viagem"
                value={route.final_destination ?? "—"}
              />
            </CardFields>

            <CardActions>
              <Link
                href={`/quotes/${route.id}`}
                className="text-brand-700 underline hover:text-brand-800"
              >
                Detalhes
              </Link>
              <Link
                href={`/quotes/batches/${batchId}/routes/${route.id}/edit`}
                className="text-brand-700 underline hover:text-brand-800"
              >
                Editar
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(route.id)}
                disabled={deletingId === route.id}
                className="ml-auto text-red-600 hover:text-red-800 disabled:opacity-60"
              >
                {deletingId === route.id ? "Excluindo..." : "Excluir"}
              </button>
            </CardActions>
          </MobileCard>
        ))}
      </MobileCardList>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
            <tr>
              <th className="px-4 py-3 font-medium">Origem</th>
              <th className="px-4 py-3 font-medium">Destino</th>
              <th className="px-4 py-3 font-medium">Fim de viagem</th>
              <th className="px-4 py-3 font-medium">Veículo</th>
              <th className="px-4 py-3 font-medium">Lotação mín.</th>
              <th className="px-4 py-3 font-medium">Pedágio</th>
              <th className="px-4 py-3 font-medium">ICMS</th>
              <th className="px-4 py-3 font-medium">Net{unitSuffix}</th>
              <th className="px-4 py-3 font-medium">Gross{unitSuffix}</th>
              <th className="px-4 py-3 font-medium">Full{unitSuffix}</th>
              <th className="px-4 py-3 font-medium">Transit</th>
              <th className="px-4 py-3 font-medium">Over time</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {routes.map((route) => (
              <tr key={route.id} className="hover:bg-navy-50">
                <td className="px-4 py-3 text-navy-900">
                  {route.origin ?? "—"}
                </td>
                <td className="px-4 py-3 text-navy-900">
                  {route.destination ?? "—"}
                </td>
                <td className="px-4 py-3 text-navy-500">
                  {route.final_destination ?? "—"}
                </td>
                <td className="px-4 py-3 text-navy-600">
                  {route.vehicles?.type ?? "—"}
                </td>
                <td className="px-4 py-3 text-navy-600">
                  {route.min_load_ton !== null
                    ? `${route.min_load_ton} ton`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-navy-600">
                  {formatCurrency(route.toll_cost)}
                </td>
                <td className="px-4 py-3 text-navy-600">
                  {route.icms_pct !== null ? `${route.icms_pct}%` : "—"}
                </td>
                <td className="px-4 py-3 text-navy-600">
                  {formatCurrency(
                    freightByUnit(route.net_freight, route.min_load_ton, unit)
                  )}
                </td>
                <td className="px-4 py-3 text-navy-600">
                  {formatCurrency(
                    freightByUnit(route.gross_freight, route.min_load_ton, unit)
                  )}
                </td>
                <td className="px-4 py-3 font-medium text-navy-900">
                  {formatCurrency(
                    freightByUnit(route.full_freight, route.min_load_ton, unit)
                  )}
                </td>
                <td className="px-4 py-3 text-navy-600">
                  {route.transit_time_hours !== null
                    ? `${route.transit_time_hours}h`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-navy-600">
                  {route.over_time_cost !== null
                    ? `${formatCurrency(route.over_time_cost)}/h`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 whitespace-nowrap">
                    <Link
                      href={`/quotes/${route.id}`}
                      className="font-medium text-brand-700 underline hover:text-brand-800"
                    >
                      Detalhes
                    </Link>
                    <Link
                      href={`/quotes/batches/${batchId}/routes/${route.id}/edit`}
                      className="font-medium text-brand-700 underline hover:text-brand-800"
                    >
                      Editar
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(route.id)}
                      disabled={deletingId === route.id}
                      className="font-medium text-red-600 hover:text-red-800 disabled:opacity-60"
                    >
                      {deletingId === route.id ? "Excluindo..." : "Excluir"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
