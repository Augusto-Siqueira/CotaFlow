"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { UF_LIST, parseIcmsTable } from "@/lib/icms";
import {
  CardActions,
  CardHeader,
  CardHighlight,
  MobileCard,
  MobileCardList,
} from "@/components/MobileCard";

interface IcmsRateRow {
  id: string;
  uf_origin: string;
  uf_destination: string;
  rate: number;
}

interface FormState {
  uf_origin: string;
  uf_destination: string;
  rate: string;
}

const emptyForm: FormState = {
  uf_origin: "",
  uf_destination: "",
  rate: "",
};

export default function IcmsRatesPage() {
  const [rates, setRates] = useState<IcmsRateRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState("");

  const [form, setForm] = useState<FormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof FormState, string>>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [bulkText, setBulkText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    saved: number;
    errors: string[];
  } | null>(null);

  async function loadRates() {
    setLoadingList(true);
    setListError(null);
    const { data, error } = await supabase
      .from("icms_rates")
      .select("id, uf_origin, uf_destination, rate")
      .order("uf_origin")
      .order("uf_destination");

    if (error) {
      setListError(error.message);
    } else {
      setRates(data ?? []);
    }
    setLoadingList(false);
  }

  useEffect(() => {
    loadRates();
  }, []);

  const visibleRates = useMemo(
    () =>
      originFilter
        ? rates.filter((r) => r.uf_origin === originFilter)
        : rates,
    [rates, originFilter]
  );

  const bulkPreview = useMemo(
    () => (bulkText.trim() ? parseIcmsTable(bulkText) : null),
    [bulkText]
  );

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.uf_origin) errors.uf_origin = "Selecione a UF de origem.";
    if (!form.uf_destination)
      errors.uf_destination = "Selecione a UF de destino.";
    const rate = Number(form.rate.replace("%", "").replace(",", "."));
    if (!form.rate.trim() || Number.isNaN(rate)) {
      errors.rate = "Informe a alíquota.";
    } else if (rate < 0 || rate > 100) {
      errors.rate = "A alíquota deve estar entre 0 e 100.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);
    if (!validate()) return;

    setSubmitting(true);
    // Upsert: regravar um par existente é o caso normal (reajuste), não erro.
    const { error } = await supabase.from("icms_rates").upsert(
      {
        uf_origin: form.uf_origin,
        uf_destination: form.uf_destination,
        rate: Number(form.rate.replace("%", "").replace(",", ".")),
      },
      { onConflict: "uf_origin,uf_destination" }
    );
    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    setSuccessMessage(
      `Alíquota ${form.uf_origin} → ${form.uf_destination} salva.`
    );
    setForm((prev) => ({ ...prev, uf_destination: "", rate: "" }));
    await loadRates();
  }

  async function handleBulkImport() {
    if (!bulkPreview || bulkPreview.rates.length === 0) return;

    setImporting(true);
    setImportResult(null);

    const { error } = await supabase
      .from("icms_rates")
      .upsert(bulkPreview.rates, { onConflict: "uf_origin,uf_destination" });

    setImporting(false);

    if (error) {
      setImportResult({ saved: 0, errors: [error.message] });
      return;
    }

    setImportResult({
      saved: bulkPreview.rates.length,
      errors: bulkPreview.errors,
    });
    setBulkText("");
    await loadRates();
  }

  async function handleDelete(row: IcmsRateRow) {
    if (
      !confirm(
        `Excluir a alíquota ${row.uf_origin} → ${row.uf_destination}?`
      )
    )
      return;
    const { error } = await supabase
      .from("icms_rates")
      .delete()
      .eq("id", row.id);
    if (error) {
      alert(`Não foi possível excluir: ${error.message}`);
      return;
    }
    await loadRates();
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
          Alíquotas de ICMS
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          Alíquota por par de estados (origem → destino). As cotações usam esta
          tabela para preencher o ICMS de cada rota automaticamente. Mantenha
          atualizada conforme a legislação vigente.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-1">
          <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-medium text-navy-900">
              Alíquota individual
            </h2>
            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  UF de origem <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.uf_origin}
                  onChange={(e) => updateField("uf_origin", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Selecione...</option>
                  {UF_LIST.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
                {formErrors.uf_origin && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.uf_origin}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  UF de destino <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.uf_destination}
                  onChange={(e) => updateField("uf_destination", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Selecione...</option>
                  {UF_LIST.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
                {formErrors.uf_destination && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.uf_destination}
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  Alíquota (%) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.rate}
                  onChange={(e) => updateField("rate", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: 12"
                />
                {formErrors.rate && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.rate}</p>
                )}
              </div>

              {submitError && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  Erro ao salvar: {submitError}
                </div>
              )}
              {successMessage && (
                <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
                  {successMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Salvando..." : "Salvar alíquota"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-medium text-navy-900">
              Importar tabela
            </h2>
            <p className="mt-1 text-xs text-navy-500">
              Cole a matriz copiada do Excel (primeira linha com as UFs de
              destino, primeira coluna com as de origem) ou uma linha por
              alíquota no formato <code>SP;MG;12</code>.
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={8}
              className="mt-3 w-full rounded-lg border border-navy-300 px-3 py-2 font-mono text-xs text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              placeholder={"\tSP\tMG\tRJ\nSP\t18\t12\t12\nMG\t12\t18\t12"}
            />

            {bulkPreview && (
              <div className="mt-3 text-xs">
                <p className="text-navy-700">
                  <span className="font-semibold">
                    {bulkPreview.rates.length}
                  </span>{" "}
                  {bulkPreview.rates.length === 1 ? "alíquota" : "alíquotas"}{" "}
                  reconhecida{bulkPreview.rates.length === 1 ? "" : "s"}.
                </p>
                {bulkPreview.errors.length > 0 && (
                  <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                    <p className="font-semibold">
                      {bulkPreview.errors.length} linha
                      {bulkPreview.errors.length === 1 ? "" : "s"} não
                      importável
                      {bulkPreview.errors.length === 1 ? "" : "is"}:
                    </p>
                    <ul className="mt-1 list-inside list-disc">
                      {bulkPreview.errors.slice(0, 6).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                    {bulkPreview.errors.length > 6 && (
                      <p className="mt-1">
                        ...e mais {bulkPreview.errors.length - 6}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {importResult && (
              <div className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                {importResult.saved} alíquota
                {importResult.saved === 1 ? "" : "s"} importada
                {importResult.saved === 1 ? "" : "s"}.
                {importResult.errors.length > 0 &&
                  ` ${importResult.errors.length} linha(s) ignorada(s).`}
              </div>
            )}

            <button
              type="button"
              onClick={handleBulkImport}
              disabled={
                importing || !bulkPreview || bulkPreview.rates.length === 0
              }
              className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-brand-300 px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? "Importando..." : "Importar alíquotas"}
            </button>
          </div>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-200 px-6 py-4">
              <h2 className="text-base font-medium text-navy-900">
                Alíquotas cadastradas
              </h2>
              <div className="flex items-center gap-3">
                <select
                  value={originFilter}
                  onChange={(e) => setOriginFilter(e.target.value)}
                  className="rounded-lg border border-navy-300 px-3 py-1.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Todas as origens</option>
                  {UF_LIST.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-navy-500">
                  {visibleRates.length}
                </span>
              </div>
            </div>

            {loadingList ? (
              <div className="px-6 py-10 text-center text-sm text-navy-500">
                Carregando alíquotas...
              </div>
            ) : listError ? (
              <div className="px-6 py-10 text-center text-sm text-red-600">
                Erro ao carregar alíquotas: {listError}
              </div>
            ) : visibleRates.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-navy-500">
                {rates.length === 0
                  ? "Nenhuma alíquota cadastrada. Importe sua tabela para o ICMS ser preenchido automaticamente nas cotações."
                  : "Nenhuma alíquota para essa origem."}
              </div>
            ) : (
              <>
                {/* Sem o filtro de origem são 729 pares; limitar a altura evita
                    uma rolagem de página interminável no celular. */}
                <div className="max-h-[32rem] overflow-auto sm:hidden">
                  <MobileCardList>
                    {visibleRates.map((row) => (
                      <MobileCard key={row.id}>
                        <CardHeader
                          title={
                            <>
                              {row.uf_origin}{" "}
                              <span className="text-navy-400">→</span>{" "}
                              {row.uf_destination}
                            </>
                          }
                        />

                        <CardHighlight
                          label="Alíquota"
                          value={`${row.rate}%`}
                        />

                        <CardActions>
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Excluir
                          </button>
                        </CardActions>
                      </MobileCard>
                    ))}
                  </MobileCardList>
                </div>

                <div className="hidden max-h-[32rem] overflow-auto sm:block">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
                      <tr>
                        <th className="px-6 py-3 font-medium">Origem</th>
                        <th className="px-6 py-3 font-medium">Destino</th>
                        <th className="px-6 py-3 font-medium">Alíquota</th>
                        <th className="px-6 py-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-100">
                      {visibleRates.map((row) => (
                        <tr key={row.id} className="hover:bg-navy-50">
                          <td className="px-6 py-3 font-medium text-navy-900">
                            {row.uf_origin}
                          </td>
                          <td className="px-6 py-3 text-navy-600">
                            {row.uf_destination}
                          </td>
                          <td className="px-6 py-3 text-navy-900">
                            {row.rate}%
                          </td>
                          <td className="px-6 py-3">
                            <button
                              type="button"
                              onClick={() => handleDelete(row)}
                              className="font-medium text-red-600 hover:text-red-800"
                            >
                              Excluir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
