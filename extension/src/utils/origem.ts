export type OrigemExt = "meta" | "marketplace" | "status" | "site" | "desconhecida";
export type ConfiancaExt = "alta" | "media" | "baixa";

export type ContextoExt = {
  temCtwa?: boolean;
  ctwaClid?: string;
  anuncioInstagram?: boolean;
  anuncioFacebook?: boolean;
  quotedStatus?: boolean;
  cardMarketplace?: boolean;
};

export type ClassificacaoExt = {
  origem: OrigemExt;
  confianca: ConfiancaExt;
  imovelCodigo: string;
  campanhaSlug: string;
  motivo: string;
};

const RE_CAMPANHA = /campanha\s+([A-Za-z0-9_-]+)/i;
const RE_INTERESSE = /interesse\s+(?:no\s+im[oó]vel\s+)?([A-Za-z0-9][A-Za-z0-9\s._-]{0,20})/i;
const RE_CODIGO = /\b([A-Z]{1,4}\s?\d{1,3}[A-Z]?)\b/i;
const RE_MARKETPLACE = /\b(marketplace|face\s*market|an[uú]ncio\s+do\s+face)\b/i;
const RE_STATUS_TEXTO = /\b(vi\s+no\s+status|status\s+do\s+whats|seu\s+status|voc[eê]\s*[·•.\-]?\s*status)\b/i;
const RE_VALOR_DESSA = /valor dessa/i;
const RE_META_TEXTO = /\b(meta\s*ads|instagram|an[uú]ncio|propaganda|facebook\s*ads)\b/i;
const RE_ANUNCIO_META = /an[uú]ncio\s+(do\s+|no\s+)?(instagram|facebook|\bfb\b)/i;
const RE_CARTAO_ADS = /an[uú]ncio\s+do\s+(instagram|facebook)/i;
const RE_ICE = /como podemos ajudar/i;
const RE_PASSARAM_NUMERO = /me passaram.{0,60}n[uú]mero/i;
const RE_CARD_MP = /informa[cç][oõ]es do vendedor|detalhes do vendedor/i;

function limparCodigo(raw: string) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .slice(0, 20);
}

/** Espelho das regras do site (lib/marketing/origem.ts). O script aplicar reclassifica. */
export function classificarOrigemExt(texto: string, ctx?: ContextoExt): ClassificacaoExt {
  const t = String(texto || "").trim();
  const temCtwa = Boolean(ctx?.temCtwa || ctx?.anuncioInstagram || ctx?.anuncioFacebook);
  const campanha = t.match(RE_CAMPANHA)?.[1] || "";
  const interesse = limparCodigo(t.match(RE_INTERESSE)?.[1] || "");
  const codigo = interesse || limparCodigo(t.match(RE_CODIGO)?.[1] || "");

  if (temCtwa || ctx?.anuncioInstagram || ctx?.anuncioFacebook) {
    return {
      origem: "meta",
      confianca: "alta",
      imovelCodigo: codigo,
      campanhaSlug: campanha,
      motivo: ctx?.anuncioInstagram ? "cartao_instagram" : ctx?.anuncioFacebook ? "cartao_facebook" : "ctwa_clid",
    };
  }
  if (RE_CARTAO_ADS.test(t) || RE_ICE.test(t) || RE_ANUNCIO_META.test(t) || RE_PASSARAM_NUMERO.test(t)) {
    return {
      origem: "meta",
      confianca: "alta",
      imovelCodigo: codigo,
      campanhaSlug: campanha,
      motivo: RE_PASSARAM_NUMERO.test(t) ? "texto_passaram_numero" : "texto_anuncio_meta",
    };
  }
  if (ctx?.quotedStatus || RE_STATUS_TEXTO.test(t) || RE_VALOR_DESSA.test(t)) {
    return {
      origem: "status",
      confianca: "alta",
      imovelCodigo: codigo,
      campanhaSlug: "",
      motivo: ctx?.quotedStatus ? "quoted_status" : RE_VALOR_DESSA.test(t) ? "texto_valor_dessa" : "texto_status",
    };
  }
  if (campanha || (interesse && /tenho interesse|interesse no imóvel/i.test(t))) {
    return {
      origem: "meta",
      confianca: campanha ? "alta" : "media",
      imovelCodigo: codigo,
      campanhaSlug: campanha,
      motivo: campanha ? "texto_campanha" : "texto_interesse",
    };
  }
  if (RE_META_TEXTO.test(t) && codigo) {
    return {
      origem: "meta",
      confianca: "media",
      imovelCodigo: codigo,
      campanhaSlug: "",
      motivo: "texto_meta",
    };
  }
  if (ctx?.cardMarketplace || RE_MARKETPLACE.test(t) || RE_CARD_MP.test(t)) {
    return {
      origem: "marketplace",
      confianca: "alta",
      imovelCodigo: codigo,
      campanhaSlug: "",
      motivo: ctx?.cardMarketplace || RE_CARD_MP.test(t) ? "card_marketplace" : "texto_marketplace",
    };
  }
  if (t) {
    return {
      origem: "marketplace",
      confianca: "media",
      imovelCodigo: codigo,
      campanhaSlug: "",
      motivo: "inicio_livre",
    };
  }
  return {
    origem: "desconhecida",
    confianca: "baixa",
    imovelCodigo: codigo,
    campanhaSlug: "",
    motivo: "sem_sinal",
  };
}
