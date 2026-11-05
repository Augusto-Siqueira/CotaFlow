"use client";

import { useRef } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * Janela (modal) acessível:
 *  - role="dialog" + aria-modal, nomeada por `labelledBy` (id do título);
 *  - o foco entra na janela, fica preso nela (Tab / Shift+Tab) e volta ao
 *    elemento que a abriu quando ela fecha;
 *  - Esc e clique fora fecham;
 *  - a página atrás não rola enquanto a janela está aberta.
 */
export function Modal({
  onClose,
  labelledBy,
  children,
  className = "max-w-lg",
  role = "dialog",
  zIndex = "z-50",
  align = "start",
}: {
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  className?: string;
  role?: "dialog" | "alertdialog";
  zIndex?: string;
  align?: "start" | "center";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onClose);

  return (
    <div
      // Centraliza com margem automática no painel (e não items-center no
      // contêiner): se a janela for mais alta que a tela, o topo continua
      // alcançável pela rolagem em vez de ficar cortado para cima.
      className={`fixed inset-0 ${zIndex} flex items-start justify-center overflow-y-auto bg-black/60 p-4 print:hidden`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`w-full rounded-xl bg-white p-6 text-navy-900 shadow-xl outline-none ${
          align === "center" ? "my-auto" : "sm:my-auto"
        } ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
