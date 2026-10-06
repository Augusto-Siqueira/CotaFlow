"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { Modal } from "@/components/Modal";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ConfirmOptions {
  confirmLabel?: string;
  title?: string;
}

interface FeedbackApi {
  toastSuccess: (message: string) => void;
  toastError: (message: string) => void;
  toastInfo: (message: string) => void;
  // Todas as confirmações do sistema hoje são exclusões, então o padrão é o
  // botão vermelho "Excluir".
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

const TOAST_STYLES: Record<ToastKind, string> = {
  success: "border-brand-300 bg-brand-50 text-brand-800",
  error: "border-red-300 bg-red-50 text-red-800",
  info: "border-navy-300 bg-white text-navy-800",
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<{
    message: string;
    options: ConfirmOptions;
  } | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, kind: ToastKind) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, kind }]);
      setTimeout(() => dismiss(id), kind === "error" ? 8000 : 5000);
    },
    [dismiss]
  );

  const confirm = useCallback(
    (message: string, options: ConfirmOptions = {}) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setPending({ message, options });
      }),
    []
  );

  function answer(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setPending(null);
  }

  const api: FeedbackApi = {
    toastSuccess: (m) => push(m, "success"),
    toastError: (m) => push(m, "error"),
    toastInfo: (m) => push(m, "info"),
    confirm,
  };

  return (
    <FeedbackContext.Provider value={api}>
      {children}

      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 print:hidden"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${TOAST_STYLES[t.kind]}`}
          >
            <span className="flex-1 break-words">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Fechar aviso"
              className="text-lg leading-none opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {pending && (
        <Modal
          onClose={() => answer(false)}
          labelledBy="confirm-title"
          role="alertdialog"
          zIndex="z-[70]"
          align="center"
          className="max-w-sm"
        >
          <h2 id="confirm-title" className="text-base font-medium text-navy-900">
            {pending.options.title ?? "Confirmar"}
          </h2>
          <p className="mt-2 text-sm text-navy-600">{pending.message}</p>
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              data-autofocus
              onClick={() => answer(false)}
              className="rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => answer(true)}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
            >
              {pending.options.confirmLabel ?? "Excluir"}
            </button>
          </div>
        </Modal>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback precisa estar dentro de FeedbackProvider");
  return ctx;
}
