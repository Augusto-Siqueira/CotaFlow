import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { LoadingOrderDocument } from "@/lib/pdf/LoadingOrderDocument";
import { formatCpf, isBlankLine, type OrderLine } from "@/lib/loadingOrder";

export const runtime = "nodejs";

// PDF da ordem de embarque de uma carga da Programação. Gerado na hora, com os
// dados atuais da carga. A leitura respeita o acesso de quem pede: a equipe vê
// todas e o motorista só as cargas dele.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();

  const { data: load } = await supabase
    .from("loading_schedules")
    .select("id, schedule_date, plate, trailer_plate, driver")
    .eq("id", id)
    .maybeSingle();
  if (!load) return new Response("Carga não encontrada.", { status: 404 });

  const { data: order } = await supabase.from("loading_orders").select("lines").eq("schedule_id", id).maybeSingle();
  const lines = ((order?.lines as OrderLine[] | undefined) ?? []).filter((l) => !isBlankLine(l));
  if (lines.length === 0) return new Response("Esta carga ainda não tem ordem de embarque.", { status: 404 });

  // O motorista da carga é guardado pelo apelido (ou nome); o CPF vem do cadastro.
  const driverName = (load.driver ?? "").trim();
  let driverFull = driverName;
  let cpf = "";
  if (driverName) {
    const { data: drivers } = await supabase.from("drivers").select("name, nickname, cpf");
    const d = (drivers ?? []).find(
      (x) =>
        (x.nickname ?? "").trim().toUpperCase() === driverName.toUpperCase() ||
        x.name.trim().toUpperCase() === driverName.toUpperCase()
    );
    if (d) {
      driverFull = d.name;
      cpf = formatCpf(d.cpf);
    }
  }

  const buffer = await renderToBuffer(
    <LoadingOrderDocument
      order={{
        date: load.schedule_date,
        driver: driverFull,
        driverCpf: cpf,
        plate: load.plate ?? "",
        trailerPlate: load.trailer_plate ?? "",
        lines,
      }}
    />
  );

  const first = lines[0];
  const name = `ordem-embarque-${load.schedule_date}-${(first.oc || "").replace(/[^A-Za-z0-9]/g, "") || id.slice(0, 6)}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
