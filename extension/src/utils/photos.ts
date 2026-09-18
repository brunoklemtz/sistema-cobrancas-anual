export function nomeFoto(dataIso: string, propertyCode: string, seq: number): string {
  const code = (propertyCode || "SEM-CODIGO")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w.-]/g, "");
  return `${dataIso}_${code}_${seq}.jpg`;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler blob"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

export async function urlToBase64(src: string): Promise<string | null> {
  if (!src) return null;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size || !/^image\//.test(blob.type || "image/jpeg")) {
      if (!blob.size) return null;
    }
    return blobToBase64(blob);
  } catch {
    return null;
  }
}
