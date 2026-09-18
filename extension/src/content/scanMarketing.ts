import type {
  CapturedMessage,
  ContextoMarketing,
  MarketingRecord,
  ScanProgress,
  ScanResult,
  ScanTarget,
} from "../types/index";
import { extrairMensagem } from "../extractors/messages";
import {
  chegouInicioConversa,
  detectarContextoMarketing,
  selectAll,
  sessaoDeslogada,
  whatsappVersao,
} from "../selectors/whatsappSelectors";
import { ehEcoBot } from "../utils/bot";
import { EXTRA_SMOKE_PADRAO, linhaLog, LOTE_PADRAO, MAX_SCROLLS_INICIO, SMOKE_SCROLLS_MARKETING } from "../utils/log";
import { classificarOrigemExt } from "../utils/origem";
import { montarAlvosMarketing, parseMarketingList } from "../utils/phones";
import { abortFlag, abrirConversa, garantirSessao, rolarAteInicio, tituloConversaAtual } from "./navigate";
import type { ScanRequest } from "./scan";

type Emitter = (p: Partial<ScanProgress> & { log?: string }) => void;

const ctxVazio = (): ContextoMarketing => ({
  temCtwa: false,
  ctwaClid: "",
  anuncioInstagram: false,
  anuncioFacebook: false,
  quotedStatus: false,
  cardMarketplace: false,
});

function mergeCtx(a: ContextoMarketing, b: ReturnType<typeof detectarContextoMarketing>): ContextoMarketing {
  return {
    ...a,
    anuncioInstagram: a.anuncioInstagram || b.anuncioInstagram,
    anuncioFacebook: a.anuncioFacebook || b.anuncioFacebook,
    quotedStatus: a.quotedStatus || b.quotedStatus,
    cardMarketplace: a.cardMarketplace || b.cardMarketplace,
    temCtwa: a.temCtwa || b.anuncioInstagram || b.anuncioFacebook,
  };
}

function textoCliente(msgs: CapturedMessage[]): string {
  return msgs
    .filter((m) => m.remetente === "other")
    .map((m) => [m.quoted, m.texto].filter(Boolean).join(" "))
    .filter((t) => t && !ehEcoBot(t))
    .slice(0, 5)
    .join("\n")
    .trim();
}

