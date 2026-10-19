"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { buttonClasses } from "@/components/Button";
import { certAlerts, certText, type FleetCertFields } from "@/lib/fleet";

/**
 * Faixa da Programação: placas com CIV/CIPP vencida ou vencendo (até 7 dias).
 * Só avisa; não bloqueia o lançamento da carga.
 */
export function FleetCertAlert() {
  const [rows, setRows] = useState<FleetCertFields[] | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancel = false;
    supabase
      .from("fleet_units")
      .select("plate, kind, civ_due, civ_na, cipp_due, cipp_na")
      .order("plate")
      .then(({ data }) => {
        if (!cancel) setRows((data as FleetCertFields[] | null) ?? []);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const items = (rows ?? []).flatMap((u) => certAlerts(u).map((c) => ({ plate: u.plate, c })));
  if (items.length === 0) return null;
  const expired = items.filter((i) => i.c.level === "vencida").length;

  return (
    <section
      aria-label="Capacitações vencendo"
      className={`mt-4 rounded-xl border px-4 py-3 print:hidden ${
        expired > 0 ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={`text-sm font-medium ${expired > 0 ? "text-red-800" : "text-amber-900"}`}>
          ⚠ Capacitações dos veículos ({items.length})
          {expired > 0 ? ` — ${expired} vencida(s)` : ""}
        </h2>
        <span className="flex items-center gap-2">
          <Link href="/vehicles/frota" className="text-xs font-medium underline">
            Ver frota
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={buttonClasses("secondary", "sm")}
          >
            {open ? "Recolher" : "Mostrar"}
          </button>
        </span>
      </div>
      {open && (
      <ul className="mt-2 space-y-1 text-sm">
        {items.map(({ plate, c }) => (
          <li key={`${plate}-${c.cert}`} className={c.level === "vencida" ? "text-red-800" : "text-amber-900"}>
            <span className="font-semibold tracking-wide">{plate}</span> · {certText(c)}
          </li>
        ))}
      </ul>
      )}
    </section>
  );
}
