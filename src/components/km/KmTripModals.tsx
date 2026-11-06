"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";
import { KmEngine, median, r2, rkey, todayISO, type KmTrip } from "@/lib/kmExato/engine";
import { MOTIVOS, brl, dBR, km, nf, parseNum, pct, sbrl, skm, ton } from "@/lib/kmExato/format";
import { createTrip, tripLog, updateTrip, type DeliveryInput } from "@/lib/kmExato/actions";
import { parseXml } from "@/lib/kmExato/xml";
import { Pill, Plate, Signed } from "./KmUi";
import { ProofModal } from "@/components/DeliveryProofDestinations";

// Janelas de viagem do KM Exato: detalhes, nova/editar, fechar na volta e
// motivo do desvio. Mesmas regras e textos do app original.

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:bg-navy-50";
const bigCls = `${inputCls} font-mono text-lg font-semibold`;
const labelCls = "mb-1 block text-sm font-medium text-navy-700";
const noteCls = "rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-700";
const noteRisk = "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800";
const noteOk = "rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900";
const noteWarn = "rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900";

interface Common {
  engine: KmEngine;
  userName: string | null;
  isAdmin: boolean;
  onChanged: () => void;
}

function Kv({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-lg border border-navy-200 bg-white px-3 py-2">
          <div className="text-[11px] text-navy-500">{k}</div>
          <div className="font-mono text-sm font-semibold text-navy-900">{v}</div>
        </div>
      ))}
    </div>
  );
}

function CopyBox({ text }: { text: string }) {
  const { toastInfo } = useFeedback();
  return (
    <div className={noteCls}>
      <b>Observação para o CT-e</b>
      <div className="my-2 select-all rounded-md border border-navy-200 bg-white px-3 py-2 font-mono text-xs text-navy-900">{text}</div>
      <button
        type="button"
        className={buttonClasses("secondary", "sm")}
        onClick={() => navigator.clipboard?.writeText(text).then(() => toastInfo("Texto copiado."), () => toastInfo("Selecione o texto e use Ctrl+C."))}
      >
        Copiar texto
      </button>
    </div>
  );
}

