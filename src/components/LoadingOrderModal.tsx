"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Modal } from "@/components/Modal";
import { SearchSelect } from "@/components/SearchSelect";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";
import {
  EMPTY_LINE,
  ORDER_MAX_LINES,
  ORDER_NATURES,
  formatTons,
  isBlankLine,
  linesFromDestination,
  parseTons,
  type OrderLine,
} from "@/lib/loadingOrder";

interface Row {
  oc: string;
  nature: string;
  compartments: string;
  tons: string;
  city: string;
  uf: string;
}

const inputCls =
  "w-full rounded-lg border border-navy-300 bg-white px-2.5 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

function toRow(l: OrderLine): Row {
  return { ...l, tons: l.tons === null ? "" : String(l.tons).replace(".", ",") };
}

/**
 * Janela da Ordem de embarque de uma carga: lança as linhas (OC, produto,
 * compartimentos, peso e destino) e abre o PDF. Só a equipe que edita a
 * programação usa; quem só lê baixa o PDF direto da carga.
 */
export function LoadingOrderModal({
  load,
  existing,
  onClose,
  onSaved,
}: {
  load: { id: string; cargo: string; client_name: string; destination: string | null; plate: string | null };
  existing: OrderLine[] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toastError } = useFeedback();
  const [rows, setRows] = useState<Row[]>(() =>
    (existing && existing.length > 0 ? existing : linesFromDestination(load.destination)).map(toRow)
  );
  const [saving, setSaving] = useState(false);

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  const parsed: OrderLine[] = rows.map((r) => ({
    oc: r.oc.trim(),
    nature: r.nature.trim().toUpperCase(),
    compartments: r.compartments.trim().toUpperCase(),
    tons: parseTons(r.tons),
    city: r.city.trim().toUpperCase(),
    uf: r.uf.trim().toUpperCase(),
  }));
  const filled = parsed.filter((l) => !isBlankLine(l));
  const total = filled.reduce((sum, l) => sum + (l.tons ?? 0), 0);

  async function save(openPdf: boolean) {
    if (filled.length === 0) {
      toastError("Preencha pelo menos uma linha da ordem.");
      return;
    }
    const bad = filled.findIndex((l) => !l.nature || !l.city || l.tons === null);
    if (bad >= 0) {
      toastError(`Linha ${parsed.indexOf(filled[bad]) + 1}: informe produto, peso e a cidade de destino.`);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("loading_orders")
      .upsert({ schedule_id: load.id, lines: filled, updated_at: new Date().toISOString() }, { onConflict: "schedule_id" });
    setSaving(false);
    if (error) {
      toastError(`Não foi possível salvar a ordem (${error.message}).`);
      return;
    }
    if (openPdf) window.open(`/api/programacao/${load.id}/ordem`, "_blank", "noopener");
    onSaved();
    onClose();
  }

  return (
    <Modal onClose={onClose} labelledBy="order-modal-title" className="max-w-3xl">
      <h2 id="order-modal-title" className="text-base font-medium text-navy-900">
        Ordem de embarque
      </h2>
      <p className="mt-1 text-sm text-navy-500">
        {load.cargo} · {load.client_name}
        {load.plate ? ` · ${load.plate}` : ""}
      </p>
      <p className="mt-1 text-xs text-navy-500">
        Linhas seguidas com o mesmo nº da OC saem juntas na ordem. Beta Bacter sai em amarelo e Beta Bacter 33 em azul.
      </p>

      <div className="mt-4 space-y-2">
        <div className="hidden grid-cols-[6rem_1fr_6rem_5.5rem_1.4fr_3.5rem_2rem] gap-2 px-1 text-[11px] font-medium uppercase text-navy-500 sm:grid">
          <span>Nº da OC</span>
          <span>Produto</span>
          <span>Compart.</span>
          <span>Peso (t)</span>
          <span>Cidade</span>
          <span>UF</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[6rem_1fr_6rem_5.5rem_1.4fr_3.5rem_2rem]">
            <input
              aria-label={`Linha ${i + 1}: nº da OC`}
              value={r.oc}
              onChange={(e) => update(i, { oc: e.target.value })}
              className={inputCls}
              placeholder="OC"
            />
            <SearchSelect
              id={`ord-prod-${i}`}
              value={r.nature}
              onChange={(v) => update(i, { nature: v.toUpperCase() })}
              options={ORDER_NATURES.map((n) => ({ value: n.value }))}
              placeholder="Produto"
              className={`${inputCls} uppercase`}
            />
            <input
              aria-label={`Linha ${i + 1}: compartimentos`}
              value={r.compartments}
              onChange={(e) => update(i, { compartments: e.target.value })}
              className={`${inputCls} uppercase`}
              placeholder="1+2 / ÚNICO"
            />
            <input
              aria-label={`Linha ${i + 1}: peso em toneladas`}
              inputMode="decimal"
              value={r.tons}
              onChange={(e) => update(i, { tons: e.target.value })}
              className={inputCls}
              placeholder="10,000"
            />
            <input
              aria-label={`Linha ${i + 1}: cidade de destino`}
              value={r.city}
              onChange={(e) => update(i, { city: e.target.value })}
              className={`${inputCls} uppercase`}
              placeholder="Cidade"
            />
            <input
              aria-label={`Linha ${i + 1}: UF`}
              value={r.uf}
              maxLength={2}
              onChange={(e) => update(i, { uf: e.target.value.toUpperCase() })}
              className={`${inputCls} uppercase`}
              placeholder="UF"
            />
            <button
              type="button"
              onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ ...toRow(EMPTY_LINE) }]))}
              aria-label={`Remover a linha ${i + 1}`}
              className="flex items-center justify-center rounded-lg text-navy-500 hover:bg-red-50 hover:text-red-700"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={rows.length >= ORDER_MAX_LINES}
          onClick={() => setRows((prev) => [...prev, toRow(EMPTY_LINE)])}
          className={`${buttonClasses("secondary", "sm")} disabled:cursor-not-allowed`}
        >
          Adicionar linha
        </button>
        <span className="text-sm text-navy-700">
          Total: <strong className="tabular-nums">{formatTons(total)} t</strong>
          {rows.length >= ORDER_MAX_LINES && <span className="ml-2 text-xs text-navy-500">(máximo de {ORDER_MAX_LINES} linhas)</span>}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonClasses("secondary")}>
          Cancelar
        </button>
        <button type="button" disabled={saving} onClick={() => save(false)} className={`${buttonClasses("soft")} disabled:cursor-not-allowed`}>
          Salvar
        </button>
        <button type="button" disabled={saving} onClick={() => save(true)} className={`${buttonClasses("primary")} disabled:cursor-not-allowed`}>
          {saving ? "Salvando..." : "Salvar e abrir PDF"}
        </button>
      </div>
    </Modal>
  );
}
