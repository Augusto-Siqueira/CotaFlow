"use client";

// Botões de foto do app do motorista: câmera ou galeria.
//
// "Galeria" existe para o celular com pouca memória: lá o Android pode fechar o
// navegador enquanto a câmera está aberta ("insuficiência de memória") e a foto
// se perde. Tirando a foto antes, pela câmera do celular, e escolhendo na
// galeria, o navegador não precisa ficar em segundo plano com a câmera aberta.

const btn =
  "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-navy-300 px-3 py-3 text-sm font-medium text-navy-700 hover:border-brand-500";

export function PhotoPicker({
  cameraLabel,
  onFiles,
  onBeforeOpen,
}: {
  cameraLabel: string;
  onFiles: (list: FileList | null) => void;
  /** Chamado ao tocar num dos botões, antes de sair para a câmera/galeria. */
  onBeforeOpen?: () => void;
}) {
  const input = (camera: boolean) => (
    <input
      type="file"
      accept="image/*"
      {...(camera ? { capture: "environment" as const } : { multiple: true })}
      className="sr-only"
      onClick={onBeforeOpen}
      onChange={(e) => {
        onFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <label className={btn}>
        📷 {cameraLabel}
        {input(true)}
      </label>
      <label className={btn}>
        🖼️ Galeria
        {input(false)}
      </label>
    </div>
  );
}
