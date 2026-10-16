// Perfis fixos do sistema (um por pessoa). Mantido em sincronia com as funções
// do banco (is_admin, can_edit_commercial, can_edit_schedule,
// can_edit_maintenance, is_driver — migrations 0036, 0038, 0049, 0051, 0062).
export const ROLES = [
  { value: "admin", label: "Admin", hint: "Tudo, inclusive cadastrar usuários" },
  { value: "comercial", label: "Comercial", hint: "Cotações, propostas, clientes e tabelas" },
  { value: "logistica", label: "Logística", hint: "Programação" },
  { value: "manutencao", label: "Manutenção", hint: "Manutenção e check-lists" },
  { value: "motorista", label: "Motorista", hint: "Só o app do motorista" },
] as const;

export type Role = (typeof ROLES)[number]["value"];

/** Perfis que o admin escolhe ao criar um usuário da equipe (motorista nasce do cadastro de motoristas). */
export const STAFF_ROLES = ROLES.filter((r) => r.value !== "motorista");

export function isRole(value: unknown): value is Role {
  return ROLES.some((r) => r.value === value);
}

export function roleLabel(role: string | null | undefined): string {
  return ROLES.find((r) => r.value === role)?.label ?? "Sem perfil";
}
