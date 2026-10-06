import type { ReactNode } from "react";
import {
  CardActions,
  CardField,
  CardFields,
  CardHeader,
  CardHighlight,
  MobileCard,
  MobileCardList,
} from "@/components/MobileCard";

/**
 * Tabela responsiva a partir de UMA definição de colunas: de `sm` para cima
 * vira tabela (com cabeçalho fixo e rolagem própria); no celular cada linha
 * vira um cartão. O papel de cada coluna no cartão é dado por `mobile`.
 */

export type MobileRole =
  | "title" // linha principal do cartão (junta todas as colunas "title")
  | "subtitle" // texto de apoio sob o título (junta com " · ")
  | "badge" // selo no canto do cabeçalho
  | "highlight" // valor em destaque (usa `header` como rótulo)
  | "field" // campo na grade de detalhes
  | "wideField" // campo que ocupa a linha inteira da grade
  | "actions" // rodapé de ações
  | "hidden"; // só aparece na tabela

export interface Column<T> {
  key: string;
  /** Texto do cabeçalho; também é o rótulo do campo no cartão. */
  header: string;
  cell: (row: T) => ReactNode;
  mobile?: MobileRole;
  /** Se o cartão precisar mostrar outra coisa que não a célula da tabela. */
  mobileCell?: (row: T) => ReactNode;
  /** Ordem no cartão (padrão: a ordem das colunas). */
  mobileOrder?: number;
  className?: string;
}

export interface Selection<T> {
  isSelected: (row: T) => boolean;
  onToggle: (row: T) => void;
  allSelected: boolean;
  onToggleAll: () => void;
}

function filled(node: ReactNode): boolean {
  return node !== null && node !== undefined && node !== false && node !== "";
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  selection,
  rowClassName,
  scrollClassName = "max-h-[70vh]",
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  selection?: Selection<T>;
  rowClassName?: (row: T) => string;
  scrollClassName?: string;
}) {
  const roleOf = (c: Column<T>): MobileRole => c.mobile ?? "field";
  const ordered = columns
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.mobileOrder ?? a.i) - (b.c.mobileOrder ?? b.i))
    .map(({ c }) => c);
  const byRole = (role: MobileRole) => ordered.filter((c) => roleOf(c) === role);
  const cardCell = (c: Column<T>, row: T) =>
    c.mobileCell ? c.mobileCell(row) : c.cell(row);

  return (
    <>
      <div className={`overflow-y-auto sm:hidden ${scrollClassName}`}>
        <MobileCardList>
          {rows.map((row) => {
            const titles = byRole("title")
              .map((c) => cardCell(c, row))
              .filter(filled);
            const subtitles = byRole("subtitle")
              .map((c) => cardCell(c, row))
              .filter(filled);
            const badge = byRole("badge")[0];
            const fields = [...byRole("field"), ...byRole("wideField")].sort(
              (a, b) =>
                (a.mobileOrder ?? columns.indexOf(a)) -
                (b.mobileOrder ?? columns.indexOf(b))
            );
            const actions = byRole("actions");

            return (
              <MobileCard key={rowKey(row)} className={rowClassName?.(row)}>
                <CardHeader
                  title={titles.map((t, i) => (
                    <span key={i}>
                      {i > 0 && " "}
                      {t}
                    </span>
                  ))}
                  subtitle={
                    subtitles.length > 0
                      ? subtitles.map((s, i) => (
                          <span key={i}>
                            {i > 0 && " · "}
                            {s}
                          </span>
                        ))
                      : undefined
                  }
                  badge={badge ? cardCell(badge, row) : undefined}
                />

                {byRole("highlight").map((c) => (
                  <CardHighlight
                    key={c.key}
                    label={c.header}
                    value={cardCell(c, row)}
                  />
                ))}

                {fields.length > 0 && (
                  <CardFields>
                    {fields.map((c) => (
                      <CardField
                        key={c.key}
                        label={c.header}
                        value={cardCell(c, row)}
                        wide={roleOf(c) === "wideField"}
                      />
                    ))}
                  </CardFields>
                )}

                {(actions.some((c) => filled(cardCell(c, row))) || selection) && (
                  <CardActions>
                    {actions.map((c) => (
                      <div key={c.key} className="contents">
                        {cardCell(c, row)}
                      </div>
                    ))}
                    {selection && (
                      <label className="ml-auto flex items-center gap-1.5 text-navy-600">
                        <input
                          type="checkbox"
                          checked={selection.isSelected(row)}
                          onChange={() => selection.onToggle(row)}
                        />
                        Selecionar
                      </label>
                    )}
                  </CardActions>
                )}
              </MobileCard>
            );
          })}
        </MobileCardList>
      </div>

      <div className={`hidden overflow-auto sm:block ${scrollClassName}`}>
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
            <tr>
              {selection && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todas"
                    checked={rows.length > 0 && selection.allSelected}
                    onChange={selection.onToggleAll}
                  />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className="px-6 py-3 font-medium">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`hover:bg-navy-50 ${rowClassName?.(row) ?? ""}`}
              >
                {selection && (
                  <td className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Selecionar linha"
                      checked={selection.isSelected(row)}
                      onChange={() => selection.onToggle(row)}
                    />
                  </td>
                )}
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-6 py-3 ${c.className ?? "text-navy-600"}`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
