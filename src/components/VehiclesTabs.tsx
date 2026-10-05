import Link from "next/link";

const TABS = [
  { href: "/vehicles", label: "Tipos de veículo" },
  { href: "/vehicles/frota", label: "Frota (placas)" },
  { href: "/vehicles/motoristas", label: "Motoristas" },
];

export function VehiclesTabs({ active }: { active: string }) {
  return (
    <div className="mb-6 flex gap-1 border-b border-navy-200">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
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
