import type {
  ExtraPhone,
  MarketingLeadRow,
  MarketingListFile,
  PhoneListFile,
  PropertyPhoneRow,
  ScanTarget,
} from "../types/index";

export function soDigitos(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

export function chaveTelefone(raw: string): string {
  let d = soDigitos(raw);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

export function variantesBusca(digits: string, number = ""): string[] {
  const key = chaveTelefone(digits || number);
  const out = new Set<string>();
  if (number.trim()) out.add(number.trim());
  if (key) {
    out.add(key);
    if (!key.startsWith("55") && key.length >= 10) {
      out.add(`55${key}`);
      out.add(`+55${key}`);
    }
  }
  return [...out];
}

function preferirTelefone(phones: { number?: string; digits?: string; isActiveForBilling?: boolean }[]) {
  const billing = phones.filter((p) => p.isActiveForBilling);
  const pool = billing.length ? billing : phones;
  return pool[0] || null;
}

export function parsePhoneList(raw: string): PhoneListFile {
  const data = JSON.parse(raw) as PhoneListFile | PropertyPhoneRow[] | PropertyPhoneRow;
  if (Array.isArray(data)) return { properties: data, extras: [] };
  if (data && typeof data === "object" && Array.isArray((data as PhoneListFile).properties)) {
    return data as PhoneListFile;
  }
  if (data && typeof data === "object" && "phones" in (data as PropertyPhoneRow)) {
    return { properties: [data as PropertyPhoneRow], extras: [] };
  }
  throw new Error("JSON de telefones inválido.");
}

export function ehListaMarketing(raw: string): boolean {
  try {
    const data = JSON.parse(raw);
    return Boolean(data && typeof data === "object" && (data.mode === "marketing" || Array.isArray(data.leads)));
  } catch {
    return false;
  }
}

export function parseMarketingList(raw: string): MarketingListFile {
  const data = JSON.parse(raw) as MarketingListFile | MarketingLeadRow[];
  if (Array.isArray(data)) return { mode: "marketing", leads: data };
  if (data && typeof data === "object" && Array.isArray(data.leads)) {
    return { mode: "marketing", leads: data.leads };
  }
  throw new Error("JSON de marketing inválido. Esperado { mode, leads[] }.");
}

export function montarAlvosMarketing(file: MarketingListFile, extrasText: string): ScanTarget[] {
  const seen = new Set<string>();
  const alvos: ScanTarget[] = [];
  const add = (t: ScanTarget) => {
    const k = chaveTelefone(t.digits || t.telefone);
    if (k.length < 10 || seen.has(k)) return;
    seen.add(k);
    alvos.push({ ...t, digits: k, searchVariants: variantesBusca(k, t.telefone) });
  };
  for (const row of file.leads || []) {
    add({
      telefone: row.telefone,
      digits: chaveTelefone(row.telefone),
      searchVariants: [],
      propertyId: row.leadId || "",
      propertyCode: "",
      tenantName: "",
      status: row.origemAtual || "",
      fonte: "dm",
      leadId: row.leadId || "",
      tagSite: !!row.tagSite,
    });
  }
  for (const part of String(extrasText || "").split(/[\n,;]+/)) {
    const n = part.trim();
    if (!n) continue;
    add({
      telefone: n,
      digits: chaveTelefone(n),
      searchVariants: [],
      propertyId: "",
      propertyCode: "",
      tenantName: "",
      status: "extra",
      fonte: "extra",
    });
  }
  return alvos;
}

export function montarAlvos(
  file: PhoneListFile,
  extrasText: string
): ScanTarget[] {
  const seen = new Set<string>();
  const alvos: ScanTarget[] = [];

  const add = (t: ScanTarget) => {
    const k = chaveTelefone(t.digits || t.telefone);
    if (k.length < 10 || seen.has(k)) return;
    seen.add(k);
    alvos.push({ ...t, digits: k, searchVariants: variantesBusca(k, t.telefone) });
  };

  for (const row of file.properties || []) {
    const ph = preferirTelefone(row.phones || []);
    if (!ph) continue;
    add({
      telefone: ph.number || ph.digits || "",
      digits: ph.digits || chaveTelefone(ph.number || ""),
      searchVariants: ph.searchVariants || [],
      propertyId: row.propertyId || "",
      propertyCode: (row.propertyCode || "").trim(),
      tenantName: (row.tenantName || "").trim(),
      status: row.status || "",
      fonte: "dm",
    });
  }

  const extras: ExtraPhone[] = [...(file.extras || [])];
  for (const part of String(extrasText || "").split(/[\n,;]+/)) {
    const n = part.trim();
    if (!n) continue;
    extras.push({ number: n, digits: chaveTelefone(n), tipo: "extra" });
  }
  for (const ex of extras) {
    add({
      telefone: ex.number,
      digits: ex.digits || chaveTelefone(ex.number),
      searchVariants: [],
      propertyId: "",
      propertyCode: "",
      tenantName: "",
      status: "extra",
      fonte: "extra",
    });
  }

  return alvos;
}
