// Mantido em sincronia com loading_schedules_status_check (migration 0038).
export const LOADING_STATUSES = [
  { value: "programado", label: "Programado", badge: "bg-navy-100 text-navy-700" },
  { value: "lavando", label: "Lavando", badge: "bg-sky-100 text-sky-800" },
  { value: "carregando", label: "Carregando", badge: "bg-amber-100 text-amber-800" },
  { value: "em_viagem", label: "Carregado em Viagem", badge: "bg-brand-100 text-brand-800" },
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
