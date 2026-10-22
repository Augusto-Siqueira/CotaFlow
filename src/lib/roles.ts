// Perfis fixos do sistema (um por pessoa). Mantido em sincronia com as funções
// do banco (is_admin, can_edit_commercial, can_edit_schedule,
// can_edit_maintenance, can_edit_fuel, is_driver — migrations 0036, 0038, 0049, 0051, 0062, 0064).
export const ROLES = [
  { value: "admin", label: "Admin", hint: "Tudo, inclusive cadastrar usuários" },
  { value: "comercial", label: "Comercial", hint: "Cotações, propostas, clientes e tabelas" },
  { value: "logistica", label: "Logística", hint: "Programação" },
  { value: "manutencao", label: "Manutenção", hint: "Manutenção e check-lists" },
  { value: "abastecimento", label: "Abastecimento", hint: "Acompanha e corrige os abastecimentos" },
  { value: "inspetor", label: "Check-list mensal", hint: "Só faz e consulta os check-lists mensais das placas" },
  { value: "motorista", label: "Motorista", hint: "Só o app do motorista" },
  { value: "cliente", label: "Cliente", hint: "Só o portal de comprovantes das empresas dele" },
] as const;

export type Role = (typeof ROLES)[number]["value"];

/**
 * Perfis da equipe que o admin escolhe ao criar um usuário. Motorista nasce do
 * cadastro de motoristas; cliente (portal externo) tem formulário próprio.
 */
export const STAFF_ROLES = ROLES.filter((r) => r.value !== "motorista" && r.value !== "cliente");

export function isRole(value: unknown): value is Role {
  return ROLES.some((r) => r.value === value);
}

export function roleLabel(role: string | null | undefined): string {
  return ROLES.find((r) => r.value === role)?.label ?? "Sem perfil";
}
