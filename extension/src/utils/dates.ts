export function isoHoje(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function padraoUltimosDias(dias = 30): { fromIso: string; toIso: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (dias - 1));
  return { fromIso: isoHoje(from), toIso: isoHoje(to) };
}

/** Aceita ISO, BR 14/09/2026, [14:35, 14/09/2026] */
export function parseDataMensagem(raw: string): { dataIso: string; hora: string } | null {
  const s = String(raw || "").trim();
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (iso) {
    return { dataIso: `${iso[1]}-${iso[2]}-${iso[3]}`, hora: iso[4] ? `${iso[4]}:${iso[5]}` : "" };
  }
  const br = s.match(/\[?\s*(\d{1,2}):(\d{2})\s*,\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const dd = br[3].padStart(2, "0");
    const mm = br[4].padStart(2, "0");
    return { dataIso: `${br[5]}-${mm}-${dd}`, hora: `${br[1].padStart(2, "0")}:${br[2]}` };
  }
  const soData = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (soData) {
    const dd = soData[1].padStart(2, "0");
    const mm = soData[2].padStart(2, "0");
    return { dataIso: `${soData[3]}-${mm}-${dd}`, hora: "" };
  }
  return null;
}

export function noPeriodo(dataIso: string, fromIso: string, toIso: string): boolean {
  if (!dataIso) return false;
  return dataIso >= fromIso && dataIso <= toIso;
}
