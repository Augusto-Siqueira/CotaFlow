"use client";

import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/Button";
import { formatCurrency } from "@/lib/format";

// Botão "Calcular pedágio" das cotações: consulta a WikiRota pela rota já
// localizada no mapa (cidades em ordem) e os eixos do veículo. Cada consulta é
// paga, por isso só no clique; a mesma rota nos últimos 30 dias vem do que já
// foi consultado, sem custo. O campo Pedágio (R$) continua editável.

const MONTH_LIMIT = 1000; // faixa contratada (Professional até 1.000/mês)
const AXLES = [2, 3, 4, 5, 6, 7, 9];

export interface TollPoint {
  lat: number;
  lng: number;
  label: string;
}

interface Result {
  total: number;
  tolls: { name: string; road: string; km: number | null; price: number }[];
  distanceKm: number | null;
  axles: number;
  cached: boolean;
  at: string;
  monthCount: number;
}

export function TollEstimate({
  points,
  defaultAxles,
  onUse,
  busyRoute = false,
}: {
  points: TollPoint[];
  defaultAxles: number | null;
  onUse: (total: number) => void;
  /** Cidades ainda sendo localizadas no mapa. */
  busyRoute?: boolean;
}) {
  const [axlesSel, setAxlesSel] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [monthCount, setMonthCount] = useState<number | null>(null);

  const axles = axlesSel ? Number(axlesSel) : defaultAxles ?? 0;
  const routeKey = points.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join(";");
  // Rota ou eixos mudaram: o resultado mostrado deixa de valer.
  const stale = result && (result.axles !== axles || routeKeyOf(result) !== routeKey);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/quotes/pedagio")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { monthCount?: number } | null) => {
        if (!cancelled && j?.monthCount != null) setMonthCount(j.monthCount);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  async function calc(force: boolean) {
    setError(null);
    if (points.length < 2) return setError("Preencha a origem e o destino da rota para calcular.");
    if (!axles) return setError("Escolha o número de eixos.");
    setBusy(true);
    try {
      const res = await fetch("/api/quotes/pedagio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points, axles, force }),
      });
      const j = (await res.json().catch(() => ({}))) as Partial<Result> & { error?: string };
      if (!res.ok) throw new Error(j.error || "Falha ao consultar o pedágio.");
      const r = { ...(j as Result), routeKey } as Result & { routeKey: string };
      setResult(r);
      setMonthCount(r.monthCount);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-navy-200 bg-navy-50 p-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-navy-700" htmlFor="toll-axles">
            Eixos
          </label>
          <select
            id="toll-axles"
            value={axlesSel || (defaultAxles ? String(defaultAxles) : "")}
            onChange={(e) => setAxlesSel(e.target.value)}
            className="rounded-lg border border-navy-300 bg-white px-2 py-1.5 text-sm text-navy-900"
          >
            {!defaultAxles && !axlesSel && <option value="">Escolha</option>}
            {AXLES.map((a) => (
              <option key={a} value={a}>
                {a} eixos
              </option>
            ))}
          </select>
        </div>
        <button type="button" disabled={busy || busyRoute} className={buttonClasses("secondary", "sm")} onClick={() => calc(false)}>
          {busy ? "Consultando..." : "Calcular pedágio"}
        </button>
        <span className="text-xs text-navy-500">
          WikiRota · {points.length >= 2 ? `${points.length} cidades da rota` : "preencha a rota"}
          {monthCount != null && ` · ${monthCount} de ${MONTH_LIMIT.toLocaleString("pt-BR")} consultas no mês`}
        </span>
      </div>

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      {result && (
        <div className={`mt-3 ${stale ? "opacity-60" : ""}`}>
          {result.tolls.length ? (
            <ul className="divide-y divide-navy-200 rounded-md border border-navy-200 bg-white text-xs">
              {result.tolls.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-2 py-1.5">
                  <span className="text-navy-800">
                    {t.name}
                    {t.road ? <span className="text-navy-500"> · {t.road}{t.km != null ? ` km ${t.km}` : ""}</span> : null}
                  </span>
                  <span className="font-mono text-navy-900">{formatCurrency(t.price)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-navy-600">Nenhuma praça de pedágio nesta rota.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-navy-900">
              Total ({result.axles} eixos): <b>{formatCurrency(result.total)}</b>
              {result.distanceKm ? <span className="text-xs text-navy-500"> · rota da WikiRota com {result.distanceKm.toLocaleString("pt-BR")} km</span> : null}
            </span>
            <button type="button" disabled={!!stale} className={buttonClasses("primary", "sm")} onClick={() => onUse(result.total)}>
              Usar esse valor
            </button>
          </div>
          <p className="mt-1 text-xs text-navy-500">
            {stale
              ? "A rota ou os eixos mudaram: calcule de novo."
              : result.cached
                ? <>Consulta guardada de {new Date(result.at).toLocaleDateString("pt-BR")} (sem custo).{" "}
                    <button type="button" disabled={busy} className="text-brand-700 underline hover:text-brand-800" onClick={() => calc(true)}>
                      Consultar de novo
                    </button>
                  </>
                : "Consulta feita agora na WikiRota."}
          </p>
        </div>
      )}
    </div>
  );
}

function routeKeyOf(r: Result) {
  return (r as Result & { routeKey?: string }).routeKey ?? "";
}
