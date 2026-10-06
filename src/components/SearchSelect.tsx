"use client";

import { useId, useMemo, useRef, useState } from "react";

export interface SearchOption {
  value: string;
  // Texto secundário (ex: nome completo do motorista) — também entra na busca.
  hint?: string;
}

const MAX_VISIBLE = 50;

/**
 * Campo de busca com lista própria (no lugar do <datalist> nativo, que no
 * celular é desajeitado): clicar ou digitar abre as opções filtradas, setas
 * navegam, Enter escolhe e Esc fecha. O valor é o texto do campo — quem usa
 * continua validando se ele existe nas opções.
 */
export function SearchSelect({
  value,
  onChange,
  options,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder?: string;
  className?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(q) ||
        (o.hint ?? "").toLowerCase().includes(q)
    );
  }, [options, value]);

  const visible = filtered.slice(0, MAX_VISIBLE);

  function choose(option: SearchOption) {
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && visible[active]) {
      e.preventDefault();
      choose(visible[active]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className={className}
      />

      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-navy-200 bg-white py-1 text-sm shadow-lg"
        >
          {visible.length === 0 ? (
            <li className="px-3 py-2 text-navy-500">Nenhum resultado cadastrado.</li>
          ) : (
            visible.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={i === active}
                // mouseDown (e não click) pra escolher antes do campo perder o foco.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 ${
                  i === active ? "bg-brand-50 text-navy-900" : "text-navy-800"
                }`}
              >
                <span className="font-medium">{o.value}</span>
                {o.hint && o.hint !== o.value && (
                  <span className="ml-2 text-xs text-navy-500">{o.hint}</span>
                )}
              </li>
            ))
          )}
          {filtered.length > MAX_VISIBLE && (
            <li className="px-3 py-1.5 text-xs text-navy-400">
              Mostrando {MAX_VISIBLE} de {filtered.length}. Digite para filtrar.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
