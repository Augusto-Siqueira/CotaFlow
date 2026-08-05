import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
import { DeleteBatchButton } from "./DeleteBatchButton";
import { RoutesTable, type BatchRoute } from "./RoutesTable";

interface BatchDetail {
  id: string;
  product: string | null;
  insurance_pct: number | null;
  parana_rule: boolean;
  free_time_hours: number | null;
  created_at: string;
  clients: { name: string; document: string | null } | null;
}

export default async function QuoteBatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("quote_batches")
    .select(
      "id, product, insurance_pct, parana_rule, free_time_hours, created_at, clients(name, document)"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const batch = data as unknown as BatchDetail;

  const { data: routesData } = await supabase
    .from("quotes")
    .select(
      "id, origin, destination, final_destination, min_load_ton, toll_cost, gross_freight, net_freight, full_freight, transit_time_hours, over_time_cost, icms_pct, vehicles(type)"
    )
    .eq("batch_id", id)
    .order("destination");

  const routes = (routesData as unknown as BatchRoute[]) ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <Link
            href="/quotes/batches"
            className="text-sm text-navy-500 hover:text-navy-700"
          >
            ← Lotes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy-900">
            Lote #{batch.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Criado em {formatDate(batch.created_at)} · {routes.length}{" "}
            {routes.length === 1 ? "rota" : "rotas"}
          </p>
        </div>
        <DeleteBatchButton batchId={batch.id} />
      </div>

      <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-navy-500">
          Condições do lote
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-navy-500">Cliente</dt>
            <dd className="font-medium text-navy-900">
              {batch.clients?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-navy-500">Produto</dt>
            <dd className="font-medium text-navy-900">
              {batch.product ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-navy-500">Seguro</dt>
            <dd className="font-medium text-navy-900">
              {batch.insurance_pct !== null
                ? `${batch.insurance_pct}% sobre a NF`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-navy-500">Free time</dt>
            <dd className="font-medium text-navy-900">
              {batch.free_time_hours !== null
                ? `${batch.free_time_hours}h`
                : "—"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
        <RoutesTable batchId={batch.id} initialRoutes={routes} />
      </div>
    </div>
  );
}
