import type {
  CapturedMessage,
  ReadingRecord,
  ScanOptions,
  ScanProgress,
  ScanResult,
  ScanTarget,
} from "../types/index";
import { extrairMensagem } from "../extractors/messages";
import { extrairFotoBase64 } from "../extractors/photos";
import { mensagemParaRegistro, registroSemConversa, resetSeqFoto } from "../extractors/records";
import { selectAll, sessaoDeslogada, whatsappVersao } from "../selectors/whatsappSelectors";
import { noPeriodo } from "../utils/dates";
import { dedupeRegistros } from "../utils/dedupe";
import {
  EXTRA_SMOKE_PADRAO,
  linhaLog,
  MAX_SCROLLS,
  SMOKE_MAX_FOTOS,
  SMOKE_MAX_MENSAGENS,
  SMOKE_SCROLLS,
} from "../utils/log";
import { montarAlvos, parsePhoneList } from "../utils/phones";
import { abortFlag, abrirConversa, garantirSessao, rolarHistorico, tituloConversaAtual } from "./navigate";

export type ScanRequest = {
  options: ScanOptions;
  phoneJson: string;
  extensaoVersao: string;
};

type Emitter = (p: Partial<ScanProgress> & { log?: string }) => void;

function vazioProgress(total: number, smoke: boolean): ScanProgress {
  return {
    conversasFeitas: 0,
    conversasTotal: total,
    mensagens: 0,
    fotos: 0,
    semConversa: 0,
    erros: 0,
    pendentes: 0,
    log: "",
    running: true,
    smoke,
  };
}

