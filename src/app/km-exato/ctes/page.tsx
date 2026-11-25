"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useKm } from "@/lib/kmExato/useKm";
import { useTabCounts } from "@/lib/kmExato/useTabCounts";
import { addDays, todayISO } from "@/lib/kmExato/engine";
import { brl, dBR, ton } from "@/lib/kmExato/format";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";
import { DataTable, type Column } from "@/components/DataTable";
import { KmPage, Panel, Pill, Plate } from "@/components/km/KmUi";
import { TripDialogs, type TripDialog } from "@/components/km/KmTripModals";

// KM Exato · CT-e recebidos: XML de CT-e da Btech que chegam do ERP (e-mail)
// ou enviados à mão. Cada um vira entrega da viagem em aberto da placa; o que
// não encaixa espera aqui a equipe escolher a viagem.

interface InboxRow {
  id: string;
  number: string;
  issued_at: string | null;
  cte_type: number;
  client: string;
  nf: string | null;
  freight: number | null;
  weight_kg: number | null;
  tractor_plate: string | null;
  trailer_plate: string | null;
  status: "vinculado" | "sem_viagem" | "descartado" | "cancelado";
  reason: string | null;
  trip_id: string | null;
  linked_by: string | null;
  source: "email" | "manual";
}
interface MailState {
  last_run_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  last_summary: { emails?: number; xmls?: number; counts?: Record<string, number> } | null;
}
interface ImportResult {
  file?: string;
  result: "vinculado" | "sem_viagem" | "ja_recebido" | "outro_cliente" | "cancelado" | "invalido";
}

type Seg = "sem_viagem" | "vinculado" | "outros";
const SEGS: [Seg, string][] = [
  ["sem_viagem", "Sem viagem"],
  ["vinculado", "Vinculados"],
  ["outros", "Descartados e cancelados"],
];
const COLS = "id, number, issued_at, cte_type, client, nf, freight, weight_kg, tractor_plate, trailer_plate, status, reason, trip_id, linked_by, source";

