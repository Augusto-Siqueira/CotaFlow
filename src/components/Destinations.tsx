"use client";

import { useState } from "react";
import { AddressField, type AddressOption } from "@/components/AddressField";

// Vários destinos ficam no mesmo campo de texto, separados por ";" (nenhum
// nome de cidade usa esse caractere), então não precisa de coluna nova.
const SEP = "; ";

export function splitDestinations(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
}

export function joinDestinations(list: string[]): string {
  return list.join(SEP);
}

/**
 * Campo de destinos do formulário: digita a cidade e aperta Enter (ou
 * "Adicionar") para incluir; cada destino vira uma etiqueta com "x" para tirar.
 * O que estiver digitado ao sair do campo também é incluído.
 */
export function DestinationsInput({
  id,
  value,
  onChange,
  placeholder,
  cities,
  addresses,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  cities: string[];
  addresses: AddressOption[];
}) {
  const [draft, setDraft] = useState("");
  const list = splitDestinations(value);

  function commit(text: string = draft) {
    const items = splitDestinations(text);
    setDraft("");
    if (items.length === 0) return;
    const next = [...list];
    for (const item of items) {
      if (!next.some((d) => d.toLowerCase() === item.toLowerCase())) next.push(item);
    }
    onChange(joinDestinations(next));
  }

  function remove(index: number) {
    onChange(joinDestinations(list.filter((_, i) => i !== index)));
  }

  return (
    <div>
      <div className="flex gap-2">
        <AddressField
          id={id}
          value={draft}
          onValueChange={setDraft}
          onPick={(name) => commit(name)}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={list.length > 0 ? "Outro destino (Enter para adicionar)" : (placeholder ?? "")}
          cities={cities}
          addresses={addresses}
          className="flex-1"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => commit()}
          disabled={!draft.trim()}
          className="shrink-0 rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
        >
          Adicionar
        </button>
      </div>
      {list.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {list.map((d, i) => (
            <li
              key={d}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-800"
            >
              {d}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remover destino ${d}`}
                className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-brand-200"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Destino na tabela: um só aparece direto; vários viram o botão "Diversos",
 * que abre a lista. Na impressão a lista sai inteira (não dá para clicar).
 */
export function DestinationsCell({ value }: { value: string | null }) {
  const [open, setOpen] = useState(false);
  const list = splitDestinations(value);

  if (list.length === 0) return <>—</>;
  if (list.length === 1) return <>{list[0]}</>;

  return (
    <>
      <span className="hidden print:inline">{list.join(", ")}</span>
      <span className="print:hidden">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          title={`${list.length} destinos`}
          className="inline-flex items-center gap-1 rounded-md border border-navy-300 px-2 py-0.5 text-xs font-medium text-navy-700 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700"
        >
          Diversos
          <span aria-hidden="true" className="text-[10px]">
            {open ? "▲" : "▼"}
          </span>
        </button>
        {open && (
          <ul className="mt-1.5 space-y-0.5 text-sm text-navy-700">
            {list.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </span>
    </>
  );
}
