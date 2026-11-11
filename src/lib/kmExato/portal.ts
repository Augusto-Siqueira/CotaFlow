import { KmEngine, r2, type KmState, type KmTrip } from "./engine";

// KM Exato no portal do cliente (Btech). O servidor calcula com os dados
// completos e manda só o recorte que a Btech vê no app original:
//  - sem frete dos CT-e, sem frete pela metodologia e sem a conferência entre
//    os dois (a diferença CT-e × metodologia entra somada na divergência, como
//    o app fazia para quem só consulta);
//  - sem motivos de desvio, histórico de alterações e nomes da equipe;
//  - sem observações de acertos; sem viagens canceladas.

/** Empresas do portal (como na Programação) que enxergam o KM Exato. */
export function isBtechClient(clientName: string) {
  return /^BTECH\b/i.test(clientName.trim());
}

export interface PortalPayload {
  state: KmState; // cfg + acertos + abonos (viag e hist vazios: as viagens vão em trips)
  trips: KmTrip[];
  generatedAt: string;
}

export function sanitizeForPortal(E: KmEngine): PortalPayload {
  const S = E.S;
  const trips: KmTrip[] = E.trips()
    .filter((t) => t.status !== "cancelada")
    .map((t) => ({
      id: t.id,
      hist: t.hist,
      placa: t.placa,
      tipo: t.tipo,
      carreg: t.carreg,
      kmEst: t.kmEst,
      kmFat: t.kmFat,
      kmReal: t.kmReal,
      kmRota: t.kmRota,
      kmComp: t.kmComp,
      compRS: t.compRS,
      vkm: t.vkm,
      cc: t.cc,
      metodo: t.metodo,
      previsto: null,
      fCte: null,
      difFat: 0,
      // Diferença do spot é controle interno (não é saldo do contrato).
      difKm: t.modo === "spot" ? null : t.difKm,
      difKmRS: t.modo === "spot" ? null : t.difKmRS,
      difRS: t.difRS,
      opKm: t.opKm,
      // Divergência para quem consulta: inclui o ajuste do CT-e (como o app).
      opRS: t.opRS != null ? r2(t.opRS + (t.difFat || 0)) : null,
      dst: t.dst,
      ne: t.ne,
      status: t.status,
      modo: t.modo,
      ctl: t.ctl,
      origem: t.origem ?? null,
      rotaNome: t.rotaNome ?? null,
      odoSaida: t.odoSaida ?? null,
      odoChegada: t.odoChegada ?? null,
      entregas: (t.entregas || []).map((e) => ({
        id: e.id,
        cliente: e.cliente,
        nf: e.nf,
        cte: e.cte,
        peso: e.peso,
        freteCte: null,
        entregue: e.entregue,
        comp: { env: Boolean(e.comp?.env), em: e.comp?.env ? e.comp?.em ?? null : null },
        // Só o necessário para abrir as fotos pela rota /api/portal/foto.
        ...(e.proof ? { proof: { id: e.proof.id, scheduleId: "", destination: "", at: e.proof.at, photos: e.proof.photos, emailedAt: null } } : {}),
      })),
    }));
  return {
    state: {
      cfg: {
        regras: { ...S.cfg.regras, kmMinPolitica: "registrar" },
        tipos: S.cfg.tipos,
        frota: S.cfg.frota,
        tarifas: S.cfg.tarifas.map((t) => ({
          id: t.id,
          desde: t.desde,
          metodo: t.metodo,
          ref: null,
          v: Object.fromEntries(Object.entries(t.v).map(([k, v]) => [k, { km: v.km, cc: v.cc ?? 0 }])),
        })),
        rotas: [],
      },
      hist: [],
      viag: {},
      acertos: S.acertos.map((a) => ({ id: a.id, data: a.data, placa: a.placa, pagoPara: null, valor: null, efeito: E.acEf(a), obs: null })),
      abonos: Object.fromEntries(Object.entries(S.abonos).map(([k]) => [k, { motivo: "" }])),
    },
    trips,
    generatedAt: new Date().toISOString(),
  };
}

export function portalEngine(p: PortalPayload) {
  return new KmEngine(p.state, p.trips);
}