// ======================================================================
// Detalhes
// ======================================================================
export function TripDetailModal({ id, onClose, onEdit, onCloseTrip, onMotivo, ...c }: Common & {
  id: string;
  onClose: () => void;
  onEdit: (id: string) => void;
  onCloseTrip: (id: string) => void;
  onMotivo: (id: string) => void;
}) {
  const { engine: E, isAdmin } = c;
  const { toastError, confirm: askConfirm } = useFeedback();
  const t = E.trips().find((x) => x.id === id) ?? null;
  const [log, setLog] = useState<{ at: string; by_name: string | null; action: string }[]>([]);
  const [proofOpen, setProofOpen] = useState<{ scheduleId: string; destination: string } | null>(null);
  useEffect(() => {
    if (!t || t.hist) return;
    tripLog(id).then(setLog).catch(() => setLog([]));
  }, [id, t]);
  if (!t) return null;

  const es = t.entregas || [];
  const pes = es.reduce((a, e) => a + (+(e.peso ?? 0) || 0), 0);
  const lim = +E.R().limite || 0.1;
  const w = !t.hist;

  async function cancelTrip() {
    if (!(await askConfirm("Cancelar esta viagem? Ela sai do saldo e da produtividade.", { confirmLabel: "Cancelar viagem" }))) return;
    try {
      await updateTrip(id, { status: "cancelada" }, "Viagem cancelada", c.userName);
      c.onChanged();
      onClose();
    } catch (e) {
      toastError((e as Error).message);
    }
  }
  async function reopen() {
    if (!(await askConfirm("Reabrir esta viagem para correção? O saldo dela sai do total até fechar de novo.", { confirmLabel: "Reabrir" }))) return;
    try {
      await updateTrip(id, { status: "aberta", closed_at: null }, "Viagem reaberta para correção (diferença antes: " + sbrl(t!.difRS) + ")", c.userName);
      c.onChanged();
    } catch (e) {
      toastError((e as Error).message);
    }
  }

  const op = t.opRS != null ? (isAdmin ? t.opRS : r2(t.opRS + (t.difFat || 0))) : null;
  return (
    <Modal onClose={onClose} labelledBy="km-trip-title" className="max-w-3xl">
      <div className="flex flex-col gap-4">
        <div>
          <h2 id="km-trip-title" className="flex items-center gap-2 text-lg font-semibold text-navy-900">
            <Plate plate={t.placa} />
            {t.cavalo && <span className="text-sm font-normal text-navy-500">cavalo {t.cavalo}</span>}
          </h2>
          <p className="text-sm text-navy-500">
            {E.tipoNome(t.tipo)} · carregamento {dBR(t.carreg)} · {t.status === "aberta" ? "em aberto" : t.status === "cancelada" ? "cancelada" : "fechada"}
          </p>
        </div>

        {t.ctl ? (
          <>
            <Kv
              items={[
                ["Km estimado", km(t.kmRota)],
                ["Compensação de saldo", t.kmComp ? skm(t.kmComp) + " km" : "—"],
                ["Km faturado", km(t.kmFat)],
                ["Km rodado", km(t.kmReal)],
                ["Odômetro saída", km(t.odoSaida)],
                ["Odômetro chegada", km(t.odoChegada)],
                ["Valor do km", t.vkm ? nf(t.vkm, 4) : "—"],
                ["Saldo da viagem", t.difRS != null ? <Signed v={t.difRS} /> : "na volta"],
              ]}
            />
            {t.status === "fechada" && t.difRS != null ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-navy-100">
                  <tr>
                    <td className="py-1.5 text-navy-700">Divergência · {km(t.kmRota)} km estimados − {km(t.kmReal)} km rodados = {skm(t.opKm)} km</td>
                    <td className="py-1.5 text-right"><Signed v={op} /></td>
                  </tr>
                  {t.kmComp ? (
                    <tr>
                      <td className="py-1.5 text-navy-700">Compensação de saldo · {skm(t.kmComp)} km no faturado</td>
                      <td className="py-1.5 text-right"><Signed v={t.compRS} /></td>
                    </tr>
                  ) : null}
                  {isAdmin && Math.abs(t.difFat || 0) > 0.004 && (
                    <tr>
                      <td className="py-1.5 text-navy-700">CT-e {brl(t.fCte ?? 0)} × metodologia {brl(t.previsto ?? 0)} <span className="text-xs text-navy-500">(só admin)</span></td>
                      <td className="py-1.5 text-right"><Signed v={t.difFat} /></td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-navy-200 font-semibold">
                    <td className="py-1.5">Saldo da viagem</td>
                    <td className="py-1.5 text-right"><Signed v={t.difRS} strong /></td>
                  </tr>
                </tfoot>
              </table>
            ) : t.kmComp && t.compRS ? (
              <p className={noteCls}>A compensação de {skm(t.kmComp)} km ({sbrl(t.compRS)}) entra no saldo da placa no fechamento da viagem.</p>
            ) : null}
            {t.kmComp && !t.hist && t.kmRota != null ? <CopyBox text={E.cteObs(t.placa, t.kmRota, t.kmComp)} /> : null}
          </>
        ) : (
          <>
            <Kv items={[["Operação", t.modo === "spot" ? "Spot" : "Rota do contrato"], ["Km faturado", km(t.kmFat)], ["Entregas", String(es.length)], ["Peso", ton(pes)]]} />
            <p className={noteCls}>
              {t.modo === "spot" ? (
                "Veículo spot: km faturado pela estimativa, sem controle de saldo."
              ) : (
                <>
                  <b>{t.rotaNome || "Rota do contrato"}</b>: km pré-estabelecido no contrato, sem controle de saldo. O km soma na produtividade mínima do veículo.
                </>
              )}
            </p>
          </>
        )}

        {isAdmin && !t.hist && t.previsto != null && (
          <p className={noteCls}>
            Frete pela metodologia <span className="text-xs text-navy-500">(só admin)</span>: <b>{brl(t.previsto)}</b> = {km(t.kmFat)} km × {nf(t.vkm ?? 0, 4)}
            {t.cc ? " + CC " + nf(t.cc, 2) : ""}
            {t.fCte != null && (
              <>
                {" "}· CT-e <b>{brl(t.fCte)}</b>{" "}
                {Math.abs(t.fCte - t.previsto) <= 1 ? <Pill tone="ok">confere</Pill> : <Pill tone="risk">{sbrl(r2(t.fCte - t.previsto))}</Pill>}
              </>
            )}
          </p>
        )}

        {t.ctl && t.motivo && (
          <p className={noteCls}>
            <b>Motivo do desvio:</b> {t.motivo}
            {t.motivoObs ? " · " + t.motivoObs : ""}
          </p>
        )}
        {t.ctl && !t.motivo && !t.hist && t.status === "fechada" && t.kmRota && t.opKm != null && Math.abs(t.opKm / t.kmRota) > lim && (
          <div className={`${noteWarn} flex flex-wrap items-center gap-2`}>
            Desvio de {pct(-t.opKm / t.kmRota, 0)} entre o km rodado e o km estimado, sem motivo.
            <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => onMotivo(id)}>
              Registrar motivo
            </button>
          </div>
        )}

        {t.hist ? (
          <p className={noteCls}>Viagem do controle anterior. Destinos: {t.dst}</p>
        ) : (
          <>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-navy-900">Entregas</h3>
              {es.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-navy-500">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Cliente / destino</th>
                        <th className="py-1 pr-3 font-medium">NF</th>
                        <th className="py-1 pr-3 font-medium">CT-e</th>
                        <th className="py-1 pr-3 text-right font-medium">Peso</th>
                        <th className="py-1 font-medium">Situação</th>
                        <th className="py-1 font-medium">Comprovante</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-100">
                      {es.map((e) => {
                        const st = E.compStatus(e);
                        return (
                          <tr key={e.id}>
                            <td className="py-1.5 pr-3 text-navy-900">{e.cliente}</td>
                            <td className="py-1.5 pr-3 font-mono">{e.nf || "—"}</td>
                            <td className="py-1.5 pr-3 font-mono">{e.cte || "—"}</td>
                            <td className="py-1.5 pr-3 text-right">{ton(+(e.peso ?? 0) || 0)}</td>
                            <td className="py-1.5">
                              {!e.entregue ? (
                                <Pill tone="mute">em trânsito</Pill>
                              ) : st === "enviado" ? (
                                <Pill tone="ok">{e.comp.antes ? "controle anterior" : (e.comp.auto ? "enviado por e-mail " : "comprovante enviado ") + dBR(e.comp.em ?? null)}</Pill>
                              ) : st === "atrasado" ? (
                                <Pill tone="risk">comprovante atrasado</Pill>
                              ) : (
                                <Pill tone="ok">comprovante no prazo</Pill>
                              )}
                              {e.entregueAuto && <span className="mt-0.5 block text-[11px] text-navy-500">entregue {dBR(e.entregue)} pelo comprovante</span>}
                            </td>
                            <td className="py-1.5">
                              {e.proof ? (
                                <button type="button" className={buttonClasses("soft", "sm")} onClick={() => setProofOpen({ scheduleId: e.proof!.scheduleId, destination: e.proof!.destination })}>
                                  Ver comprovante
                                </button>
                              ) : (
                                <span className="text-xs text-navy-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-navy-500">Sem entregas.</p>
              )}
            </div>
            {log.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-navy-900">Histórico de alterações</h3>
                <ul className="divide-y divide-dashed divide-navy-200 text-xs">
                  {log.map((l, i) => (
                    <li key={i} className="grid grid-cols-[110px_1fr] gap-3 py-1.5">
                      <time className="font-mono text-navy-500">{new Date(l.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time>
                      <span className="text-navy-800">
                        {l.action}
                        {l.by_name ? <span className="text-navy-500"> · {l.by_name}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {w && t.status === "aberta" && (
            <>
              <button type="button" className={buttonClasses("danger", "md")} onClick={cancelTrip}>Cancelar viagem</button>
              <button type="button" className={buttonClasses("secondary", "md")} onClick={() => onEdit(id)}>Editar</button>
              <button type="button" className={buttonClasses("primary", "md")} onClick={() => onCloseTrip(id)}>Fechar viagem</button>
            </>
          )}
          {w && t.status === "fechada" && isAdmin && (
            <button type="button" className={buttonClasses("secondary", "md")} onClick={reopen}>Reabrir para correção</button>
          )}
          <button type="button" className={buttonClasses("secondary", "md")} onClick={onClose}>Voltar</button>
        </div>
      </div>
      {proofOpen && (
        <ProofModal
          scheduleId={proofOpen.scheduleId}
          destination={proofOpen.destination}
          canDelete
          onClose={() => setProofOpen(null)}
          onChanged={c.onChanged}
          onEmailed={c.onChanged}
        />
      )}
    </Modal>
  );
}

// ======================================================================
// Nova / editar viagem
// ======================================================================
interface Ent { id?: string; cliente: string; nf: string; cte: string; peso: string; freteCte: number | null; src?: string; delivered_on?: string | null; proof_sent?: boolean; proof_sent_at?: string | null; proof_before?: boolean; proof_file?: string | null }

export function TripFormModal({ id, onClose, onSaved, ...c }: Common & { id: string | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { engine: E, isAdmin } = c;
  const { toastError, toastSuccess } = useFeedback();
  const v = id ? E.S.viag[id] : null;
  const md0 = v ? v.modo || "dedicado" : "dedicado";
  const [modo, setModo] = useState<"dedicado" | "rota" | "spot">(md0);
  const [placa, setPlaca] = useState<string | null>(v ? (md0 === "spot" ? "__spot" : v.placa) : null);
  const [spotPlaca, setSpotPlaca] = useState(md0 === "spot" && v ? v.placa : "");
  const [spotTipo, setSpotTipo] = useState(md0 === "spot" && v ? v.tipo ?? "" : "");
  const [rotaNome, setRotaNome] = useState<string | null>(v?.rotaNome ?? null);
  const [carreg, setCarreg] = useState(v ? v.carreg : todayISO());
  const [kmEst, setKmEst] = useState(v?.kmEst != null ? String(v.kmEst) : "");
  const [kmComp, setKmComp] = useState(() => {
    if (!v || md0 !== "dedicado" || v.kmFat == null) return "";
    const r = E.rotaOf(v);
    return r != null && Math.round(v.kmFat - r) ? String(Math.round(v.kmFat - r)) : "";
  });
  const [odo, setOdo] = useState(v?.odoSaida != null ? String(v.odoSaida) : "");
  const [odoAuto, setOdoAuto] = useState(false);
  const [ents, setEnts] = useState<Ent[]>(
    (v?.entregas ?? []).map((e) => ({
      id: e.id, cliente: e.cliente, nf: e.nf ?? "", cte: e.cte ?? "", peso: e.peso != null ? String(e.peso) : "", freteCte: e.freteCte,
      delivered_on: e.entregue, proof_sent: e.comp.env, proof_sent_at: e.comp.em ?? null, proof_before: e.comp.antes ?? false, proof_file: e.comp.arq ?? null,
    }))
  );
  const [docMsg, setDocMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const R = E.R();
  const fator = +R.fator || 1;
  const kmEstN = parseNum(kmEst);
  const compN = (() => {
    const x = kmComp.replace(/\s/g, "").replace("−", "-");
    return x === "" || x === "-" ? 0 : Math.round(+x.replace(/\./g, "").replace(",", ".")) || 0;
  })();
  const comp = modo === "dedicado" ? compN : 0;
  const rota = kmEstN != null ? (modo === "dedicado" ? Math.round(kmEstN * fator) : Math.round(kmEstN)) : null;
  const kmFat = rota != null ? rota + comp : null;
  const realPlate = placa === "__spot" ? spotPlaca.replace(/[^A-Z0-9]/gi, "").toUpperCase() : placa;

  // Odômetro de saída puxado da última chegada da placa.
  useEffect(() => {
    if (!placa || placa === "__spot") return;
    const lo = E.lastOdo(placa);
    if (lo && (!odo || odoAuto)) {
      queueMicrotask(() => {
        setOdo(String(lo));
        setOdoAuto(true);
      });
    }
  }, [placa]); // eslint-disable-line react-hooks/exhaustive-deps

  const cctx = placa && modo === "dedicado" && placa !== "__spot" ? E.compCtx(placa, carreg, id) : null;
  const cerr = modo === "dedicado" && placa && placa !== "__spot" ? E.compErr(cctx, comp) : null;
  const tar = placa && placa !== "__spot" ? E.tarFor(E.tipoOf(placa), carreg || todayISO()) : null;

  // Sugestão de km pela mediana da mesma rota (mesmo conjunto de destinos).
  const routeKey = rkey(ents.map((e) => e.cliente));
  const routeKms = routeKey ? E.routeIndex()[routeKey] : undefined;
  const routeSug = routeKms ? { km: Math.round(median(routeKms)!), n: routeKms.length } : null;

  function pickRoute(i: number | null) {
    if (i === null) {
      setModo("dedicado");
      setRotaNome(null);
      return;
    }
    const r = E.S.cfg.rotas[i];
    setModo("rota");
    setRotaNome(r.nome);
    setKmEst(String(r.km));
    setKmComp("");
  }

  async function ingest(files: FileList | null) {
    if (!files) return;
    const xs = Array.from(files).filter((f) => /\.xml$/i.test(f.name) || /xml/.test(f.type));
    const imgs = Array.from(files).filter((f) => /^image\//.test(f.type));
    const parsed = (await Promise.all(xs.map((f) => f.text().then(parseXml)))).filter(Boolean) as NonNullable<ReturnType<typeof parseXml>>[];
    const dates: string[] = [];
    setEnts((prev) => {
      const list = prev.slice();
      parsed.forEach((x) => {
        const dup = list.find((e) => (x.cte && e.cte === x.cte) || (x.nf && e.nf === x.nf));
        const e: Ent = dup ?? { cliente: "", nf: "", cte: "", peso: "", freteCte: null };
        e.cliente = x.cliente || e.cliente;
        e.nf = x.nf || e.nf;
        e.cte = x.cte || e.cte;
        if (x.peso != null) e.peso = String(Math.round(x.peso));
        if (x.frete != null) e.freteCte = x.frete;
        e.src = "lido do XML";
        if (!dup) list.push(e);
        if (x.data) dates.push(x.data);
      });
      return list.filter((e) => e.cliente || e.nf || e.cte);
    });
    if (dates.length && !id) setCarreg(dates.sort()[0]);
    const out = xs.length ? `${parsed.length} de ${xs.length} XML lidos.` : "";
    setDocMsg(
      imgs.length
        ? { tone: "warn", text: `${out} Leitura por foto ainda não está disponível no CotaFlow. Use os XML ou preencha à mão.` }
        : out
          ? { tone: "ok", text: out }
          : null
    );
  }

  function setEnt(i: number, k: keyof Ent, val: string) {
    setEnts((l) => l.map((e, j) => (j === i ? { ...e, [k]: val } : e)));
  }

  async function submit() {
    const sp = modo === "spot";
    const err = !placa
      ? "Escolha a placa."
      : sp && !/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(realPlate ?? "")
        ? "Informe a placa do veículo spot."
        : sp && !spotTipo
          ? "Escolha o equipamento do spot."
          : !carreg
            ? "Informe a data do carregamento."
            : !(kmEstN != null && kmEstN > 0)
              ? "Informe o km."
              : !(kmFat != null && kmFat > 0)
                ? "Confira o km faturado."
                : (modo === "dedicado" && cerr) || (!ents.some((e) => e.cliente.trim()) ? "Informe ao menos uma entrega." : null);
    if (err) {
      toastError(err);
      return;
    }
    const deliveries: DeliveryInput[] = ents
      .filter((e) => e.cliente.trim())
      .map((e) => ({
        id: e.id,
        client: e.cliente.trim().toUpperCase(),
        nf: e.nf.trim() || null,
        cte: e.cte.trim() || null,
        weight_kg: parseNum(e.peso),
        freight_cte: e.freteCte,
        delivered_on: e.delivered_on ?? null,
        proof_sent: e.proof_sent ?? false,
        proof_sent_at: e.proof_sent_at ?? null,
        proof_before: e.proof_before ?? false,
        proof_file: e.proof_file ?? null,
      }));
    const data = {
      plate: realPlate!,
      type_id: sp ? spotTipo : E.tipoOf(realPlate!),
      mode: modo,
      route_name: modo === "rota" ? rotaNome : null,
      loaded_on: carreg,
      km_est: kmEstN,
      km_route: rota,
      km_comp: modo === "dedicado" ? comp : 0,
      km_billed: kmFat,
      odo_out: sp ? null : parseNum(odo),
    };
    setSaving(true);
    try {
      if (id && v) {
        const ch: string[] = [];
        const old: Record<string, unknown> = { placa: v.placa, modo: v.modo ?? "dedicado", carreg: v.carreg, kmEst: v.kmEst, kmComp: v.kmComp ?? 0, kmFat: v.kmFat, odoSaida: v.odoSaida };
        const neu: Record<string, unknown> = { placa: data.plate, modo: data.mode, carreg: data.loaded_on, kmEst: data.km_est, kmComp: data.km_comp, kmFat: data.km_billed, odoSaida: data.odo_out };
        Object.keys(old).forEach((k) => {
          if (old[k] !== neu[k]) ch.push(`${k}: ${old[k] ?? "—"} → ${neu[k] ?? "—"}`);
        });
        await updateTrip(id, data, "Viagem editada" + (ch.length ? ": " + ch.join("; ") : ""), c.userName, deliveries);
        toastSuccess("Viagem atualizada.");
        c.onChanged();
        onSaved(id);
      } else {
        const action =
          (sp ? "Viagem spot lançada: " : modo === "rota" ? "Viagem aberta (rota do contrato): " : "Viagem aberta: ") +
          data.plate + " · " + km(kmFat) + " km faturados" +
          (comp ? ` (${km(rota)} estimados ${comp > 0 ? "+ " : "− "}${km(Math.abs(comp))} de compensação de saldo)` : "");
        const newId = await createTrip({ ...data, status: sp ? "fechada" : "aberta" }, deliveries, action, c.userName);
        toastSuccess(sp ? "Viagem spot lançada." : "Viagem aberta.");
        c.onChanged();
        onSaved(newId);
      }
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const cteSum = ents.reduce((a, e) => a + (e.freteCte || 0), 0);
  const prev = tar && kmFat && kmFat > 0 ? r2(kmFat * tar.km + tar.cc) : null;
  const showObs = modo === "dedicado" && comp && !cerr && rota != null && realPlate;

  return (
    <Modal onClose={onClose} labelledBy="km-form-title" className="max-w-3xl">
      <div className="flex flex-col gap-5">
        <div>
          <h2 id="km-form-title" className="text-lg font-semibold text-navy-900">{id ? "Editar viagem" : "Nova viagem"}</h2>
          <p className="text-sm text-navy-500">{id ? `${v?.placa} · ${dBR(v?.carreg)}` : "Preencha no carregamento. Na volta, só o odômetro."}</p>
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-navy-900">1 · Documentos da viagem</h3>
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 ${over ? "border-brand-500 bg-brand-50" : "border-navy-300 bg-navy-50"}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              ingest(e.dataTransfer.files);
            }}
          >
            <span className="text-sm">
              <b className="block text-navy-900">Solte aqui os XML dos CT-e (ou das NF-e), ou clique para escolher</b>
              <span className="text-navy-500">Entregas, NF, CT-e, peso e frete entram sozinhos.</span>
            </span>
            <input ref={fileRef} type="file" multiple accept=".xml,text/xml,application/xml" hidden onChange={(e) => { ingest(e.target.files); e.target.value = ""; }} />
          </label>
          {docMsg && <p className={docMsg.tone === "ok" ? noteOk : noteWarn}>{docMsg.text}</p>}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-navy-900">2 · Veículo</h3>
          <div className="flex flex-wrap gap-2">
            {E.frota().map((f) => (
              <button
                key={f.placa}
                type="button"
                onClick={() => {
                  setPlaca(f.placa);
                  if (modo === "spot") setModo("dedicado");
                }}
                className={`min-w-28 rounded-lg border px-3 py-2 text-left ${placa === f.placa ? "border-brand-600 bg-brand-50 text-brand-800" : "border-navy-300 hover:bg-navy-50"}`}
              >
                <b className="block font-mono text-sm tracking-wide">{f.placa}</b>
                <small className="text-xs text-navy-500">{E.tipoNome(f.tipo)}</small>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setPlaca("__spot");
                setModo("spot");
                setRotaNome(null);
              }}
              className={`min-w-28 rounded-lg border border-dashed px-3 py-2 text-left ${placa === "__spot" ? "border-brand-600 bg-brand-50 text-brand-800" : "border-navy-300 hover:bg-navy-50"}`}
            >
              <b className="block text-sm">Spot</b>
              <small className="text-xs text-navy-500">veículo não dedicado</small>
            </button>
          </div>
          {modo === "spot" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="km-spot-placa">Placa do veículo spot</label>
                <input id="km-spot-placa" className={`${inputCls} uppercase`} value={spotPlaca} onChange={(e) => setSpotPlaca(e.target.value.toUpperCase())} placeholder="ABC1D23" />
              </div>
              <div>
                <label className={labelCls} htmlFor="km-spot-tipo">Equipamento</label>
                <select id="km-spot-tipo" className={inputCls} value={spotTipo} onChange={(e) => setSpotTipo(e.target.value)}>
                  <option value="">Escolha</option>
                  {E.tipos().map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="km-carreg">Data do carregamento</label>
              <input id="km-carreg" type="date" className={inputCls} value={carreg} onChange={(e) => setCarreg(e.target.value)} />
            </div>
            {modo !== "spot" && (
              <div>
                <label className={labelCls} htmlFor="km-odo">
                  Odômetro na saída{" "}
                  <span className="font-normal text-navy-500">
                    {!placa || placa === "__spot" ? "· escolha a placa" : E.lastOdo(placa) ? "· puxado da última chegada desta placa" : "· sem chegada anterior registrada"}
                  </span>
                </label>
                <input id="km-odo" inputMode="numeric" className={bigCls} value={odo} onChange={(e) => { setOdo(e.target.value); setOdoAuto(false); }} />
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-navy-900">3 · Entregas</h3>
          {ents.length === 0 ? (
            <p className={noteCls}>Solte os XML acima ou use “Adicionar entrega”.</p>
          ) : (
            ents.map((e, i) => (
              <div key={i}>
                <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[2.2fr_1fr_1fr_0.9fr_auto]">
                  <div className="col-span-2 sm:col-span-1">
                    {i === 0 && <label className={labelCls} htmlFor={`km-ent-c-${i}`}>Cliente / destino</label>}
                    <input id={`km-ent-c-${i}`} list="km-clients" className={inputCls} value={e.cliente} onChange={(ev) => setEnt(i, "cliente", ev.target.value)} placeholder="Ex.: BRF - TOLEDO" />
                  </div>
                  <div>
                    {i === 0 && <label className={labelCls} htmlFor={`km-ent-nf-${i}`}>NF</label>}
                    <input id={`km-ent-nf-${i}`} inputMode="numeric" className={inputCls} value={e.nf} onChange={(ev) => setEnt(i, "nf", ev.target.value)} />
                  </div>
                  <div>
                    {i === 0 && <label className={labelCls} htmlFor={`km-ent-cte-${i}`}>CT-e</label>}
                    <input id={`km-ent-cte-${i}`} inputMode="numeric" className={inputCls} value={e.cte} onChange={(ev) => setEnt(i, "cte", ev.target.value)} />
                  </div>
                  <div>
                    {i === 0 && <label className={labelCls} htmlFor={`km-ent-p-${i}`}>Peso (kg)</label>}
                    <input id={`km-ent-p-${i}`} inputMode="numeric" className={inputCls} value={e.peso} onChange={(ev) => setEnt(i, "peso", ev.target.value)} />
                  </div>
                  <button type="button" className={buttonClasses("danger", "compact")} onClick={() => setEnts((l) => l.filter((_, j) => j !== i))} aria-label="Remover entrega">
                    Remover
                  </button>
                </div>
                {e.src && (
                  <p className="mt-0.5 text-xs text-navy-500">
                    {e.src}
                    {e.freteCte != null ? " · frete CT-e " + brl(e.freteCte) : ""}
                  </p>
                )}
              </div>
            ))
          )}
          <datalist id="km-clients">
            {Array.from(new Set([...Object.values(E.S.viag).flatMap((x) => x.entregas.map((e) => e.cliente)), ...E.S.hist.flatMap((h) => h.viagens.flatMap((x) => (x.dst ?? "").split(" · ")))]))
              .filter(Boolean)
              .sort()
              .map((cl) => (
                <option key={cl} value={cl} />
              ))}
          </datalist>
          <div>
            <button type="button" className={buttonClasses("secondary", "compact")} onClick={() => setEnts((l) => [...l, { cliente: "", nf: "", cte: "", peso: "", freteCte: null }])}>
              Adicionar entrega
            </button>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-navy-900">4 · Quilometragem</h3>
          {modo !== "spot" && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => pickRoute(null)} className={`max-w-64 rounded-lg border px-3 py-1.5 text-left ${modo === "dedicado" ? "border-brand-600 bg-brand-50 text-brand-800" : "border-navy-300 hover:bg-navy-50"}`}>
                <b className="block text-sm">Rota livre</b>
                <small className="text-xs opacity-75">km estimado, com controle de saldo</small>
              </button>
              {E.S.cfg.rotas.map((r, i) => (
                <button key={i} type="button" onClick={() => pickRoute(i)} className={`max-w-64 rounded-lg border px-3 py-1.5 text-left ${modo === "rota" && rotaNome === r.nome ? "border-brand-600 bg-brand-50 text-brand-800" : "border-navy-300 hover:bg-navy-50"}`}>
                  <b className="block text-sm">{km(r.km)} km</b>
                  <small className="text-xs opacity-75">{r.nome}</small>
                </button>
              ))}
            </div>
          )}
          {modo === "rota" && <p className={noteCls}>Rota do contrato: km pré-estabelecido, sem controle de saldo. Soma na produtividade mínima do veículo.</p>}
          {modo === "spot" && <p className={noteCls}>Spot: lance só o km usado no faturamento. Sem odômetro e sem controle de saldo.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="km-est">
                {modo === "spot" ? "Km faturado (estimado, ida + volta)" : modo === "rota" ? "Km do contrato" : "Km estimado (ida + volta)"}{" "}
                <span className="font-normal text-navy-500">
                  · rota no{" "}
                  <a href="https://qualp.com.br/#/" target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">QualP</a>, da base até a base
                </span>
              </label>
              <input id="km-est" inputMode="numeric" className={bigCls} value={kmEst} disabled={modo === "rota"} onChange={(e) => setKmEst(e.target.value)} />
              {routeSug && modo !== "rota" && (
                <button type="button" onClick={() => setKmEst(String(routeSug.km))} className="mt-1.5 rounded-lg border border-dashed border-navy-300 px-2.5 py-1 text-left text-xs text-navy-700 hover:border-brand-500">
                  Esta rota já rodou <b className="font-mono">{km(routeSug.km)}</b> km estimados · {routeSug.n} viage{routeSug.n > 1 ? "ns" : "m"}
                </button>
              )}
            </div>
            {modo === "dedicado" && (
              <div>
                <label className={labelCls} htmlFor="km-comp">
                  Compensação de saldo (km) <span className="font-normal text-navy-500">· km a mais ou a menos no faturado, só para quitar saldo desta placa</span>
                </label>
                <input id="km-comp" inputMode="numeric" className={bigCls} value={kmComp} onChange={(e) => setKmComp(e.target.value)} placeholder="0" />
                {cctx && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-navy-700">
                    <span className="inline-flex items-center gap-1">
                      Saldo da placa <Signed v={cctx.net} />
                      {Math.abs(cctx.pend) > 0.004 && <span className="text-navy-500">(com {sbrl(cctx.pend)} de viagem aberta)</span>}
                    </span>
                    {cctx.dir !== 0 && cctx.sug !== 0 && (
                      <button type="button" onClick={() => setKmComp(String(cctx.sug))} className="rounded-lg border border-brand-300 bg-brand-50 px-2 py-0.5 text-brand-800">
                        Compensar <b className="font-mono">{skm(cctx.sug)} km</b> · {sbrl(r2(cctx.sug * cctx.vkm))}
                      </button>
                    )}
                    {comp !== 0 && (
                      <button type="button" onClick={() => setKmComp("")} className="rounded-lg border border-navy-300 px-2 py-0.5">Sem compensação</button>
                    )}
                  </div>
                )}
                {cerr ? <p className={`${noteRisk} mt-1.5`}>{cerr}</p> : comp && cctx ? <p className={`${noteOk} mt-1.5`}>Saldo da placa depois desta compensação: <b>{sbrl(r2(cctx.net + comp * cctx.vkm))}</b>.</p> : null}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-baseline gap-3 rounded-lg border border-navy-200 bg-navy-50 px-4 py-3">
            <span className="text-sm font-semibold text-navy-900">Km faturado · vai no CT-e</span>
            <b className="font-mono text-2xl text-navy-900">{kmFat != null ? km(kmFat) + " km" : "—"}</b>
            <small className="text-sm text-navy-500">
              {rota == null ? "" : fator !== 1 ? `estimado × ${nf(fator, 3)}` : comp ? `${km(rota)} estimados ${comp > 0 ? "+ " : "− "}${km(Math.abs(comp))} de compensação` : "igual ao km estimado"}
            </small>
          </div>
          {modo !== "spot" && isAdmin && (
            !tar || !(kmFat && kmFat > 0) ? (
              <p className={noteCls}>Escolha a placa e informe o km para ver o frete pela metodologia.</p>
            ) : (
              <>
                <Kv items={[["Valor do km", nf(tar.km, 4)], ["CC por viagem", tar.cc ? nf(tar.cc, 2) : "—"], ["Frete previsto", nf(prev!, 2)], ["Tabela", dBR(tar.desde)]]} />
                {cteSum > 0 && (
                  <p className={Math.abs(cteSum - prev!) <= 1 ? noteOk : noteRisk}>
                    Frete nos CT-e: <b>{brl(cteSum)}</b> ·{" "}
                    {Math.abs(cteSum - prev!) <= 1 ? "confere com a metodologia." : `diferença de ${sbrl(r2(cteSum - prev!))} para a metodologia. Confira o km faturado ou o CT-e.`}
                  </p>
                )}
              </>
            )
          )}
          {showObs ? <CopyBox text={E.cteObs(realPlate!, rota!, comp)} /> : null}
        </section>

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={buttonClasses("secondary", "md")} onClick={onClose}>Cancelar</button>
          <button type="button" disabled={saving} className={buttonClasses("primary", "md")} onClick={submit}>
            {saving ? "Salvando..." : id ? "Salvar alterações" : modo === "spot" ? "Lançar viagem spot" : "Abrir viagem"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ======================================================================
// Fechar viagem (volta)
// ======================================================================
export function CloseTripModal({ id, onClose, onDone, ...c }: Common & { id: string; onClose: () => void; onDone: (id: string) => void }) {
  const { engine: E } = c;
  const { toastError, toastSuccess } = useFeedback();
  const v = E.S.viag[id];
  const tp = v.tipo || E.tipoOf(v.placa);
  const t = E.tarFor(tp, v.carreg);
  const rota = E.rotaOf(v);
  const isRota = v.modo === "rota";
  const [sai, setSai] = useState(v.odoSaida != null ? String(v.odoSaida) : "");
  const [che, setChe] = useState(v.odoChegada != null ? String(v.odoChegada) : "");
  const [fat, setFat] = useState(v.kmFat != null ? String(v.kmFat) : rota != null ? String(rota) : "");
  const [motivo, setMotivo] = useState("");
  const [motivoObs, setMotivoObs] = useState("");
  const [saving, setSaving] = useState(false);

  const s = parseNum(sai);
  const ch = parseNum(che);
  const f = parseNum(fat);
  const ok = !isRota && s != null && ch != null && f != null && f > 0 && ch > s && !!t;
  const fc = E.ctes(v);
  const adj = ok && t!.metodo === "piso" && fc != null ? r2(fc - (f! * t!.km + t!.cc)) : 0;
  const real = ok ? ch! - s! : null;
  const dk = ok ? f! - real! : null;
  const dv = ok ? r2(dk! * t!.km + adj) : null;
  const kc = f != null && f > 0 && rota != null ? Math.round(f - rota) : 0;
  const op = ok && rota ? rota - real! : null;
  const big = ok && !!rota && op != null && Math.abs(op / rota) > (+E.R().limite || 0.1);
  const ce = kc ? E.compErr(E.compCtx(v.placa, v.carreg, id), kc) : null;

  async function save() {
    setSaving(true);
    try {
      if (isRota) {
        const so = parseNum(sai);
        const co = parseNum(che);
        if (so != null && co != null && co <= so) {
          toastError("Confira os odômetros.");
          setSaving(false);
          return;
        }
        await updateTrip(id, { odo_out: so, odo_in: co, status: "fechada", closed_at: new Date().toISOString() }, "Viagem concluída (rota do contrato)", c.userName);
      } else {
        if (!ok) return;
        const patch: Record<string, unknown> = {
          odo_out: s, odo_in: ch, km_billed: f, km_route: rota, km_comp: rota != null ? Math.round(f! - rota) : 0,
          status: "fechada", closed_at: new Date().toISOString(),
        };
        if (big) {
          patch.reason = motivo;
          patch.reason_note = motivoObs.trim() || null;
        }
        await updateTrip(id, patch,
          "Viagem fechada: " + km(real) + " km rodados, " + km(f) + " faturados" + (rota != null && Math.round(f! - rota) ? " (compensação " + skm(Math.round(f! - rota)) + " km)" : "") + ", saldo da viagem " + sbrl(dv),
          c.userName);
      }
      toastSuccess("Viagem fechada.");
      c.onChanged();
      onDone(id);
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="km-close-title" className="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div>
          <h2 id="km-close-title" className="text-lg font-semibold text-navy-900">{isRota ? "Concluir viagem" : "Fechar viagem"}</h2>
          <p className="text-sm text-navy-500">{v.placa} · carregamento {dBR(v.carreg)}</p>
        </div>
        {isRota && <p className={noteCls}>{v.rotaNome || "Rota do contrato"}: {km(v.kmFat)} km do contrato, sem controle de saldo.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="km-c-sai">Odômetro na saída{isRota && <span className="font-normal text-navy-500"> · opcional</span>}</label>
            <input id="km-c-sai" inputMode="numeric" className={bigCls} value={sai} onChange={(e) => setSai(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="km-c-che">Odômetro na chegada{isRota && <span className="font-normal text-navy-500"> · opcional</span>}</label>
            <input id="km-c-che" inputMode="numeric" className={bigCls} value={che} onChange={(e) => setChe(e.target.value)} autoFocus />
          </div>
          {!isRota && (
            <>
              <div>
                <label className={labelCls} htmlFor="km-c-fat">
                  Km faturado (do CT-e){" "}
                  <span className="font-normal text-navy-500">
                    {rota == null ? "" : kc ? `· ${km(rota)} estimados ${kc > 0 ? "+ " : "− "}${km(Math.abs(kc))} de compensação` : "· igual ao km estimado"}
                  </span>
                </label>
                <input id="km-c-fat" inputMode="numeric" className={inputCls} value={fat} onChange={(e) => setFat(e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="km-c-vkm">Valor do km <span className="font-normal text-navy-500">· tabela de {dBR(t?.desde)}</span></label>
                <input id="km-c-vkm" className={inputCls} disabled value={t ? "R$ " + nf(t.km, 4) + (t.cc ? " + CC " + nf(t.cc, 2) : "") : "sem tarifa"} />
              </div>
            </>
          )}
        </div>
        {!isRota && (
          <>
            <Kv items={[["Km rodado", ok ? km(real) : "—"], ["Diferença km", ok ? skm(dk) : "—"], ["Diferença R$", ok ? <Signed v={dv} /> : "—"], ["Compensação", kc ? skm(kc) + " km" : "—"]]} />
            {ok && (
              <p className="text-sm text-navy-600">
                {op! < 0 ? `Rodou ${km(-op!)} km a mais que o estimado.` : op! > 0 ? `Rodou ${km(op!)} km a menos que o estimado.` : "Km rodado igual ao estimado."}
                {kc ? ` Compensação de ${skm(kc)} km (${sbrl(r2(kc * t!.km))}).` : ""}
                {adj ? ` Ajuste do CT-e: ${sbrl(adj)}.` : ""}
              </p>
            )}
            {ce && <p className={noteRisk}>{ce} Se o CT-e já saiu assim, feche e registre a explicação.</p>}
            {big && (
              <div className="flex flex-col gap-3">
                <p className={noteWarn}>Diferença de {pct(-op! / rota!, 0)} entre o km rodado e o km estimado. Registre o motivo para fechar.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls} htmlFor="km-c-mot">Motivo</label>
                    <select id="km-c-mot" className={inputCls} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                      <option value="">Escolha</option>
                      {MOTIVOS.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="km-c-moo">Detalhe</label>
                    <input id="km-c-moo" className={inputCls} value={motivoObs} onChange={(e) => setMotivoObs(e.target.value)} placeholder="Opcional" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={buttonClasses("secondary", "md")} onClick={onClose}>Voltar</button>
          <button type="button" disabled={saving || (!isRota && (!ok || (big && !motivo)))} className={buttonClasses("primary", "md")} onClick={save}>
            {saving ? "Salvando..." : isRota ? "Concluir viagem" : "Fechar viagem"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ======================================================================
// Motivo do desvio
// ======================================================================
export function MotivoModal({ id, onClose, onDone, ...c }: Common & { id: string; onClose: () => void; onDone: (id: string) => void }) {
  const { toastError, toastSuccess } = useFeedback();
  const v = c.engine.S.viag[id];
  const [m, setM] = useState("");
  const [o, setO] = useState("");
  async function save() {
    if (!m) {
      toastError("Escolha o motivo.");
      return;
    }
    try {
      await updateTrip(id, { reason: m, reason_note: o.trim() || null }, "Motivo registrado: " + m, c.userName);
      toastSuccess("Motivo registrado.");
      c.onChanged();
      onDone(id);
    } catch (e) {
      toastError((e as Error).message);
    }
  }
  return (
    <Modal onClose={onClose} labelledBy="km-mot-title" className="max-w-lg">
      <div className="flex flex-col gap-4">
        <div>
          <h2 id="km-mot-title" className="text-lg font-semibold text-navy-900">Motivo do desvio</h2>
          <p className="text-sm text-navy-500">{v.placa} · {dBR(v.carreg)}</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="km-m-s">Motivo</label>
          <select id="km-m-s" className={inputCls} value={m} onChange={(e) => setM(e.target.value)}>
            <option value="">Escolha</option>
            {MOTIVOS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="km-m-o">Detalhe</label>
          <input id="km-m-o" className={inputCls} value={o} onChange={(e) => setO(e.target.value)} placeholder="Opcional" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClasses("secondary", "md")} onClick={onClose}>Voltar</button>
          <button type="button" className={buttonClasses("primary", "md")} onClick={save}>Salvar motivo</button>
        </div>
      </div>
    </Modal>
  );
}

/** Orquestra as janelas a partir de um estado único (detalhe → editar/fechar/motivo). */
export type TripDialog = { kind: "detail" | "edit" | "close" | "motivo"; id: string } | { kind: "new" } | null;

export function TripDialogs({ dialog, setDialog, ...c }: Common & { dialog: TripDialog; setDialog: (d: TripDialog) => void }) {
  if (!dialog) return null;
  const back = (id: string) => setDialog({ kind: "detail", id });
  if (dialog.kind === "new") return <TripFormModal {...c} id={null} onClose={() => setDialog(null)} onSaved={back} />;
  if (dialog.kind === "edit") return <TripFormModal {...c} id={dialog.id} onClose={() => back(dialog.id)} onSaved={back} />;
  if (dialog.kind === "close") return <CloseTripModal {...c} id={dialog.id} onClose={() => back(dialog.id)} onDone={back} />;
  if (dialog.kind === "motivo") return <MotivoModal {...c} id={dialog.id} onClose={() => back(dialog.id)} onDone={back} />;
  return (
    <TripDetailModal
      {...c}
      id={dialog.id}
      onClose={() => setDialog(null)}
      onEdit={(id) => setDialog({ kind: "edit", id })}
      onCloseTrip={(id) => setDialog({ kind: "close", id })}
      onMotivo={(id) => setDialog({ kind: "motivo", id })}
    />
  );
}

export type { KmTrip };
