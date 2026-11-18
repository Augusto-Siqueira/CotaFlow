import type { CSSProperties } from "react";

// Placa no estilo Mercosul (só visual): faixa azul com "BRASIL" e a bandeira,
// fundo branco e letras pretas. Cores em estilo inline de propósito: o modo
// escuro troca bg-white/navy, e a placa deve continuar branca como a de verdade.

const PLATE: CSSProperties = { backgroundColor: "#ffffff", borderColor: "#1f2937", color: "#111111" };
const BAND: CSSProperties = { backgroundColor: "#003399", color: "#ffffff" };

function Flag() {
  return (
    <svg viewBox="0 0 20 14" width="9" height="6" aria-hidden="true">
      <rect width="20" height="14" fill="#009c3b" />
      <path d="M10 1.5 18.5 7 10 12.5 1.5 7z" fill="#ffdf00" />
      <circle cx="10" cy="7" r="3.2" fill="#002776" />
    </svg>
  );
}

export function PlateBadge({ plate, size = "sm" }: { plate: string | null | undefined; size?: "sm" | "md" }) {
  const p = (plate ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (!p) return <span className="text-navy-500">—</span>;
  const big = size === "md";
  return (
    <span
      title={p}
      aria-label={`Placa ${p}`}
      style={PLATE}
      className={`inline-flex flex-col overflow-hidden rounded-[3px] border align-middle leading-none shadow-sm ${
        big ? "min-w-[5.75rem]" : "min-w-[4.75rem]"
      }`}
    >
      <span
        aria-hidden="true"
        style={{ ...BAND, fontSize: big ? 6 : 5, letterSpacing: "0.15em" }}
        className={`flex items-center justify-between gap-1 px-1 font-bold ${big ? "py-[2px]" : "py-px"}`}
      >
        <span>BRASIL</span>
        <Flag />
      </span>
      <span
        aria-hidden="true"
        style={{ color: "#111111", letterSpacing: "0.12em" }}
        className={`px-1.5 text-center font-mono font-bold ${big ? "py-[3px] text-sm" : "py-[2px] text-xs"}`}
      >
        {p}
      </span>
    </span>
  );
}
