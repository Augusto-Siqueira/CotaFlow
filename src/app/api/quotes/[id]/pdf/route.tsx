import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServer } from "@/lib/supabaseServer";
import {
  QuoteProposalDocument,
  type QuoteProposalData,
} from "@/lib/pdf/QuoteProposalDocument";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, origin, destination, distance_km, product, nf_value, gross_freight, toll_cost, insurance_pct, insurance_value, icms_pct, net_freight, full_freight, transit_time_hours, delivery_deadline, validity_date, free_time_hours, over_time_cost, client_quote_number, status, created_at, version, clients(name, document, pdf_layout), vehicles(type, axles)"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return new Response("Cotação não encontrada.", { status: 404 });
  }

  const quote: QuoteProposalData = {
    ...data,
    client: data.clients as unknown as QuoteProposalData["client"],
    vehicle: data.vehicles as unknown as QuoteProposalData["vehicle"],
  };

  // Cotação no formato novo (lista de paradas, ver 0030) rateia via
  // quote_stops; cotação antiga congelada continua em quote_deliveries.
  const { data: stops } = await supabase
    .from("quote_stops")
    .select("address, weight_kg, nf_share_pct")
    .eq("quote_id", id)
    .order("position");

  const deliveries =
    stops && stops.length > 0
      ? stops
          .filter((s) => s.weight_kg !== null)
          .map((s) => ({
            destination: s.address,
            weight_kg: s.weight_kg as number,
            freight_share_pct: s.nf_share_pct,
            freight_value:
              s.nf_share_pct !== null && quote.full_freight !== null
                ? quote.full_freight * (s.nf_share_pct / 100)
                : null,
          }))
      : (
          await supabase
            .from("quote_deliveries")
            .select("destination, weight_kg, freight_share_pct, freight_value")
            .eq("quote_id", id)
            .order("weight_kg", { ascending: false })
        ).data;

  const buffer = await renderToBuffer(
    <QuoteProposalDocument quote={quote} deliveries={deliveries ?? []} />
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="cotacao-${id.slice(0, 8)}.pdf"`,
    },
  });
}
