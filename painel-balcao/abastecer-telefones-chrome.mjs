/**
 * NÃO faz parte do ciclo automático de telefone.
 * Telefone automático = só e-mail, planilha e API (ver ROTINA.md).
 * Script manual legado (ficha Artax / Airbnb Chrome) — não agendar.
 */
import { aguardarNuvem, gravarBase, lerBase } from "./base.mjs";
import {
  buscarTelefoneAirbnb,
  ehAirbnb,
  limparFaltaTel,
  marcarFaltaTel,
  telOk,
} from "./airbnb-telefone.mjs";
import { gravarTelefoneArtaxChrome } from "./artax-telefone.mjs";
import { conectarChrome } from "./chrome.mjs";

function telefoneDoTexto(texto) {
  const t = String(texto || "");
  const pats = [
    /Telefone\s*([+\d(][\d()\s./-]{8,28})/i,
    /WhatsApp\s*([+\d(][\d()\s./-]{8,28})/i,
    /Celular\s*([+\d(][\d()\s./-]{8,28})/i,
    /wa\.me\/(\d{10,13})/i,
    /tel:([+\d][\d\s-]{8,28})/i,
  ];
  for (const re of pats) {
    const m = t.match(re);
    if (m && telOk(m[1])) {
      // Ignorar widget fixo Artax / equipe
      const d = String(m[1]).replace(/\D/g, "");
      if (/5522998312697|5547992744455/.test(d.length <= 11 ? "55" + d : d)) continue;
      return m[1].trim();
    }
  }
  return "";
}

const base = lerBase();
const faltando = base.reservas.filter((r) => !telOk(r.telefone) && !String(r.id).startsWith("manual-"));
console.log("Fichas sem telefone:", faltando.length);

const chrome = await conectarChrome();
let ok = 0;
try {
  for (const r of faltando) {
    const pagina = await chrome.abrir("https://artaxnet.com/bookings/" + encodeURIComponent(r.id));
    let tel = "";
    let texto = "";
    try {
      await new Promise((x) => setTimeout(x, 1800));
      texto = await pagina.avaliar("document.body.innerText || ''");
      tel = telefoneDoTexto(texto);
      if (tel) {
        r.telefone = tel;
        r.telefoneOrigem = "artax";
        r.waStatus = "";
        ok++;
        limparFaltaTel(r.id);
        console.log(r.id, r.nome, "→", tel, "(artax)");
      }
    } finally {
      await pagina.fechar();
    }

    if (tel) continue;

    if (ehAirbnb(r.procedencia) || /Airbnb/i.test(texto)) {
      try {
        const scrape = await buscarTelefoneAirbnb(chrome, { bookingId: r.id });
        if (scrape.ok && telOk(scrape.telefone)) {
          r.telefone = scrape.telefone;
          r.telefoneOrigem = "airbnb_chrome";
          r.waStatus = "";
          ok++;
          limparFaltaTel(r.id);
          console.log(r.id, r.nome, "→", scrape.telefone, "(airbnb)");
          try {
            const sync = await gravarTelefoneArtaxChrome(chrome, {
              bookingId: r.id,
              telefone: scrape.telefone,
            });
            console.log(r.id, "artax_tel ·", sync.ok ? sync.info : "falha " + (sync.info || ""));
          } catch (e) {
            console.log(r.id, "artax_tel · erro", e instanceof Error ? e.message : String(e));
          }
          continue;
        }
        console.log(r.id, r.nome, "→ airbnb_tel_falhou ·", scrape.motivo || "sem_tel");
      } catch (e) {
        console.log(r.id, r.nome, "→ airbnb erro ·", e instanceof Error ? e.message : String(e));
      }
      marcarFaltaTel(r.id);
      r.waStatus = "sem_telefone";
    } else {
      console.log(r.id, r.nome, /Cancelado/i.test(String(texto)) ? "→ cancelado/sem tel" : "→ sem tel");
      marcarFaltaTel(r.id);
    }
  }
} finally {
  chrome.fechar();
}

if (ok) {
  base.meta.atualizadoEm = new Date().toISOString();
  gravarBase(base);
  await aguardarNuvem();
}
const com = base.reservas.filter((r) => telOk(r.telefone)).length;
console.log("Chrome: +" + ok + " · total com tel " + com + "/" + base.reservas.length);
