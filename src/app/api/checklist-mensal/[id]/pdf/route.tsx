import { renderToBuffer } from "@react-pdf/renderer";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { MonthlyChecklistDocument } from "@/lib/pdf/MonthlyChecklistDocument";
import type { MonthlyChecklist, MonthlyItem } from "@/lib/monthlyChecklist";

export const runtime = "nodejs";

// PDF de um check-list mensal. A leitura respeita o acesso de quem pede
// (admin, manutenção, logística e o inspetor).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: c } = await supabase.from("monthly_checklists").select("*").eq("id", id).maybeSingle();
  if (!c) return new Response("Check-list não encontrado.", { status: 404 });
  const checklist = c as MonthlyChecklist;
  const { data: items } = await supabase
    .from("monthly_checklist_items")
    .select("*")
    .eq("template", checklist.template)
    .order("position");

  const buffer = await renderToBuffer(<MonthlyChecklistDocument c={checklist} items={(items as MonthlyItem[] | null) ?? []} />);
  const day = checklist.finished_at.slice(0, 10);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="checklist-mensal-${checklist.plate}-${day}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
