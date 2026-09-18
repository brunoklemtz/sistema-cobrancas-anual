export type PhoneEntry = {
  number: string;
  digits: string;
  isActiveForBilling?: boolean;
  searchVariants?: string[];
  label?: string;
};

export type PropertyPhoneRow = {
  propertyId?: string;
  propertyCode?: string;
  tenantName?: string;
  status?: string;
  phones: PhoneEntry[];
};

export type ExtraPhone = {
  number: string;
  digits?: string;
  tipo?: string;
  nota?: string;
};

export type PhoneListFile = {
  properties?: PropertyPhoneRow[];
  extras?: ExtraPhone[];
};

export type ScanTarget = {
  telefone: string;
  digits: string;
  searchVariants: string[];
  propertyId: string;
  propertyCode: string;
  tenantName: string;
  status: string;
  fonte: "dm" | "extra";
  leadId?: string;
  tagSite?: boolean;
};

export type ScanModo = "leituras" | "marketing" | "atendimento";

export type ScanOptions = {
  modo: ScanModo;
  lote: number;
  fromIso: string;
  toIso: string;
  includeDms: boolean;
  includeGrupo: boolean;
  baixarFotos: boolean;
  extrasText: string;
  smoke: boolean;
  grupoNome: string;
};

export type ContextoMarketing = {
  temCtwa: boolean;
  ctwaClid: string;
  anuncioInstagram: boolean;
  anuncioFacebook: boolean;
  quotedStatus: boolean;
  cardMarketplace: boolean;
};

export type MarketingLeadRow = {
  telefone: string;
  leadId?: string;
  origemAtual?: string;
  confiancaAtual?: string;
  mensagemInicial?: string;
  tagSite?: boolean;
};

export type MarketingListFile = {
  mode?: "marketing";
  leads: MarketingLeadRow[];
};

export type MarketingMsg = {
  remetente: "me" | "other";
  texto: string;
};

export type MarketingRecord = {
  telefone: string;
  leadId: string;
  semConversa: boolean;
  contexto: ContextoMarketing;
  primeirasMsgs: MarketingMsg[];
  origem: string;
  confianca: string;
  motivo: string;
  precisaRevisao: boolean;
  trecho: string;
  imovelCodigo: string;
  campanhaSlug: string;
};

export type CapturedMessage = {
  telefone: string;
  contato: string;
  texto: string;
  dataIso: string;
  hora: string;
  remetente: "me" | "other";
  messageId: string;
  quoted: string;
  temImagem: boolean;
  temDocumento: boolean;
};

export type AtendimentoMessage = {
  remetente: "me" | "other";
  texto: string;
  dataIso: string;
  hora: string;
};

export type AtendimentoOptions = {
  site: "whatsapp" | "airbnb" | "booking";
  lote: number;
  tom: "simpatico" | "profissional" | "direto" | "vendedor";
  objetivo: string;
  carregarHistorico: boolean;
  maxScrolls: number;
};

export type AtendimentoDraftRecord = {
  site: AtendimentoOptions["site"];
  conversaId: string;
  contato: string;
  status: "rascunho" | "ignorado" | "erro";
  motivo: string;
  mensagem: string;
  criadoEm: string;
};

export type AtendimentoResult = {
  geradoEm: string;
  extensaoVersao: string;
  site: AtendimentoOptions["site"];
  opcoes: AtendimentoOptions;
  rascunhos: AtendimentoDraftRecord[];
  logs: string[];
  progress: ScanProgress;
};

export type ReadingRecord = {
  propertyCode: string;
  propertyId: string;
  tenantName: string;
  telefone: string;
  fonte: "dm" | "grupo" | "extra";
  dataMensagem: string;
  agua: number | null;
  luz: number | null;
  temFoto: boolean;
  fotoFileName: string;
  fotoBase64: string;
  trecho: string;
  precisaRevisao: boolean;
  semConversa: boolean;
  tipoConflito: string;
  messageId: string;
};

export type ScanProgress = {
  conversasFeitas: number;
  conversasTotal: number;
  mensagens: number;
  fotos: number;
  semConversa: number;
  erros: number;
  pendentes: number;
  log: string;
  running: boolean;
  smoke: boolean;
};

export type ScanResult = {
  geradoEm: string;
  extensaoVersao: string;
  whatsappVersao: string;
  opcoes: ScanOptions;
  records: ReadingRecord[];
  marketingRecords: MarketingRecord[];
  mensagens: CapturedMessage[];
  logs: string[];
  progress: ScanProgress;
};
