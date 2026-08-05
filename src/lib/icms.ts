// Resolução da alíquota de ICMS de uma rota a partir da matriz UF×UF.
// As alíquotas vêm sempre da tabela `icms_rates` — nunca são presumidas aqui.

export const UF_LIST = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export interface IcmsRate {
  uf_origin: string;
  uf_destination: string;
  rate: number;
}

export type IcmsRateMap = Map<string, number>;

function key(ufOrigin: string, ufDestination: string): string {
  return `${ufOrigin.toUpperCase()}>${ufDestination.toUpperCase()}`;
}

export function buildIcmsRateMap(rates: IcmsRate[]): IcmsRateMap {
  return new Map(rates.map((r) => [key(r.uf_origin, r.uf_destination), r.rate]));
}

export function lookupIcmsRate(
  rates: IcmsRateMap,
  ufOrigin: string | null,
  ufDestination: string | null
): number | null {
  if (!ufOrigin || !ufDestination) return null;
  return rates.get(key(ufOrigin, ufDestination)) ?? null;
}

/**
 * Extrai a UF de um nome de cidade no padrão "Município/UF". Só aceita o
 * formato exato do cadastro — se o usuário digitou algo livre como
 * "Cubatão - SP", retorna null de propósito, para o formulário poder avisar
 * em vez de adivinhar o estado errado.
 */
export function ufFromCityName(name: string): string | null {
  const parts = name.trim().split("/");
  if (parts.length !== 2) return null;
  const uf = parts[1].trim().toUpperCase();
  return isUf(uf) ? uf : null;
}

export function isUf(value: string): boolean {
  return (UF_LIST as readonly string[]).includes(value.trim().toUpperCase());
}

function parseRate(raw: string): number | null {
  const cleaned = raw.trim().replace("%", "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function splitCells(line: string): string[] {
  return line.split(/\t|;|,(?=\s*\d)|\s{2,}/).map((c) => c.trim());
}

export interface IcmsParseResult {
  rates: IcmsRate[];
  errors: string[];
}

/**
 * Interpreta uma tabela de alíquotas colada pelo usuário, em dois formatos:
 *
 *  - Matriz (copiada do Excel): primeira linha traz as UFs de destino, cada
 *    linha seguinte começa pela UF de origem seguida das alíquotas.
 *  - Trios por linha: "SP  MG  12" (tab, ponto-e-vírgula ou espaços).
 *
 * Células vazias são ignoradas (par sem alíquota definida), e tudo que não
 * casar com os formatos é reportado em `errors` em vez de ser descartado em
 * silêncio — importar alíquota errada é pior que não importar.
 */
export function parseIcmsTable(input: string): IcmsParseResult {
  // Só o fim da linha é aparado: numa matriz colada do Excel a primeira
  // célula é o canto vazio, e removê-la deslocaria todas as colunas — o que
  // faria cada alíquota cair no estado errado.
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");

  if (lines.length === 0) return { rates: [], errors: [] };

  const firstCells = splitCells(lines[0]);
  const headerUfs = firstCells.slice(1).filter(Boolean);
  const looksLikeMatrix =
    headerUfs.length > 1 && headerUfs.every((c) => isUf(c));

  const rates: IcmsRate[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  function push(origin: string, destination: string, rate: number, where: string) {
    const k = key(origin, destination);
    if (seen.has(k)) {
      errors.push(`${where}: par ${origin}→${destination} repetido, ignorado.`);
      return;
    }
    seen.add(k);
    rates.push({
      uf_origin: origin.toUpperCase(),
      uf_destination: destination.toUpperCase(),
      rate,
    });
  }

  if (looksLikeMatrix) {
    const destinations = headerUfs.map((u) => u.toUpperCase());
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCells(lines[i]);
      const origin = cells[0];
      if (!origin) continue;
      if (!isUf(origin)) {
        errors.push(`Linha ${i + 1}: "${origin}" não é uma UF válida.`);
        continue;
      }
      destinations.forEach((destination, col) => {
        const raw = cells[col + 1];
        if (raw === undefined || raw === "") return;
        const rate = parseRate(raw);
        if (rate === null) {
          errors.push(
            `Linha ${i + 1}, ${origin}→${destination}: "${raw}" não é um número.`
          );
          return;
        }
        push(origin, destination, rate, `Linha ${i + 1}`);
      });
    }
    return { rates, errors };
  }

  lines.forEach((line, i) => {
    const cells = splitCells(line).filter(Boolean);
    if (cells.length < 3) {
      errors.push(`Linha ${i + 1}: esperado "UF origem, UF destino, alíquota".`);
      return;
    }
    const [origin, destination, rawRate] = cells;
    if (!isUf(origin) || !isUf(destination)) {
      errors.push(`Linha ${i + 1}: UF inválida em "${origin}" ou "${destination}".`);
      return;
    }
    const rate = parseRate(rawRate);
    if (rate === null) {
      errors.push(`Linha ${i + 1}: "${rawRate}" não é um número.`);
      return;
    }
    push(origin, destination, rate, `Linha ${i + 1}`);
  });

  return { rates, errors };
}
