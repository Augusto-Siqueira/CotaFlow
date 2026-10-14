"use client";

import { useEffect, useRef, useState } from "react";

export interface AddressOption {
  id: string;
  name: string;
}

// O Supabase limita cada consulta a 1000 linhas no servidor (não dá pra
// contornar com .limit() no cliente) — com os ~5.570 municípios
// cadastrados em `cities`, precisa paginar pra trazer a lista inteira.
// Campo de texto livre (nunca bloqueado por um seletor) com sugestões
// próprias em vez de <datalist> nativo: clicar na setinha mostra só os
// endereços cadastrados (lista curta e útil); digitar filtra cidades (e
// endereços) que começam com o que foi digitado, em vez de despejar a
// lista inteira de cidades já usadas.
export function AddressField({
  id,
  ariaLabel,
  value,
  onValueChange,
  placeholder,
  error,
  cities,
  addresses,
  onPick,
  onKeyDown,
  onBlur,
  className,
}: {
  id?: string;
  ariaLabel?: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  error?: string;
  cities: string[];
  addresses: AddressOption[];
  // Chamados só quando a pessoa escolhe uma sugestão / aperta tecla / sai do campo.
  onPick?: (name: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  className?: string;
}) {
  const [openMode, setOpenMode] = useState<"closed" | "addresses" | "search">(
    "closed"
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openMode === "closed") return;
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpenMode("closed");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMode]);

  const suggestions =
    openMode === "addresses"
      ? addresses.map((a) => a.name)
      : openMode === "search"
      ? Array.from(new Set([...cities, ...addresses.map((a) => a.name)]))
          .filter((name) =>
            name.toLowerCase().startsWith(value.trim().toLowerCase())
          )
          .sort()
      : [];

  function selectSuggestion(name: string) {
    onValueChange(name);
    setOpenMode("closed");
    onPick?.(name);
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <input
          id={id}
          aria-label={ariaLabel}
          type="text"
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
            setOpenMode(e.target.value.trim() ? "search" : "addresses");
          }}
          onFocus={() =>
            setOpenMode(value.trim() ? "search" : "addresses")
          }
          onKeyDown={onKeyDown}
          onBlur={() => {
            setTimeout(() => setOpenMode("closed"), 100);
            onBlur?.();
          }}
          className="w-full rounded-lg border border-navy-300 px-3 py-2 pr-8 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          placeholder={placeholder}
        />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            setOpenMode((prev) => (prev === "addresses" ? "closed" : "addresses"))
          }
          className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-navy-500 hover:text-navy-600"
          aria-label="Ver endereços cadastrados"
        >
          ▾
        </button>
      </div>
      {openMode !== "closed" && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-navy-200 bg-white py-1 shadow-lg">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
                className="block w-full px-3 py-1.5 text-left text-sm text-navy-700 hover:bg-navy-50"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