export async function executarVarreduraMarketing(req: ScanRequest, emit: Emitter): Promise<ScanResult> {
  abortFlag.abort = false;
  garantirSessao();

  const logs: string[] = [];
  const push = (msg: string, extra?: Partial<ScanProgress>) => {
    const line = linhaLog(msg);
    logs.push(line);
    emit({ log: line, ...extra });
  };

  const opts = req.options;
  const smoke = !!opts.smoke;
  let file = { mode: "marketing" as const, leads: [] as { telefone: string }[] };
  try {
    if (req.phoneJson?.trim()) file = parseMarketingList(req.phoneJson);
  } catch {
    /* extras abaixo */
  }
  const extrasText = String(opts.extrasText || "").trim();
  const extrasUteis = extrasText && extrasText !== EXTRA_SMOKE_PADRAO ? extrasText : "";
  let alvos: ScanTarget[] = montarAlvosMarketing(file, extrasUteis);
  if (!alvos.length) {
    throw new Error("Importe fila-marketing.json no modo Marketing antes de varrer.");
  }
  if (smoke) alvos = alvos.slice(0, 3);
  else alvos = alvos.slice(0, Math.max(1, Number(opts.lote || LOTE_PADRAO) || LOTE_PADRAO));

  const progress: ScanProgress = {
    conversasFeitas: 0,
    conversasTotal: alvos.length,
    mensagens: 0,
    fotos: 0,
    semConversa: 0,
    erros: 0,
    pendentes: 0,
    log: "",
    running: true,
    smoke,
  };

  push(
    `Início marketing ${smoke ? "SMOKE" : "lote " + alvos.length} | WA ${whatsappVersao()} | ext ${req.extensaoVersao}`
  );

  const marketingRecords: MarketingRecord[] = [];
  const mensagens: CapturedMessage[] = [];
  const maxScrolls = smoke ? SMOKE_SCROLLS_MARKETING : MAX_SCROLLS_INICIO;

  for (const alvo of alvos) {
    if (abortFlag.abort) throw new Error("Varredura interrompida.");
    try {
      garantirSessao();
      const q = alvo.searchVariants[0] || alvo.telefone || alvo.digits;
      push(`Marketing DM ${alvo.telefone}`);
      const ok = await abrirConversa(q, alvo.searchVariants);
      progress.conversasFeitas += 1;
      if (!ok) {
        progress.semConversa += 1;
        const origem = alvo.tagSite ? "site" : "desconhecida";
        marketingRecords.push({
          telefone: alvo.telefone,
          leadId: alvo.leadId || "",
          semConversa: true,
          contexto: ctxVazio(),
          primeirasMsgs: [],
          origem,
          confianca: alvo.tagSite ? "alta" : "baixa",
          motivo: alvo.tagSite ? "sem_conversa_site" : "sem_conversa",
          precisaRevisao: !alvo.tagSite,
          trecho: "",
          imovelCodigo: "",
          campanhaSlug: "",
        });
        if (!alvo.tagSite) progress.pendentes += 1;
        push(`Sem conversa: ${alvo.telefone}`, progress);
        continue;
      }

      const contato = tituloConversaAtual() || alvo.telefone;
      const seen = new Map<string, CapturedMessage>();
      let ctx = ctxVazio();

      const harvest = async () => {
        ctx = mergeCtx(ctx, detectarContextoMarketing(document));
        for (const el of selectAll(document, "message")) {
          const msg = extrairMensagem(el, alvo.telefone, contato);
          if (!msg) continue;
          const id = msg.messageId || `${msg.dataIso}|${msg.hora}|${msg.texto.slice(0, 40)}`;
          if (seen.has(id)) continue;
          if (ehEcoBot(msg.texto) || ehEcoBot(msg.quoted)) continue;
          seen.set(id, msg);
        }
        return chegouInicioConversa();
      };

      await rolarAteInicio({ maxScrolls, onHarvest: harvest });

      const lista = [...seen.values()].sort((a, b) =>
        `${a.dataIso}${a.hora}`.localeCompare(`${b.dataIso}${b.hora}`)
      );
      const primeiras = lista.slice(0, 8);
      mensagens.push(...primeiras);
      const trecho = textoCliente(primeiras);
      const classif = classificarOrigemExt(trecho, ctx);
      let precisaRevisao = classif.origem === "desconhecida";
      if (!trecho && !ctx.anuncioInstagram && !ctx.anuncioFacebook && !ctx.quotedStatus && !ctx.cardMarketplace) {
        precisaRevisao = true;
      }

      marketingRecords.push({
        telefone: alvo.telefone,
        leadId: alvo.leadId || "",
        semConversa: false,
        contexto: ctx,
        primeirasMsgs: primeiras.map((m) => ({ remetente: m.remetente, texto: m.texto })),
        origem: classif.origem,
        confianca: classif.confianca,
        motivo: classif.motivo,
        precisaRevisao,
        trecho: trecho.slice(0, 500),
        imovelCodigo: classif.imovelCodigo,
        campanhaSlug: classif.campanhaSlug,
      });

      progress.mensagens = marketingRecords.filter((r) => !r.semConversa).length;
      progress.fotos = marketingRecords.filter((r) => r.origem === "meta").length;
      progress.pendentes = marketingRecords.filter((r) => r.precisaRevisao).length;
      push(
        `${alvo.telefone} → ${classif.origem}/${classif.confianca} (${classif.motivo})`,
        progress
      );
    } catch (e) {
      if (sessaoDeslogada() || /interrompida/i.test(String(e))) throw e;
      progress.erros += 1;
      progress.conversasFeitas += 1;
      push(`Erro ${alvo.telefone}: ${e instanceof Error ? e.message : String(e)}`, progress);
    }
  }

  progress.running = false;
  push(
    `Fim marketing | ${marketingRecords.length} | meta ${progress.fotos} | revisão ${progress.pendentes}`,
    progress
  );

  return {
    geradoEm: new Date().toISOString(),
    extensaoVersao: req.extensaoVersao,
    whatsappVersao: whatsappVersao(),
    opcoes: opts,
    records: [],
    marketingRecords,
    mensagens,
    logs,
    progress: { ...progress, running: false, log: logs.at(-1) || "" },
  };
}
