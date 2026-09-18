import {
  messageImages,
  temImagem,
} from "../selectors/whatsappSelectors";
import { urlToBase64 } from "../utils/photos";

export async function extrairFotoBase64(el: Element): Promise<string | null> {
  if (!temImagem(el)) return null;
  const imgs = messageImages(el);
  for (const img of imgs) {
    img.scrollIntoView({ block: "nearest" });
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith("data:image/gif")) continue;
    const b64 = await urlToBase64(src);
    if (b64 && b64.length > 80) return b64;
  }
  return null;
}
