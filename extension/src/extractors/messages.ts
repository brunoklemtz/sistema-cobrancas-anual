import type { CapturedMessage } from "../types/index";
import { parseDataMensagem } from "../utils/dates";
import {
  messageBodyText,
  messageIdOf,
  prePlainTextOf,
  quotedTextOf,
  remetenteOf,
  temDocumento,
  temImagem,
} from "../selectors/whatsappSelectors";

export function extrairMensagem(
  el: Element,
  telefone: string,
  contato: string
): CapturedMessage | null {
  const messageId = messageIdOf(el);
  const pre = prePlainTextOf(el);
  const parsed = parseDataMensagem(pre);
  const texto = messageBodyText(el);
  const quoted = quotedTextOf(el);
  const img = temImagem(el);
  const doc = temDocumento(el);
  if (!messageId && !texto && !img) return null;
  if (!parsed && !texto && !img) return null;
  return {
    telefone,
    contato,
    texto,
    dataIso: parsed?.dataIso || "",
    hora: parsed?.hora || "",
    remetente: remetenteOf(el),
    messageId,
    quoted,
    temImagem: img,
    temDocumento: doc,
  };
}
