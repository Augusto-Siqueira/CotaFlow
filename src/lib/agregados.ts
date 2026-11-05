import { formatCpf, isValidCpf, onlyDigits } from "@/lib/cpf";

// Cadastro de agregados (contratado do CIOT) — ver migration 0080.

export type PersonType = "pf" | "pj";
export type CiotMode = "viagem" | "mensal";
export type PaymentMethod = "conta" | "pix";
export type PixKeyType = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";
export type BankAccountType = "corrente" | "poupanca";

export interface Agregado {
  id: string;
  person_type: PersonType;
  document: string;
  name: string;
  rntrc: string | null;
  dependents: number;
  email: string | null;
  mobile_phone: string | null;
  other_phone: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  cep: string | null;
  city: string | null;
  payment_method: PaymentMethod | null;
  bank_code: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  bank_account_type: BankAccountType | null;
  pix_key_type: PixKeyType | null;
  pix_key: string | null;
  ciot_mode: CiotMode;
  recipient_client_id: string | null;
  driver_id: string | null;
  notes: string | null;
  active: boolean;
}

export const AGREGADO_COLUMNS =
  "id, person_type, document, name, rntrc, dependents, email, mobile_phone, other_phone, street, number, complement, district, cep, city, payment_method, bank_code, bank_agency, bank_account, bank_account_type, pix_key_type, pix_key, ciot_mode, recipient_client_id, driver_id, notes, active";

export const CIOT_MODE_LABEL: Record<CiotMode, string> = {
  viagem: "Um CIOT por viagem",
  mensal: "Um CIOT por veículo por mês",
};

export const PIX_KEY_LABEL: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Telefone",
  aleatoria: "Chave aleatória",
};

// Códigos da ANTT/MDF-e (tpRod e tpCar) — os mesmos das listas do e-Frete.
export const WHEEL_TYPES: { value: string; label: string }[] = [
  { value: "01", label: "Truck" },
  { value: "02", label: "Toco" },
  { value: "03", label: "Cavalo mecânico" },
  { value: "04", label: "VAN" },
  { value: "05", label: "Utilitário" },
  { value: "06", label: "Outros" },
];

export const BODY_TYPES: { value: string; label: string }[] = [
  { value: "00", label: "Não aplicável" },
  { value: "01", label: "Aberta" },
  { value: "02", label: "Fechada / Baú" },
  { value: "03", label: "Granelera" },
  { value: "04", label: "Porta contêiner" },
  { value: "05", label: "Sider" },
];

export function formatCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((s, w, i) => s + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function formatDocument(type: PersonType, value: string): string {
  return type === "pf" ? formatCpf(value) : formatCnpj(value);
}

export function isValidDocument(type: PersonType, value: string): boolean {
  return type === "pf" ? isValidCpf(value) : isValidCnpj(value);
}

// 00000-000
export function formatCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
}

// (41) 99999-9999 / (41) 3333-3333
export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  const split = rest.length > 8 ? 5 : 4;
  return rest.length > split
    ? `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`
    : `(${ddd}) ${rest}`;
}
