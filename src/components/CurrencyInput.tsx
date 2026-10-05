"use client";

const MAX_DIGITS = 12;

function toDisplay(value: string): string {
  if (!value.trim()) return "";
  const n = Number(value.replace(",", "."));
  if (Number.isNaN(n)) return "";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Campo de valor em reais com máscara estilo caixa eletrônico: o usuário só
 * digita números e o campo vai formatando (150000 -> 1.500,00). Pra o resto
 * do app o valor continua uma string decimal com ponto ("1500.00"), que é o
 * que os formulários já sabem converter — por isso é plug-and-play no lugar
 * de um <input> de texto.
 */
export function CurrencyInput({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
>) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={toDisplay(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").slice(0, MAX_DIGITS);
        onChange(digits ? (Number(digits) / 100).toFixed(2) : "");
      }}
    />
  );
}
