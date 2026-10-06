import type { ReactNode } from "react";

/**
 * Padrão de setas de avançar/voltar do sistema: um bloco único com chevrons
 * dos lados e o conteúdo (data, página, mês...) no meio. Use sempre este
 * componente quando precisar de setas desse tipo.
 */
function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

const ARROW =
  "flex w-10 items-center justify-center text-navy-600 transition-colors hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-navy-600";

export function StepperControl({
  onPrev,
  onNext,
  prevLabel = "Anterior",
  nextLabel = "Próximo",
  prevDisabled = false,
  nextDisabled = false,
  children,
  className = "",
}: {
  onPrev: () => void;
  onNext: () => void;
  prevLabel?: string;
  nextLabel?: string;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-stretch overflow-hidden rounded-lg border border-navy-300 bg-white shadow-sm ${className}`}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={prevDisabled}
        aria-label={prevLabel}
        title={prevLabel}
        className={ARROW}
      >
        <Chevron direction="left" />
      </button>
      <div className="flex items-center border-x border-navy-200">{children}</div>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        aria-label={nextLabel}
        title={nextLabel}
        className={ARROW}
      >
        <Chevron direction="right" />
      </button>
    </div>
  );
}
