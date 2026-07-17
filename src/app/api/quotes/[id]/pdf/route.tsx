import { renderToBuffer } from "@react-pdf/renderer";
import { supabase } from "@/lib/supabase";
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

  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id, origin, destination, distance_km, product, nf_value, gross_freight, toll_cost, insurance_pct, insurance_value, icms_pct, net_freight, full_freight, transit_time_hours, free_time_hours, status, created_at, version, clients(name, document), vehicles(type, axles)"
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

  const { data: deliveries } = await supabase
    .from("quote_deliveries")
    .select("destination, weight_kg, freight_share_pct, freight_value")
    .eq("quote_id", id)
    .order("weight_kg", { ascending: false });

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
