/** Texto sem acento, em minúsculas e sem espaços nas pontas (para comparar nomes de cidade). */
export function normalizeCityText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