export default function KmCtesPage() {
  const km$ = useKm();
  const E = km$.engine;
  const counts = useTabCounts(E);
  const { toastError, toastSuccess, toastInfo, confirm: askConfirm } = useFeedback();
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [seg, setSeg] = useState<Seg>("sem_viagem");
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<TripDialog>(null);
  const [version, setVersion] = useState(0);
  const [mail, setMail] = useState<MailState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (km$.authLoading || !km$.canView) return;
    let cancelled = false;
    const since = addDays(todayISO(), -90);
    supabase
      .from("km_cte_inbox")
      .select(COLS)
      .or(`status.eq.sem_viagem,issued_at.gte.${since}`)
      .order("issued_at", { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLoadErr(error.message);
        else {
          setRows((data ?? []) as InboxRow[]);
          setLoadErr(null);
        }
      });
    supabase
      .from("km_cte_mail_state")
      .select("last_run_at, last_ok_at, last_error, last_summary")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setMail((data as MailState | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [km$.authLoading, km$.canView, version]);

  const refresh = () => {
    setVersion((v) => v + 1);
    km$.reload();
  };

  const cnt = useMemo(() => {
    const o: Record<Seg, number> = { sem_viagem: 0, vinculado: 0, outros: 0 };
    (rows ?? []).forEach((r) => (r.status === "sem_viagem" ? o.sem_viagem++ : r.status === "vinculado" ? o.vinculado++ : o.outros++));
    return o;
  }, [rows]);
  const list = useMemo(
    () => (rows ?? []).filter((r) => (seg === "outros" ? r.status === "descartado" || r.status === "cancelado" : r.status === seg)),
    [rows, seg]
  );

  // Viagens em aberto para escolher; as da mesma placa do CT-e vêm primeiro.
  const open = useMemo(() => (E ? E.trips().filter((t) => !t.hist && t.status === "aberta").sort((a, b) => (a.carreg < b.carreg ? 1 : -1)) : []), [E]);
  const optionsFor = (r: InboxRow) => {
    const plates = [r.tractor_plate, ...(r.trailer_plate ?? "").split(",")].filter(Boolean) as string[];
    const hit = (t: (typeof open)[number]) => plates.includes(t.placa) || (t.cavalo ? plates.includes(t.cavalo) : false);
    return [...open.filter(hit), ...open.filter((t) => !hit(t))];
  };

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const xs = Array.from(files).filter((f) => /\.xml$/i.test(f.name) || /xml/.test(f.type));
    if (!xs.length) return toastError("Escolha arquivos XML de CT-e.");
    setBusy("import");
    try {
      const payload = await Promise.all(xs.map(async (f) => ({ name: f.name, xml: await f.text() })));
      const res = await fetch("/api/km/ctes/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: payload }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; results?: ImportResult[] };
      if (!res.ok) throw new Error(j.error || "Falha ao importar.");
      const R = j.results ?? [];
      const n = (k: ImportResult["result"]) => R.filter((x) => x.result === k).length;
      const parts = [
        n("vinculado") && `${n("vinculado")} vinculado${n("vinculado") > 1 ? "s" : ""} à viagem`,
        n("sem_viagem") && `${n("sem_viagem")} sem viagem`,
        n("ja_recebido") && `${n("ja_recebido")} já recebido${n("ja_recebido") > 1 ? "s" : ""}`,
        n("outro_cliente") && `${n("outro_cliente")} de outro cliente (ignorado${n("outro_cliente") > 1 ? "s" : ""})`,
        n("cancelado") && `${n("cancelado")} cancelamento${n("cancelado") > 1 ? "s" : ""}`,
        n("invalido") && `${n("invalido")} não lido${n("invalido") > 1 ? "s" : ""}`,
      ].filter(Boolean);
      (n("vinculado") ? toastSuccess : toastInfo)(`${R.length} XML: ${parts.join(", ")}.`);
      if (n("sem_viagem")) setSeg("sem_viagem");
      refresh();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function readMail() {
    setBusy("mail");
    try {
      const res = await fetch("/api/km/ctes/email", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string; skipped?: string; emails?: number; xmls?: number; counts?: Record<string, number>; more?: boolean };
      if (!res.ok) throw new Error(j.error || "Falha ao ler o e-mail.");
      if (j.skipped) toastInfo(j.skipped);
      else {
        const c = j.counts ?? {};
        const v = c.vinculado ?? 0;
        const sv = c.sem_viagem ?? 0;
        const msg = j.xmls
          ? `${j.emails} e-mail${j.emails === 1 ? "" : "s"} com XML: ${v} CT-e vinculado${v === 1 ? "" : "s"}, ${sv} sem viagem, ${c.outro_cliente ?? 0} de outros clientes (ignorados), ${c.ja_recebido ?? 0} já recebido${(c.ja_recebido ?? 0) === 1 ? "" : "s"}${c.cancelado ? `, ${c.cancelado} cancelamento${c.cancelado === 1 ? "" : "s"}` : ""}.`
          : "Nenhum e-mail novo com XML.";
        (v ? toastSuccess : toastInfo)(msg + (j.more ? " Ainda há e-mails: clique de novo." : ""));
        if (sv) setSeg("sem_viagem");
      }
      refresh();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function link(r: InboxRow) {
    const tripId = pick[r.id] ?? optionsFor(r)[0]?.id;
    if (!tripId) return toastError("Escolha a viagem.");
    setBusy(r.id);
    try {
      const res = await fetch(`/api/km/ctes/${r.id}/vincular`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Falha ao vincular.");
      toastSuccess(`CT-e ${r.number} vinculado à viagem.`);
      refresh();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(r: InboxRow, status: "descartado" | "sem_viagem") {
    if (status === "descartado" && !(await askConfirm(`Descartar o CT-e ${r.number}? Ele não entra em nenhuma viagem do KM.`, { confirmLabel: "Descartar" }))) return;
    setBusy(r.id);
    const { error } = await supabase
      .from("km_cte_inbox")
      .update(status === "descartado" ? { status, reason: `Descartado por ${km$.userName ?? "equipe"}.` } : { status, reason: null })
      .eq("id", r.id);
    setBusy(null);
    if (error) return toastError(error.message);
    toastSuccess(status === "descartado" ? "CT-e descartado." : "CT-e de volta para Sem viagem.");
    refresh();
  }

  const columns: Column<InboxRow>[] = [
    { key: "emi", header: "Emissão", mobile: "badge", cell: (r) => <span className="font-mono">{dBR(r.issued_at)}</span> },
    {
      key: "cte",
      header: "CT-e",
      mobile: "field",
      cell: (r) => (
        <span className="font-mono">
          {r.number}
          {r.cte_type === 1 && <span className="block text-[11px] font-sans text-amber-700">complementar</span>}
        </span>
      ),
    },
    { key: "cli", header: "Cliente / destino", mobile: "title", cell: (r) => <span className="text-navy-900">{r.client}</span> },
    { key: "nf", header: "NF", mobile: "field", cell: (r) => <span className="font-mono">{r.nf || "—"}</span> },
    {
      key: "placas",
      header: "Placas",
      mobile: "field",
      cell: (r) => (
        <span className="inline-flex flex-wrap gap-1">
          {[r.trailer_plate?.split(",")[0], r.tractor_plate].filter(Boolean).map((p) => <Plate key={p} plate={p!} />)}
          {!r.trailer_plate && !r.tractor_plate && "—"}
        </span>
      ),
    },
    { key: "frete", header: "Frete peso", mobile: "field", className: "text-right", cell: (r) => (r.freight != null ? <span className="font-mono">{brl(r.freight)}</span> : "—") },
    { key: "peso", header: "Peso", mobile: "field", className: "text-right", cell: (r) => ton(+(r.weight_kg ?? 0) || 0) },
    {
      key: "sit",
      header: "Situação",
      mobile: "field",
      cell: (r) =>
        r.status === "vinculado" ? (
          <span className="inline-flex flex-col gap-0.5">
            <Pill tone="ok">{r.linked_by === "Automático" ? (r.source === "email" ? "do e-mail, sozinho" : "sozinho") : r.linked_by === "já lançado na viagem" ? "já estava na viagem" : "vinculado"}</Pill>
            {r.linked_by && r.linked_by !== "Automático" && r.linked_by !== "já lançado na viagem" && <span className="text-xs text-navy-500">por {r.linked_by}</span>}
          </span>
        ) : (
          <span className="inline-flex max-w-xs flex-col gap-0.5">
            <Pill tone={r.status === "sem_viagem" ? "warn" : r.status === "cancelado" ? "risk" : "mute"}>
              {r.status === "sem_viagem" ? "sem viagem" : r.status}
            </Pill>
            {r.reason && <span className="text-xs text-navy-500">{r.reason}</span>}
          </span>
        ),
    },
    {
      key: "acao",
      header: "",
      mobile: "actions",
      cell: (r) => {
        if (r.status === "vinculado" || r.status === "cancelado")
          return r.trip_id && E?.S.viag[r.trip_id] ? (
            <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => setDialog({ kind: "detail", id: r.trip_id! })}>
              Ver viagem
            </button>
          ) : null;
        if (r.status === "descartado")
          return (
            <button type="button" disabled={busy === r.id} className={buttonClasses("secondary", "sm")} onClick={() => setStatus(r, "sem_viagem")}>
              Restaurar
            </button>
          );
        const opts = optionsFor(r);
        return (
          <span className="inline-flex flex-wrap items-center gap-2">
            <select
              aria-label={`Viagem do CT-e ${r.number}`}
              className="max-w-[16rem] rounded-md border border-navy-300 bg-white px-2 py-1 text-xs text-navy-900"
              value={pick[r.id] ?? opts[0]?.id ?? ""}
              onChange={(e) => setPick((s) => ({ ...s, [r.id]: e.target.value }))}
            >
              {opts.length === 0 && <option value="">Nenhuma viagem em aberto</option>}
              {opts.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.placa}{t.cavalo ? ` (${t.cavalo})` : ""} · {dBR(t.carreg)}{t.dst ? ` · ${t.dst.slice(0, 40)}` : ""}
                </option>
              ))}
            </select>
            <button type="button" disabled={busy === r.id || !opts.length} className={buttonClasses("primary", "sm")} onClick={() => link(r)}>
              Vincular
            </button>
            <button type="button" disabled={busy === r.id} className={buttonClasses("secondary", "sm")} onClick={() => setStatus(r, "descartado")}>
              Descartar
            </button>
          </span>
        );
      },
    },
  ];

  const common = E ? { engine: E, userName: km$.userName, isAdmin: km$.isAdmin, onChanged: refresh } : null;

  return (
    <KmPage
      title="CT-e recebidos"
      subtitle="XML dos CT-e da Btech: cada um vira entrega da viagem em aberto da mesma placa (cavalo ou carreta). Os que não encaixam esperam aqui."
      active="/km-exato/ctes"
      isAdmin={km$.isAdmin}
      canView={km$.canView}
      authLoading={km$.authLoading}
      error={km$.error || loadErr}
      loading={!E || rows === null}
      counts={counts}
    >
      <Panel
        right={
          <>
            <input ref={fileRef} type="file" multiple accept=".xml,text/xml,application/xml" hidden onChange={(e) => { importFiles(e.target.files); e.target.value = ""; }} />
            <span className="flex flex-wrap gap-2">
              <button type="button" disabled={busy === "mail"} className={buttonClasses("primary", "md")} onClick={readMail}>
                {busy === "mail" ? "Lendo e-mails..." : "Ler e-mails agora"}
              </button>
              <button type="button" disabled={busy === "import"} className={buttonClasses("secondary", "md")} onClick={() => fileRef.current?.click()}>
                {busy === "import" ? "Importando..." : "Importar XML"}
              </button>
            </span>
          </>
        }
        title="CT-e da Btech"
        sub={
          <>
            O CotaFlow lê sozinho, a cada 15 minutos, os XML que o ERP envia pelo e-mail. CT-e de outros clientes são ignorados e não ficam guardados.
            {mail?.last_run_at && (
              <span className={`mt-1 block ${mail.last_error ? "text-red-700" : ""}`}>
                Última leitura: {new Date(mail.last_run_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                {mail.last_error ? ` · falhou: ${mail.last_error}` : mail.last_summary?.xmls ? ` · ${mail.last_summary.xmls} XML lidos` : " · nada novo"}
              </span>
            )}
          </>
        }
      >
        <div className="mb-4 flex flex-wrap overflow-hidden rounded-lg border border-navy-300 text-sm sm:w-fit">
          {SEGS.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setSeg(v)} className={`px-3 py-2 font-medium ${seg === v ? "bg-brand-700 text-white" : "bg-white text-navy-600 hover:bg-navy-50"}`}>
              {l} <span className="ml-1 font-mono text-xs opacity-75">{cnt[v]}</span>
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="py-10 text-center text-sm text-navy-500">{seg === "sem_viagem" ? "Nenhum CT-e esperando viagem." : "Nada aqui."}</p>
        ) : (
          <DataTable rows={list.slice(0, 300)} columns={columns} rowKey={(r) => r.id} />
        )}
        {seg !== "sem_viagem" && <p className="mt-3 text-xs text-navy-500">CT-e emitidos nos últimos 90 dias.</p>}
      </Panel>
      {common && <TripDialogs {...common} dialog={dialog} setDialog={setDialog} />}
    </KmPage>
  );
}
