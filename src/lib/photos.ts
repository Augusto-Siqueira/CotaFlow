import { supabase } from "@/lib/supabase";

const BUCKET = "driver-photos";
const MAX_SIDE = 1280;

/** Reduz a foto da câmera (vários MB) para ~200 KB antes de enviar. */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao processar a foto."))),
      "image/jpeg",
      0.72
    )
  );
}

/** Envia para a pasta do próprio usuário e devolve o caminho gravado. */
export async function uploadPhoto(userId: string, file: File): Promise<string> {
  const blob = await compressImage(file);
  const day = new Date().toISOString().slice(0, 7);
  const path = `${userId}/${day}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  return path;
}

/** Link temporário (1 h por padrão) para a equipe ver uma foto. */
export async function photoUrl(path: string, seconds = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

/** Link temporário que faz o navegador BAIXAR a foto (com o nome de arquivo dado) em vez de abri-la. */
export async function photoDownloadUrl(path: string, filename: string, seconds = 300): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds, { download: filename });
  return data?.signedUrl ?? null;
}
