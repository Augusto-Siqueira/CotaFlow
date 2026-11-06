"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Abas do portal do cliente. "Controle de km" (KM Exato) só aparece para quem
// o servidor libera (usuário ligado a uma empresa Btech).

let cached: boolean | null = null;

export function PortalTabs({ active }: { active: "/portal" | "/portal/km-exato" }) {
  const [km, setKm] = useState<boolean>(cached ?? active === "/portal/km-exato");
  useEffect(() => {
    if (cached !== null) return;
    fetch("/api/portal/km-exato?probe=1", { cache: "no-store" })
      .then((r) => {
        cached = r.ok;
        setKm(r.ok);
      })
      .catch(() => setKm(false));
  }, []);
  if (!km) return null;
  const tabs = [
    { href: "/portal", label: "Comprovantes de entrega" },
    { href: "/portal/km-exato", label: "Controle de km" },
  ] as const;
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-navy-200">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            t.href === active ? "border-brand-600 text-brand-700" : "border-transparent text-navy-500 hover:text-navy-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
