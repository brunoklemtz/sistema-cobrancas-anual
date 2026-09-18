import type { MarketingRecord, ReadingRecord } from "../types/index";

function cell(v: unknown): string {
  const s = String(v ?? "");
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function recordsToCsv(rows: ReadingRecord[]): string {
  const header = [
    "propertyCode",
    "propertyId",
    "tenantName",
    "telefone",
    "fonte",
    "dataMensagem",
    "agua",
    "luz",
    "temFoto",
    "fotoFileName",
    "precisaRevisao",
    "semConversa",
    "tipoConflito",
    "trecho",
  ];
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.propertyCode,
        r.propertyId,
        r.tenantName,
        r.telefone,
        r.fonte,
        r.dataMensagem,
        r.agua ?? "",
        r.luz ?? "",
        r.temFoto,
        r.fotoFileName,
        r.precisaRevisao,
        r.semConversa,
        r.tipoConflito,
        r.trecho,
      ]
        .map(cell)
        .join(";")
    );
  }
  return lines.join("\n");
}

export function marketingToCsv(rows: MarketingRecord[]): string {
  const header = [
    "telefone",
    "leadId",
    "origem",
    "confianca",
    "motivo",
    "semConversa",
    "precisaRevisao",
    "anuncioInstagram",
    "anuncioFacebook",
    "quotedStatus",
    "cardMarketplace",
    "imovelCodigo",
    "campanhaSlug",
    "trecho",
  ];
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.telefone,
        r.leadId,
        r.origem,
        r.confianca,
        r.motivo,
        r.semConversa,
        r.precisaRevisao,
        r.contexto.anuncioInstagram,
        r.contexto.anuncioFacebook,
        r.contexto.quotedStatus,
        r.contexto.cardMarketplace,
        r.imovelCodigo,
        r.campanhaSlug,
        r.trecho,
      ]
        .map(cell)
        .join(";")
    );
  }
  return lines.join("\n");
}
