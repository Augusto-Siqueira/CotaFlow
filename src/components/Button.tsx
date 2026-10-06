import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

// Padrão único de botões do sistema. Use `buttonClasses` quando o elemento já
// é um <a> ou <Link> (ex: link de PDF), ou os componentes abaixo.
//  - primary:   ação principal (verde cheio)
//  - secondary: ação neutra (contorno cinza)
//  - soft:      ação de linha (Detalhes, Editar, PDF...) — verde suave
//  - danger:    exclusão (contorno vermelho)
export type ButtonVariant = "primary" | "secondary" | "soft" | "danger";
export type ButtonSize = "sm" | "compact" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800",
  secondary:
    "border border-navy-300 bg-white text-navy-700 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700",
  soft: "btn-soft border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100",
  danger: "btn-danger border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "rounded-md px-2.5 py-1 text-xs",
  compact: "rounded-lg px-3 py-1.5 text-sm",
  md: "rounded-lg px-4 py-2 text-sm",
};

export function buttonClasses(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md"
): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

export function Button({
  variant,
  size,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={`${buttonClasses(variant, size)} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  variant,
  size,
  className = "",
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Link
      className={`${buttonClasses(variant, size)} ${className}`}
      {...props}
    />
  );
}
