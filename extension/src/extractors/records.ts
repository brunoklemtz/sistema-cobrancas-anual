import type { CapturedMessage, ReadingRecord, ScanTarget } from "../types/index";
import { candidatoLeitura, extrairCodigoImovel, extrairLeituras } from "../utils/readings";
import { nomeFoto } from "../utils/photos";

let seqFoto = 0;

export function resetSeqFoto() {
  seqFoto = 0;
}

export function mensagemParaRegistro(
  msg: CapturedMessage,
  alvo: Partial<ScanTarget> & { fonte: ReadingRecord["fonte"] },
  opts: { fotoBase64: string | null; baixarFotos: boolean }
): ReadingRecord | null {
  const temMidia = msg.temImagem || msg.temDocumento;
  const texto = [msg.texto, msg.quoted].filter(Boolean).join(" ");
  const candidato = candidatoLeitura(texto) || temMidia;
  if (!candidato) return null;

  const leituras = extrairLeituras(texto);
  const codigo =
    alvo.propertyCode ||
    extrairCodigoImovel(texto) ||
    extrairCodigoImovel(msg.quoted);

  let precisaRevisao = leituras.precisaRevisao;
  if (!codigo) precisaRevisao = true;
  if (temMidia && leituras.agua == null && leituras.luz == null) precisaRevisao = true;
  if (alvo.fonte === "grupo" && !codigo) precisaRevisao = true;

  let fotoFileName = "";
  let fotoBase64 = "";
  if (msg.temImagem) {
    if (opts.fotoBase64) {
      seqFoto += 1;
      fotoFileName = nomeFoto(msg.dataIso || "s-data", codigo || "SEM-CODIGO", seqFoto);
      fotoBase64 = opts.fotoBase64;
    } else if (opts.baixarFotos) {
      precisaRevisao = true;
    }
  }

  return {
    propertyCode: codigo || "",
    propertyId: alvo.propertyId || "",
    tenantName: alvo.tenantName || "",
    telefone: alvo.telefone || msg.telefone,
    fonte: alvo.fonte,
    dataMensagem: msg.dataIso,
    agua: leituras.agua,
    luz: leituras.luz,
    temFoto: msg.temImagem,
    fotoFileName,
    fotoBase64,
    trecho: (msg.texto || msg.quoted || "").slice(0, 280),
    precisaRevisao,
    semConversa: false,
    tipoConflito: "",
    messageId: msg.messageId,
  };
}

export function registroSemConversa(alvo: ScanTarget): ReadingRecord {
  return {
    propertyCode: alvo.propertyCode,
    propertyId: alvo.propertyId,
    tenantName: alvo.tenantName,
    telefone: alvo.telefone,
    fonte: alvo.fonte === "extra" ? "extra" : "dm",
    dataMensagem: "",
    agua: null,
    luz: null,
    temFoto: false,
    fotoFileName: "",
    fotoBase64: "",
    trecho: "",
    precisaRevisao: true,
    semConversa: true,
    tipoConflito: "",
    messageId: "",
  };
}
