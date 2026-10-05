// Mantido em sincronia com fleet_units_kind_check (migrations 0040 e 0041).
export const FLEET_KINDS = [
  { value: "cavalo", label: "Cavalo mecânico", plural: "Cavalos mecânicos" },
  { value: "semirreboque", label: "Semi-reboque", plural: "Semi-reboques" },
  { value: "truck", label: "Truck", plural: "Trucks" },
  { value: "bitruck", label: "Bitruck", plural: "Bitrucks" },
] as const;

export type FleetKind = (typeof FLEET_KINDS)[number]["value"];

// ABC1D23 / ABC1234 — sempre 7 caracteres, maiúsculas, sem hífen nem espaço.
export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

export function isValidPlate(value: string): boolean {
  return /^[A-Z0-9]{7}$/.test(value);
}
