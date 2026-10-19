import { OfflineProvider } from "@/lib/offline/OfflineProvider";
import { OfflineBanner } from "@/components/OfflineBanner";

// Todas as telas do motorista ficam dentro do modo offline: faixa de aviso,
// fila de envio e envio automático.
export default function MotoristaLayout({ children }: { children: React.ReactNode }) {
  return (
    <OfflineProvider>
      <OfflineBanner />
      {children}
    </OfflineProvider>
  );
}
