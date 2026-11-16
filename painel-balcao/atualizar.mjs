import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  aguardarNuvem,
  aplicarDashboard,
  aplicarEmail,
  aplicarPlanilha,
  gravarBase,
  gravarStatus,
  lerBase,
  marcarFonte,
  pastaDados,
  tryLock,
  unlock,
} from "./base.mjs";
import { baixarExportacao, conectarChrome, lerEmailsReserva } from "./chrome.mjs";
import { lerDashboardDia } from "./dashboard.mjs";
import { telOk } from "./airbnb-telefone.mjs";
import { gravarTelefoneArtaxChrome } from "./artax-telefone.mjs";
import { assuntoDeReservaNova, reservaDoEmail } from "./email.mjs";
import { linhasDaPlanilha } from "./planilha.mjs";
import { hojeSp, somarDias } from "./vista.mjs";

const FIM = "2027-03-31";
const raiz = path.dirname(fileURLToPath(import.meta.url));

function carregarEnv() {
  for (const arquivo of [path.join(raiz, "..", ".env.local"), "C:/dev/site/.env.local"]) {
    if (!fs.existsSync(arquivo)) continue;
    for (const line of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

carregarEnv();

/** Janela em America/Sao_Paulo (última hora inclusa). */
function horaSp(agora = new Date()) {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  return Number(partes.find((p) => p.type === "hour")?.value || "99");
}

function dentroJanelaEmail(agora = new Date()) {
  const hora = horaSp(agora);
  return hora >= 8 && hora <= 23;
}

function dentroJanelaDashboard(agora = new Date()) {
  const hora = horaSp(agora);
  return hora >= 8 && hora <= 20;
}

function tokenBalcao() {
  try {
    return fs.readFileSync(path.join(pastaDados, "token.txt"), "utf8").trim();
  } catch {
    return String(process.env.TOKEN_BALCAO || process.env.BALCAO_PUBLIC_TOKEN || "").trim();
  }
}

function urlReservaNova(token) {
  const base = String(process.env.SITE_URL || process.env.SITE_URL_PUBLIC || "https://site-klemtz.vercel.app").replace(
    /\/+$/,
    "",
  );
  return `${base}/balcao/${encodeURIComponent(token)}/api/reserva-nova`;
}

async function dispararReservaNovaSite(reserva, texto, extras = {}) {
  const token = tokenBalcao();
  if (!token) return { ok: false, erro: "sem_token" };
  const res = await fetch(urlReservaNova(token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: reserva.id,
      telefone: reserva.telefone || "",
      nome: reserva.nome || "",
      entrada: reserva.entrada || "",
      saida: reserva.saida || "",
      procedencia: reserva.procedencia || "",
      texto: String(texto || "").slice(0, 20000),
      forcar: Boolean(extras.forcar),
    }),
    signal: AbortSignal.timeout(55_000),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  if (!res.ok) return { ok: false, erro: json.erro || `http_${res.status}` };
  return {
    ok: Boolean(json.ok),
    acao: json.acao || "",
    erro: json.erro || "",
    telefone: json.telefone || "",
    boas: json.boas || null,
    forcou: Boolean(json.forcou),
    telefoneValido: json.telefoneValido,
  };
}

function telReservaOk(reserva) {
  return telOk(reserva?.telefone);
}

/** Espelha o telefone no cadastro do hóspede na Artax (form web). */
async function sincronizarTelArtax(chrome, reserva) {
  if (!telReservaOk(reserva)) return null;
  try {
    const r = await gravarTelefoneArtaxChrome(chrome, {
      bookingId: reserva.id,
      telefone: reserva.telefone,
    });
    console.log(
      "artax_tel " + reserva.id + " · " + (r.ok ? r.info : "falha " + (r.info || "")),
    );
    return r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("artax_tel " + reserva.id + " · erro " + msg);
    return { ok: false, info: msg };
  }
}

async function gravarPlanilha(buffer) {
  const { linhas, cabecalhos } = linhasDaPlanilha(buffer);
  if (!linhas.length) {
    throw new Error("A planilha veio sem reservas. Cabeçalhos: " + cabecalhos.join(" | "));
  }
  const base = lerBase();
  const n = aplicarPlanilha(base, linhas);
  base.meta.aviso = "";
  marcarFonte(base, "planilha", { ok: true, detalhe: n + " reservas" });
  gravarBase(base);
  return n;
}

async function baixarPlanilha(chrome) {
  const hoje = hojeSp();
  const inicio = somarDias(hoje, -21);
  gravarStatus({ estado: "baixando", detalhe: "Planilha " + inicio + " a " + FIM });
  const buffer = await baixarExportacao(chrome, inicio, FIM);
  const n = await gravarPlanilha(buffer);
  console.log("Base atualizada com " + n + " reservas da planilha.");
  return n;
}

async function atualizarDashboard(chrome) {
  gravarStatus({ estado: "baixando", detalhe: "Lendo Hospedado/Chegada/Saída no dashboard Artax" });
  const painel = await lerDashboardDia(chrome);
  const base = lerBase();
  const nHosp = painel.hospedados?.length || 0;
  const nCheg = painel.chegadas?.length || 0;
  const nSaid = painel.saidas?.length || 0;
  const nLinhas = nHosp + nCheg + nSaid;
  const jaTinha = (base.meta?.hospedadosHoje || []).length + (base.meta?.chegadasHoje || []).length;
  // Hospedados vazio é normal (check-in Artax não é diário). Só falha se as 3 abas vierem vazias.
  if (dentroJanelaDashboard() && jaTinha >= 1 && nLinhas === 0) {
    const aviso =
      "Dashboard scrape vazio (0 linhas; base tinha " + jaTinha + "). Listas mantidas.";
    base.meta.aviso = aviso;
    marcarFonte(base, "dashboard", { ok: false, detalhe: aviso });
    gravarBase(base);
    console.warn(aviso);
    return 0;
  }
  const n = aplicarDashboard(base, { ...painel, dia: hojeSp() });
  base.meta.aviso = "";
  const nCal = painel.calendario?.length || 0;
  const detalhe =
    nHosp +
    " hospedados / " +
    nCheg +
    " chegadas / " +
    nSaid +
    " saídas · n_linhas=" +
    nLinhas +
    (nCal ? " · calendário " + nCal : "");
  marcarFonte(base, "dashboard", { ok: true, detalhe });
  gravarBase(base);
  console.log("Dashboard: " + detalhe + " (" + n + " reservas atualizadas).");
  try {
    const { espelharDashboardTemporada } = await import("./espelhar-temporada.mjs");
    const esp = await espelharDashboardTemporada(painel);
    if (esp.pulou) console.log("Espelho Temporada: pulou (sem Supabase).");
    else console.log("Espelho Temporada: " + esp.n + " reservas" + (esp.erros ? " (" + esp.erros + " erros)" : "") + ".");
  } catch (e) {
    console.warn("Espelho Temporada falhou: " + (e?.message || e));
  }
  return n;
}

async function checarEmails(chrome) {
  const caixa = await lerEmailsReserva(chrome);
  const base = lerBase();
  base.meta.ultimaChecagemEmail = new Date().toISOString();
  if (caixa.login) {
    base.meta.aviso = "Gmail pediu login. A checagem de reserva nova não entrou.";
    marcarFonte(base, "email", { ok: false, detalhe: "Gmail pediu login" });
    gravarBase(base);
    return { novo: false, disparos: [] };
  }
  const vistos = new Set(base.meta.emailsVistos || []);
  const disparos = [];
  let novo = false;
  for (const msg of caixa.mensagens || []) {
    if (!msg.id || vistos.has(msg.id)) continue;
    if (!assuntoDeReservaNova(msg.titulo)) {
      vistos.add(msg.id);
      continue;
    }
    const texto = `${msg.resumo || ""} ${msg.titulo || ""}`;
    const reserva = reservaDoEmail(texto);
    if (reserva) {
      const jaTinha = (base.reservas || []).some((r) => String(r.id) === String(reserva.id));
      aplicarEmail(base, reserva);
      novo = true;
      if (!jaTinha) disparos.push({ reserva, texto });
    }
    vistos.add(msg.id);
  }
  base.meta.emailsVistos = [...vistos].slice(-200);
  marcarFonte(base, "email", {
    ok: true,
    detalhe: novo ? "Reserva nova encontrada" : "Sem e-mail novo",
  });
  gravarBase(base);

  const resultados = [];
  for (const item of disparos) {
    try {
      const reserva = item.reserva;
      const env = await dispararReservaNovaSite(reserva, item.texto);
      // Telefone automático só e-mail / planilha / API — sem scrape Chrome Airbnb.
      if (!telReservaOk(reserva) || env.boas?.info === "telefone_invalido" || env.telefoneValido === false) {
        const baseTel = lerBase();
        const it = baseTel.reservas.findIndex((r) => String(r.id) === String(reserva.id));
        if (it >= 0) {
          baseTel.reservas[it] = { ...baseTel.reservas[it], waStatus: "sem_telefone" };
          gravarBase(baseTel);
        }
        console.log("Reserva nova " + reserva.id + ": sem telefone (aguardando e-mail/planilha/API)");
      } else {
        await sincronizarTelArtax(chrome, reserva);
      }
      if (env.boas?.ok === false && /whatsapp|n[aã]o est[aá]/i.test(String(env.boas.info || ""))) {
        const baseWa = lerBase();
        const iw = baseWa.reservas.findIndex((r) => String(r.id) === String(reserva.id));
        if (iw >= 0) {
          baseWa.reservas[iw] = { ...baseWa.reservas[iw], waStatus: "falhou" };
          gravarBase(baseWa);
        }
      }
      resultados.push({ id: reserva.id, ...env, telefonePreenchido: telReservaOk(reserva) });
      console.log(
        "Reserva nova " +
          reserva.id +
          ": " +
          (env.ok ? "ok " + (env.acao || "") : "falha " + (env.erro || "")) +
          (env.boas?.info ? " · boas=" + env.boas.info : ""),
      );
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      resultados.push({ id: item.reserva.id, ok: false, erro });
      console.error("Reserva nova " + item.reserva.id + ": " + erro);
    }
  }
  if (resultados.length) {
    const base2 = lerBase();
    const okN = resultados.filter((r) => r.ok).length;
    marcarFonte(base2, "email", {
      ok: okN === resultados.length,
      detalhe:
        "Reserva nova: " +
        okN +
        "/" +
        resultados.length +
        " disparos WhatsApp" +
        (okN < resultados.length
          ? " · " + resultados.filter((r) => !r.ok).map((r) => r.id + ":" + (r.erro || "falha")).join(", ")
          : ""),
    });
    gravarBase(base2);
  }
  return { novo, disparos: resultados };
}

async function principal() {
  const soEmail = process.argv.includes("--emails");
  const soDashboard = process.argv.includes("--dashboard");
  const querPlanilha = process.argv.includes("--planilha");
  const arquivo = (() => {
    const i = process.argv.indexOf("--arquivo");
    return i >= 0 ? process.argv[i + 1] : "";
  })();

  let terminouOk = false;
  if (!tryLock()) {
    console.log("Já existe uma atualização em andamento.");
    gravarStatus({ estado: "ocupado", detalhe: "Outra passagem ainda está baixando." });
    return;
  }
  try {
    if (soDashboard && !soEmail && !querPlanilha && !arquivo) {
      if (!dentroJanelaDashboard()) {
        gravarStatus({ estado: "pronto", detalhe: "Fora da janela do dashboard (08–20h)." });
        console.log("Fora da janela do dashboard (08–20h).");
        terminouOk = true;
        return;
      }
    }

    if (soEmail && !soDashboard && !querPlanilha && !arquivo) {
      if (!dentroJanelaEmail()) {
        gravarStatus({ estado: "pronto", detalhe: "Fora da janela de e-mail (08–23h)." });
        console.log("Fora da janela de e-mail (08–23h).");
        terminouOk = true;
        return;
      }
      const chrome = await conectarChrome();
      try {
        const r = await checarEmails(chrome);
        gravarStatus({
          estado: "pronto",
          detalhe: r.novo
            ? "E-mail: reserva nova · " + (r.disparos?.length || 0) + " disparo(s)"
            : "Sem e-mail novo de reserva.",
        });
        console.log(r.novo ? "Reserva nova processada." : "Sem e-mail novo de reserva.");
        terminouOk = true;
        return;
      } finally {
        chrome.fechar();
      }
    }

    if (arquivo) {
      const n = await gravarPlanilha(fs.readFileSync(arquivo));
      const chrome = await conectarChrome();
      try {
        await atualizarDashboard(chrome);
      } finally {
        chrome.fechar();
      }
      gravarStatus({ estado: "pronto", detalhe: n + " reservas importadas + dashboard" });
      console.log("Importadas " + n + " reservas.");
      terminouOk = true;
      return;
    }

    const chrome = await conectarChrome();
    try {
      if (soEmail) {
        await checarEmails(chrome);
      }
      if (querPlanilha) {
        await baixarPlanilha(chrome);
      }
      if (soDashboard || querPlanilha || !soEmail) {
        await atualizarDashboard(chrome);
      }
      const base = lerBase();
      const h = (base.meta.hospedadosHoje || []).length;
      const c = (base.meta.chegadasHoje || []).length;
      const s = (base.meta.saidasHoje || []).length;
      const detalheDash = "Dashboard " + h + " hospedados / " + c + " chegadas / " + s + " saídas";
      gravarStatus({
        estado: "pronto",
        detalhe: querPlanilha ? base.reservas.length + " na base · " + detalheDash : detalheDash,
      });
      terminouOk = true;
    } finally {
      chrome.fechar();
    }
  } catch (e) {
    const base = lerBase();
    const msg = e.message || String(e);
    const fonteErro = /Artax pediu login|Chrome|conex/i.test(msg)
      ? "dashboard"
      : querPlanilha || arquivo
        ? "planilha"
        : soEmail && !soDashboard
          ? "email"
          : "dashboard";
    if ((soEmail || soDashboard || querPlanilha || !arquivo) && /Chrome|conex/i.test(msg) && base.reservas.length) {
      marcarFonte(base, fonteErro, { ok: false, detalhe: msg });
      gravarBase(base);
      gravarStatus({ estado: "pronto", detalhe: "Lista mantida. " + msg });
      console.error(msg);
      terminouOk = true;
      return;
    }
    base.meta.aviso = msg;
    marcarFonte(base, fonteErro, { ok: false, detalhe: msg });
    gravarBase(base);
    gravarStatus({ estado: "erro", detalhe: base.meta.aviso });
    console.error(base.meta.aviso);
    if (e.detalhe) console.error(String(e.detalhe).slice(0, 500));
    process.exitCode = 1;
    terminouOk = true;
  } finally {
    if (!terminouOk) {
      gravarStatus({ estado: "erro", detalhe: "Atualização interrompida antes de concluir." });
    }
    unlock();
    await aguardarNuvem();
  }
}

await principal();
