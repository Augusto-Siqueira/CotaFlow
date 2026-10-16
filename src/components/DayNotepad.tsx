"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const SAVE_DELAY_MS = 1200;
const REFRESH_MS = 60000;

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Bloco de notas da Programação: um texto livre por dia, compartilhado pela
 * equipe. Salva sozinho enquanto se digita e confere a cada minuto se outra
 * pessoa mudou o texto (sem atropelar quem está digitando).
 */
export function DayNotepad({ date, canEdit }: { date: string; canEdit: boolean }) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Texto ainda não salvo: enquanto houver, a atualização automática não sobrescreve.
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDate = useRef(date);
  // O que falta salvar (dia + texto): é gravado antes de trocar de dia ou sair da tela.
  const pending = useRef<{ d: string; body: string } | null>(null);

  useEffect(() => {
    currentDate.current = date;
    dirty.current = false;

    async function load() {
      const d = currentDate.current;
      const { data, error: err } = await supabase
        .from("schedule_day_notes")
        .select("body, updated_at")
        .eq("schedule_date", d)
        .maybeSingle();
      if (d !== currentDate.current || dirty.current) return;
      if (err) {
        setError(err.message);
        return;
      }
      setError(null);
      setText(data?.body ?? "");
      setStatus(data?.updated_at ? `Atualizado às ${timeLabel(data.updated_at)}` : null);
      setLoaded(true);
    }

    queueMicrotask(() => {
      setLoaded(false);
      load();
    });
    const poll = setInterval(() => {
      if (!document.hidden) load();
    }, REFRESH_MS);
    return () => {
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
      const p = pending.current;
      pending.current = null;
      if (p) void save(p.d, p.body);
    };
  }, [date]);

  async function save(d: string, body: string) {
    if (pending.current?.d === d && pending.current.body === body) pending.current = null;
    const { data, error: err } = await supabase
      .from("schedule_day_notes")
      .upsert(
        { schedule_date: d, body, updated_at: new Date().toISOString() },
        { onConflict: "schedule_date" }
      )
      .select("updated_at")
      .single();
    if (d !== currentDate.current) return;
    if (err) {
      setError(`Não foi possível salvar (${err.message}).`);
      setStatus(null);
      return;
    }
    dirty.current = false;
    setError(null);
    setStatus(`Salvo às ${timeLabel(data.updated_at)}`);
  }

  function onChange(value: string) {
    setText(value);
    dirty.current = true;
    setStatus("Salvando...");
    if (timer.current) clearTimeout(timer.current);
    const d = date;
    pending.current = { d, body: value };
    timer.current = setTimeout(() => save(d, value), SAVE_DELAY_MS);
  }

  // Sem permissão de editar e sem nada escrito: não mostra o bloco.
  if (!canEdit && loaded && !text.trim()) return null;

  return (
    <section
      aria-label="Bloco de notas do dia"
      className="mt-4 rounded-xl border border-navy-200 bg-white px-4 py-3 shadow-sm print:hidden"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-navy-900">
          📝 Bloco de notas do dia
          {!open && text.trim() && (
            <span className="ml-2 text-xs font-normal text-navy-500">(com anotações)</span>
          )}
        </h2>
        <span className="flex items-center gap-3">
          {open && status && <span className="text-xs text-navy-500">{status}</span>}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-navy-300 px-2 py-0.5 text-xs font-medium text-navy-700 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
          >
            {open ? "Recolher" : "Mostrar"}
          </button>
        </span>
      </div>
      {open && (
        <>
          <label htmlFor="day-notepad" className="sr-only">
            Anotações do dia
          </label>
          <textarea
            id="day-notepad"
            rows={4}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            readOnly={!canEdit}
            disabled={!loaded}
            placeholder={
              loaded ? "Anotações da equipe para este dia (salva sozinho)" : "Carregando..."
            }
            className="mt-2 w-full resize-y rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed"
          />
          {error && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