export async function executarVarredura(req: ScanRequest, emit: Emitter): Promise<ScanResult> {
  abortFlag.abort = false;
  resetSeqFoto();
  garantirSessao();

  const logs: string[] = [];
  const push = (msg: string, extra?: Partial<ScanProgress>) => {
    const line = linhaLog(msg);
    logs.push(line);
    emit({ log: line, ...extra });
  };

  const opts = req.options;
  const smoke = !!opts.smoke;
  const fromIso = opts.fromIso;
  const toIso = opts.toIso;

  let file;
  try {
    file = parsePhoneList(req.phoneJson?.trim() || '{"properties":[],"extras":[]}');
  } catch (e) {
    file = { properties: [], extras: [] };
    if (opts.includeDms && req.phoneJson.trim()) {
      throw e;
    }
  }

  let alvos: ScanTarget[] = [];
  if (smoke) {
    const extras = montarAlvos(
      { properties: [], extras: [] },
      opts.extrasText?.trim() || EXTRA_SMOKE_PADRAO
    );
    alvos = extras.slice(0, 1);
  } else {
    alvos = montarAlvos(
      opts.includeDms ? file : { properties: [], extras: file.extras || [] },
      opts.extrasText || ""
    );
  }

  const fazerGrupo = opts.includeGrupo || smoke;
  const total = (fazerGrupo ? 1 : 0) + alvos.length;
  const progress = vazioProgress(total, smoke);

  push(
    `Início ${smoke ? "SMOKE" : "varredura"} | ${fromIso} → ${toIso} | WA ${whatsappVersao()} | ext ${req.extensaoVersao}`
  );

  const mensagens: CapturedMessage[] = [];
  const records: ReadingRecord[] = [];
  let fotosOk = 0;
  let msgsCand = 0;

  const limits = {
    maxScrolls: smoke ? SMOKE_SCROLLS : MAX_SCROLLS,
    maxMsgs: smoke ? SMOKE_MAX_MENSAGENS : Infinity,
    maxFotos: smoke ? SMOKE_MAX_FOTOS : Infinity,
    baixarFotos: smoke ? true : opts.baixarFotos,
  };

  async function varrerPainel(alvo: Partial<ScanTarget> & { fonte: ReadingRecord["fonte"]; telefone: string }) {
    garantirSessao();
    const contato = tituloConversaAtual() || alvo.tenantName || alvo.telefone;
    const seen = new Map<string, CapturedMessage>();
    const fotos = new Map<string, string | null>();
    let oldest: string | null = null;

    const harvest = async () => {
      for (const el of selectAll(document, "message")) {
        const msg = extrairMensagem(el, alvo.telefone, contato);
        if (!msg) continue;
        const id = msg.messageId || `${msg.dataIso}|${msg.hora}|${msg.texto.slice(0, 40)}`;
        if (msg.dataIso && (!oldest || msg.dataIso < oldest)) oldest = msg.dataIso;
        if (seen.has(id)) continue;
        seen.set(id, msg);
        const noPrazo = !msg.dataIso || noPeriodo(msg.dataIso, fromIso, toIso);
        if (
          noPrazo &&
          msg.temImagem &&
          limits.baixarFotos &&
          fotosOk < limits.maxFotos &&
          !fotos.has(id)
        ) {
          const b64 = await extrairFotoBase64(el);
          fotos.set(id, b64);
          if (b64) fotosOk += 1;
        } else if (msg.temImagem && !fotos.has(id)) {
          fotos.set(id, null);
        }
      }
      return oldest;
    };

    await rolarHistorico({
      fromIso,
      maxScrolls: limits.maxScrolls,
      onHarvest: harvest,
    });

    const lista = [...seen.values()].filter((m) => !m.dataIso || noPeriodo(m.dataIso, fromIso, toIso));
    lista.sort((a, b) => `${a.dataIso}${a.hora}`.localeCompare(`${b.dataIso}${b.hora}`));

    let usados = 0;
    for (const msg of lista) {
      if (abortFlag.abort) throw new Error("Varredura interrompida.");
      if (usados >= limits.maxMsgs) break;
      const id = msg.messageId || `${msg.dataIso}|${msg.hora}|${msg.texto.slice(0, 40)}`;
      const rec = mensagemParaRegistro(msg, alvo, {
        fotoBase64: fotos.get(id) || null,
        baixarFotos: limits.baixarFotos,
      });
      if (!rec) continue;
      usados += 1;
      msgsCand += 1;
      mensagens.push(msg);
      records.push(rec);
      if (rec.precisaRevisao) progress.pendentes += 1;
      if (rec.temFoto) progress.fotos += 1;
    }

    progress.mensagens = msgsCand;
    progress.fotos = records.filter((r) => r.temFoto).length;
    progress.pendentes = records.filter((r) => r.precisaRevisao).length;
    push(
      `Conversa "${contato}" | tel ${alvo.telefone || "-"} | msgs ${lista.length} | candidatos ${usados} | fotos no lote ${records.filter((r) => r.telefone === alvo.telefone && r.temFoto).length}`,
      progress
    );
  }

  if (fazerGrupo) {
    try {
      garantirSessao();
      const nome = opts.grupoNome || "LEITURAS MENSAL";
      push(`Abrindo grupo ${nome}`);
      const ok = await abrirConversa(nome, [nome]);
      progress.conversasFeitas += 1;
      if (!ok) {
        progress.erros += 1;
        push(`Falha: grupo ${nome} não encontrado`, progress);
      } else {
        await varrerPainel({
          fonte: "grupo",
          telefone: "",
          propertyCode: "",
          propertyId: "",
          tenantName: nome,
        });
      }
    } catch (e) {
      if (sessaoDeslogada()) throw e;
      progress.erros += 1;
      push(`Erro no grupo: ${e instanceof Error ? e.message : String(e)}`, progress);
      if (/deslogado|QR Code|interrompida/i.test(String(e))) throw e;
    }
  }

  for (const alvo of alvos) {
    if (abortFlag.abort) throw new Error("Varredura interrompida.");
    try {
      garantirSessao();
      const q = alvo.searchVariants[0] || alvo.telefone || alvo.digits;
      push(`Abrindo DM ${alvo.propertyCode || "extra"} ${alvo.telefone}`);
      const ok = await abrirConversa(q, alvo.searchVariants);
      progress.conversasFeitas += 1;
      if (!ok) {
        progress.semConversa += 1;
        records.push(registroSemConversa(alvo));
        progress.pendentes += 1;
        push(`Sem conversa: ${alvo.telefone}`, progress);
        continue;
      }
      await varrerPainel({ ...alvo, fonte: alvo.fonte === "extra" ? "extra" : "dm" });
    } catch (e) {
      if (sessaoDeslogada() || /interrompida/i.test(String(e))) throw e;
      progress.erros += 1;
      progress.conversasFeitas += 1;
      push(`Erro ${alvo.telefone}: ${e instanceof Error ? e.message : String(e)}`, progress);
    }
  }

  const finalRecords = dedupeRegistros(records);
  progress.running = false;
  progress.pendentes = finalRecords.filter((r) => r.precisaRevisao).length;
  progress.mensagens = msgsCand;
  progress.fotos = finalRecords.filter((r) => r.temFoto).length;
  push(`Fim | registros ${finalRecords.length} | revisão ${progress.pendentes} | erros ${progress.erros}`, progress);

  return {
    geradoEm: new Date().toISOString(),
    extensaoVersao: req.extensaoVersao,
    whatsappVersao: whatsappVersao(),
    opcoes: opts,
    records: finalRecords,
    mensagens,
    logs,
    progress: { ...progress, running: false, log: logs.at(-1) || "" },
    marketingRecords: [],
  };
}

export function pararVarredura() {
  abortFlag.abort = true;
}
