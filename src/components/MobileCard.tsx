import type { ReactNode } from "react";

/**
 * Peças para a versão mobile das tabelas. Abaixo de `sm` cada linha vira um
 * cartão empilhado; de `sm` para cima a tabela original reaparece. Manter as
 * duas visões em paralelo (em vez de forçar a tabela a encolher) é o que
 * permite hierarquia de leitura no celular — rota em destaque, valor grande,
 * detalhes secundários menores.
 */

export function MobileCardList({ children }: { children: ReactNode }) {
  return (
    <ul className="divide-y divide-navy-100 sm:hidden">{children}</ul>
  );
}

export function MobileCard({
  children,
  className = "",
}: {
  children: ReactNode;
  /** Para destacar o cartão inteiro (ex: o item em edição). */
  className?: string;
}) {
  return <li className={`px-4 py-4 ${className}`}>{children}</li>;
}

/** Cabeçalho do cartão: título forte à esquerda, selo opcional à direita. */
export function CardHeader({
  title,
  subtitle,
  badge,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug text-navy-900">
          {title}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p>
        )}
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
    </div>
  );
}

/** Valor em evidência — o número que o usuário procura primeiro. */
export function CardHighlight({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="mt-3 rounded-lg bg-navy-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-navy-500">
        {label}
      </p>
      <p className="text-lg font-semibold leading-tight text-navy-900">
        {value}
      </p>
    </div>
  );
}

/** Grade de campos secundários, dois por linha. */
export function CardFields({ children }: { children: ReactNode }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">{children}</dl>
  );
}

export function CardField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-navy-400">
        {label}
      </dt>
      <dd className="truncate text-sm text-navy-800">{value}</dd>
    </div>
  );
}

/** Rodapé com as ações da linha. */
export function CardActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-navy-100 pt-3 text-sm font-medium">
      {children}
    </div>
  );
}

export function CardBadge({
  children,
  tone = "navy",
}: {
  children: ReactNode;
  tone?: "navy" | "brand";
}) {
  const tones = {
    navy: "bg-navy-100 text-navy-700",
    brand: "bg-brand-50 text-brand-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
