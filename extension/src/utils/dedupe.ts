import type { ReadingRecord } from "../types/index";

function score(r: ReadingRecord): number {
  let n = 0;
  if (r.temFoto && r.fotoBase64) n += 4;
  if (r.agua != null || r.luz != null) n += 3;
  if (!r.precisaRevisao) n += 1;
  return n;
}

function marcarConflitos(copies: ReadingRecord[], util: "agua" | "luz") {
  const map = new Map<string, ReadingRecord[]>();
  for (const r of copies) {
    if (r[util] == null) continue;
    const k = `${r.propertyCode}|${r.dataMensagem}|${util}`;
    const arr = map.get(k) || [];
    arr.push(r);
    map.set(k, arr);
  }
  for (const grupo of map.values()) {
    const nums = new Set(grupo.map((g) => g[util]));
    if (nums.size > 1) {
      for (const g of grupo) {
        g.precisaRevisao = true;
        g.tipoConflito = "reading_conflict";
      }
    }
  }
}

/** Chave: propertyCode + dataMensagem + utilidade. Conflito de números → revisão, sem escolher. */
export function dedupeRegistros(rows: ReadingRecord[]): ReadingRecord[] {
  const copies = rows.map((r) => ({ ...r }));
  marcarConflitos(copies, "agua");
  marcarConflitos(copies, "luz");

  const buckets = new Map<string, ReadingRecord[]>();
  for (const r of copies) {
    const k = `${r.propertyCode}|${r.dataMensagem}|${r.agua}|${r.luz}|${r.tipoConflito}`;
    const arr = buckets.get(k) || [];
    arr.push(r);
    buckets.set(k, arr);
  }

  const out: ReadingRecord[] = [];
  for (const grupo of buckets.values()) {
    if (grupo[0].tipoConflito === "reading_conflict") {
      out.push(...grupo);
      continue;
    }
    grupo.sort((a, b) => score(b) - score(a));
    out.push(grupo[0]);
  }
  return out;
}
