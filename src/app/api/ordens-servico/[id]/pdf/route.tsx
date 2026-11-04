import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { ServiceOrderDocument } from "@/lib/pdf/ServiceOrderDocument";
import { SERVICE_ORDER_COLUMNS, formatOsNumber, type ServiceOrder } from "@/lib/serviceOrders";

export const runtime = "nodejs";

// PDF de uma Ordem de Serviço da Manutenção. A leitura respeita o acesso de
// quem pede (equipe interna; portal e inspetor bloqueados no banco).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("maintenance_service_orders").select(SERVICE_ORDER_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return new Response("Ordem de serviço não encontrada.", { status: 404 });
  const os = data as ServiceOrder;

  const buffer = await renderToBuffer(<ServiceOrderDocument os={os} />);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="OS-${formatOsNumber(os.number)}-${os.plate}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
