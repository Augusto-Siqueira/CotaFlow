"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

const TABS = [
  { href: "/vehicles", label: "Tipos de veículo" },
  { href: "/vehicles/frota", label: "Frota (placas)" },
  { href: "/vehicles/motoristas", label: "Motoristas" },
  // Dados pessoais e bancários: só Logística e admin (ver migration 0080).
  { href: "/vehicles/agregados", label: "Agregados", restricted: true },
];

export function VehiclesTabs({ active }: { active: string }) {
  const { canEditSchedule } = useAuth();
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-navy-200">
      {TABS.filter((t) => !t.restricted || canEditSchedule).map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            t.href === active
              ? "border-brand-600 text-brand-700"
              : "border-transparent text-navy-500 hover:text-navy-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
