const RE_AGUA = /(agua|água)/i;
const RE_LUZ = /(luz|energia|kwh|kw\/h)/i;
const RE_LEITURA = /(leitura|medidor|rel[oó]gio)/i;
const RE_NUM = /(\d{3,7}(?:[.,]\d+)?)/;
const RE_CODIGO =
  /\b((?:BH|CK|REC|RL|AG|VZ|MP|LOFT|CASA)\s*-?\s*\d{1,3}[A-Z]?|\d{3}(?:\s?[A-Z])?)\b/i;

export function candidatoLeitura(texto: string): boolean {
  const t = String(texto || "");
  if (!t.trim()) return false;
  if (!(RE_AGUA.test(t) || RE_LUZ.test(t) || RE_LEITURA.test(t))) return false;
  return RE_NUM.test(t) || /\d/.test(t);
}

export function extrairCodigoImovel(texto: string, fallback = ""): string {
  const m = String(texto || "").toUpperCase().match(RE_CODIGO);
  if (!m) return fallback.trim();
  return m[1].replace(/\s+/g, " ").trim();
}

function numeroPerto(texto: string, re: RegExp): number | null {
  const m = texto.match(re);
  if (!m || m.index == null) return null;
  const end = m.index + m[0].length;
  const depois = texto.slice(end, end + 32);
  const antes = texto.slice(Math.max(0, m.index - 18), m.index);
  const nDepois = [...depois.matchAll(/(\d{3,7})/g)].map((n) => Number(n[1]));
  if (nDepois.length) return nDepois[0];
  const nAntes = [...antes.matchAll(/(\d{3,7})/g)].map((n) => Number(n[1]));
  if (nAntes.length) return nAntes[nAntes.length - 1];
  return null;
}

export function extrairLeituras(texto: string): {
  agua: number | null;
  luz: number | null;
  precisaRevisao: boolean;
} {
  const t = String(texto || "");
  const temSinal = RE_AGUA.test(t) || RE_LUZ.test(t) || RE_LEITURA.test(t);
  if (!temSinal) {
    return { agua: null, luz: null, precisaRevisao: false };
  }

  let agua = numeroPerto(t, RE_AGUA);
  let luz = numeroPerto(t, RE_LUZ);

  const todos = [...t.matchAll(/(\d{3,7})/g)].map((n) => Number(n[1]));
  let precisaRevisao = false;

  if (agua == null && luz == null) precisaRevisao = true;
  if (agua != null && luz != null && agua === luz) precisaRevisao = true;
  if ((RE_AGUA.test(t) && agua == null) || (RE_LUZ.test(t) && luz == null)) precisaRevisao = true;
  if (todos.length > 3) precisaRevisao = true;

  if (Number.isNaN(agua as number)) agua = null;
  if (Number.isNaN(luz as number)) luz = null;

  return { agua, luz, precisaRevisao };
}
