import ExcelJS from "exceljs";
import { supabase } from "@/lib/supabase";
import {
  FREIGHT_UNIT_LABEL,
  freightByUnit,
  parseFreightUnit,
} from "@/lib/freightUnit";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const unit = parseFreightUnit(
    new URL(request.url).searchParams.get("unit")
  );

  const { data: batch, error } = await supabase
    .from("quote_batches")
    .select(
      "id, product, insurance_pct, free_time_hours, created_at, clients(name)"
    )
    .eq("id", id)
    .single();

  if (error || !batch) {
    return new Response("Lote não encontrado.", { status: 404 });
  }

  const { data: routes } = await supabase
    .from("quotes")
    .select(
      "origin, destination, min_load_ton, toll_cost, net_freight, gross_freight, full_freight, transit_time_hours, over_time_cost, icms_pct, vehicles(type)"
    )
    .eq("batch_id", id)
    .order("destination");

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Lote de cotação");

  const client = batch.clients as unknown as { name: string } | null;
  sheet.addRow(["Cliente", client?.name ?? "—"]);
  sheet.addRow(["Produto", batch.product ?? "—"]);
  sheet.addRow([
    "Seguro",
    batch.insurance_pct !== null ? `${batch.insurance_pct}% sobre a NF` : "—",
  ]);
  sheet.addRow([
    "Free time",
    batch.free_time_hours !== null ? `${batch.free_time_hours}h` : "—",
  ]);
  sheet.addRow([
    "Unidade dos fretes",
    unit === "tonelada"
      ? "R$ por tonelada (sobre a lotação mínima)"
      : "R$ por viagem",
  ]);
  sheet.addRow([]);

  const freightUnit = FREIGHT_UNIT_LABEL[unit];
  const headerRow = sheet.addRow([
    "Origem",
    "Destino",
    "Veículo",
    "Lotação mínima (ton)",
    "Pedágio",
    "ICMS (%)",
    `Frete Net (${freightUnit})`,
    `Frete Gross (${freightUnit})`,
    `Frete Full (${freightUnit})`,
    "Transit time (h)",
    "Over time (R$/hora)",
  ]);
  headerRow.font = { bold: true };

  for (const route of routes ?? []) {
    sheet.addRow([
      route.origin ?? "—",
      route.destination ?? "—",
      (route.vehicles as unknown as { type: string } | null)?.type ?? "—",
      route.min_load_ton,
      route.toll_cost,
      route.icms_pct,
      freightByUnit(route.net_freight, route.min_load_ton, unit),
      freightByUnit(route.gross_freight, route.min_load_ton, unit),
      freightByUnit(route.full_freight, route.min_load_ton, unit),
      route.transit_time_hours,
      route.over_time_cost,
    ]);
  }

  sheet.columns.forEach((column) => {
    column.width = 18;
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="lote-${id.slice(0, 8)}.xlsx"`,
    },
  });
}
