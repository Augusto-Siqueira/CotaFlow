import { renderToBuffer } from "@react-pdf/renderer";
import { supabase } from "@/lib/supabase";
import {
  BatchProposalDocument,
  type BatchProposalData,
  type BatchProposalRoute,
} from "@/lib/pdf/BatchProposalDocument";
import { parseFreightUnit } from "@/lib/freightUnit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const unit = parseFreightUnit(
    new URL(request.url).searchParams.get("unit")
  );

  const { data, error } = await supabase
    .from("quote_batches")
    .select(
      "id, product, insurance_pct, free_time_hours, created_at, clients(name, document)"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return new Response("Lote não encontrado.", { status: 404 });
  }

  const batch: BatchProposalData = {
    ...data,
    client: data.clients as unknown as BatchProposalData["client"],
  };

  const { data: routesData } = await supabase
    .from("quotes")
    .select(
      "origin, destination, min_load_ton, toll_cost, net_freight, gross_freight, full_freight, transit_time_hours, over_time_cost, icms_pct, vehicles(type)"
    )
    .eq("batch_id", id)
    .order("destination");

  const routes: BatchProposalRoute[] = (routesData ?? []).map((r) => ({
    origin: r.origin,
    destination: r.destination,
    vehicle_type: (r.vehicles as unknown as { type: string } | null)?.type ?? null,
    min_load_ton: r.min_load_ton,
    toll_cost: r.toll_cost,
    net_freight: r.net_freight,
    gross_freight: r.gross_freight,
    full_freight: r.full_freight,
    transit_time_hours: r.transit_time_hours,
    over_time_cost: r.over_time_cost,
    icms_pct: r.icms_pct,
  }));

  const buffer = await renderToBuffer(
    <BatchProposalDocument batch={batch} routes={routes} unit={unit} />
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="lote-${id.slice(0, 8)}.pdf"`,
    },
  });
}
