import { requireRole, supabaseAdmin } from "@/lib/supabaseAdmin";
import { a52Configured, a52Places } from "@/lib/a52";

export const runtime = "nodejs";

// Importa as cercas (polígono ou círculo) cadastradas na A52 para os Locais do CotaFlow.
// Repetir a importação atualiza a cerca, a cidade e o "ativo" de cada local já
// importado, sem duplicar e sem mexer no nome, no tipo e na oficina que a
// equipe ajustou aqui.

function guessKind(name: string): string {
  const n = name.toUpperCase();
  if (/P[AÁ]TIO/.test(n)) return "patio";
  if (/\bPOSTO\b/.test(n)) return "posto";
  return "cliente";
}

export async function POST() {
  const auth = await requireRole(["admin", "logistica", "manutencao"], "Seu perfil não importa locais.");
  if (!auth.ok) return auth.response;
  if (!a52Configured()) {
    return Response.json({ error: "Rastreador não configurado no servidor (variáveis A52_*)." }, { status: 503 });
  }

  let data: Awaited<ReturnType<typeof a52Places>>;
  try {
    data = await a52Places();
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha ao consultar a A52." }, { status: 502 });
  }

  const admin = supabaseAdmin();
  const { data: existing, error: exErr } = await admin.from("geo_places").select("a52_address_id").not("a52_address_id", "is", null);
  if (exErr) return Response.json({ error: exErr.message }, { status: 500 });
  const known = new Set(((existing ?? []) as { a52_address_id: number }[]).map((r) => Number(r.a52_address_id)));

  const fence = (p: (typeof data.places)[number]) => ({
    a52_client_id: p.a52ClientId,
    a52_name: p.name,
    cnpj: p.cnpj,
    city: p.city,
    uf: p.uf,
    polygon: p.polygon,
    center_lat: p.centerLat,
    center_lon: p.centerLon,
    radius_m: p.radiusM,
    active: p.active,
  });

  const fresh = data.places.filter((p) => !known.has(p.a52AddressId));
  const old = data.places.filter((p) => known.has(p.a52AddressId));

  if (fresh.length) {
    const { error } = await admin.from("geo_places").insert(
      fresh.map((p) => ({
        ...fence(p),
        a52_address_id: p.a52AddressId,
        name: p.name,
        kind: guessKind(p.name),
        source: "a52",
      }))
    );
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  // Atualiza em grupos de 20 para não demorar com centenas de cercas.
  for (let i = 0; i < old.length; i += 20) {
    const results = await Promise.all(
      old.slice(i, i + 20).map((p) => admin.from("geo_places").update(fence(p)).eq("a52_address_id", p.a52AddressId))
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) return Response.json({ error: failed.error.message }, { status: 500 });
  }

  return Response.json({ inserted: fresh.length, updated: old.length, withoutFence: data.withoutFence + data.invalid });
}
