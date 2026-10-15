// Mantido em sincronia com loading_schedules_status_check (migrations 0038 e 0048). "lavando" foi retirado da tela; o banco ainda aceita o valor.
export const LOADING_STATUSES = [
  { value: "programado", label: "Programado", badge: "bg-navy-200 text-navy-800" },
  { value: "carregando", label: "Carregando", badge: "bg-amber-200 text-amber-900" },
  { value: "em_viagem", label: "Carregado em Viagem", badge: "bg-brand-200 text-brand-900" },
  { value: "entregue", label: "Entrega Concluída", badge: "bg-teal-200 text-teal-900" },
] as const;

export type LoadingStatus = (typeof LOADING_STATUSES)[number]["value"];

export function loadingStatusLabel(status: string): string {
  return LOADING_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function loadingStatusBadge(status: string): string {
  return (
    LOADING_STATUSES.find((s) => s.value === status)?.badge ??
    LOADING_STATUSES[0].badge
  );
}
