export function linhaLog(msg: string): string {
  const t = new Date().toISOString().slice(11, 19);
  return `[${t}] ${msg}`;
}

export const EXT_NOME = "varredura-leituras-whatsapp";
export const GRUPO_PADRAO = "LEITURAS MENSAL";
export const SMOKE_MAX_MENSAGENS = 5;
export const SMOKE_MAX_FOTOS = 1;
export const SMOKE_SCROLLS = 1;
export const MAX_SCROLLS = 36;
export const EXTRA_SMOKE_PADRAO = "+55 47 9908-8553";
export const MAX_SCROLLS_INICIO = 48;
export const SMOKE_SCROLLS_MARKETING = 10;
export const LOTE_PADRAO = 20;
