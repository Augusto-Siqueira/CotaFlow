export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

// 000.000.000-00, formatando enquanto o usuário digita.
export function formatCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(d[len])) return false;
  }
  return true;
}

// Apelido padrão do motorista: os dois primeiros nomes, pulando "da/de/do..."
// (ADILSON DA SILVA BARBOSA -> ADILSON SILVA).
const NAME_PARTICLES = new Set(["da", "de", "do", "das", "dos", "e"]);

export function defaultNickname(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((w) => !NAME_PARTICLES.has(w.toLowerCase()))
    .slice(0, 2)
    .join(" ");
}
