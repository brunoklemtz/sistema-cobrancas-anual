import type { MarketingRecord, ScanOptions, ScanProgress, ScanResult } from "../types/index";
import { marketingToCsv } from "../utils/csv";
import { LOTE_PADRAO } from "../utils/log";
import { montarAlvosMarketing, parseMarketingList } from "../utils/phones";

const emptyProgress = (): ScanProgress => ({
  conversasFeitas: 0,
  conversasTotal: 0,
  mensagens: 0,
  fotos: 0,
  semConversa: 0,
  erros: 0,
  pendentes: 0,
  log: "",
  running: false,
  smoke: false,
});

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} ausente`);
  return el;
}

function val(id: string) {
  return (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement).value;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  });
}

function lerOpcoes(): ScanOptions {
  const loteEl = document.getElementById("lote") as HTMLInputElement | null;
  const today = new Date().toISOString().slice(0, 10);
  return {
    modo: "marketing",
    lote: Math.max(1, Number(loteEl?.value || LOTE_PADRAO) || LOTE_PADRAO),
    fromIso: today,
    toIso: today,
    includeDms: true,
    includeGrupo: false,
    baixarFotos: false,
    extrasText: val("extras"),
    smoke: false,
    grupoNome: "",
  };
}

async function pingStatus(el: HTMLElement) {
  el.className = "status";
  el.textContent = "Verificando WhatsApp Web...";
  const res = (await chrome.runtime.sendMessage({ type: "BG_PING" })) as {
    ok?: boolean;
    loggedOut?: boolean;
    version?: string;
    error?: string;
  };
  if (!res?.ok) {
    el.className = "status err";
    el.textContent = res?.error || "Abra web.whatsapp.com logado.";
    return false;
  }
  if (res.loggedOut) {
    el.className = "status err";
    el.textContent = "Sessão deslogada / QR Code. Parando.";
    return false;
  }
  el.className = "status ok";
  el.textContent = `Sessão ok · WA ${res.version || ""}`;
  return true;
}

function pintarProgresso(p: ScanProgress) {
  $("prog").textContent = `${p.conversasFeitas} / ${p.conversasTotal} conversas`;
  $("n-msg").textContent = String(p.mensagens);
  $("n-foto").textContent = String(p.fotos);
  $("n-sem").textContent = String(p.semConversa);
  $("n-err").textContent = String(p.erros);
  $("n-rev").textContent = String(p.pendentes);
  ($("btn-start") as HTMLButtonElement).disabled = p.running;
  ($("btn-smoke") as HTMLButtonElement).disabled = p.running;
  ($("btn-stop") as HTMLButtonElement).disabled = !p.running;
}

function pintarLogs(lines: string[]) {
  const box = $("logs");
  box.textContent = lines.slice(-80).join("\n");
  box.scrollTop = box.scrollHeight;
}

function marketingRecords(result: ScanResult | null): MarketingRecord[] {
  return result?.marketingRecords || [];
}

export function montarPainel() {
  pintarProgresso(emptyProgress());
  void chrome.storage.local.set({ wa_modo: "marketing" });

  void chrome.storage.local
    .get(["wa_phone_json", "wa_extras", "wa_progress", "wa_logs", "wa_lote", "wa_running"])
    .then((s) => {
      if (s.wa_phone_json) $("json-info").textContent = s.wa_phone_json;
      if (typeof s.wa_extras === "string") ($("extras") as HTMLTextAreaElement).value = s.wa_extras;
      if (s.wa_lote) ($("lote") as HTMLInputElement).value = String(s.wa_lote);
      const prog = s.wa_progress as ScanProgress | undefined;
      if (prog && s.wa_running) pintarProgresso(prog);
      else if (prog) pintarProgresso({ ...prog, running: false });
      if (Array.isArray(s.wa_logs)) pintarLogs(s.wa_logs as string[]);
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.wa_progress) pintarProgresso((changes.wa_progress.newValue || emptyProgress()) as ScanProgress);
    if (changes.wa_logs) pintarLogs((changes.wa_logs.newValue || []) as string[]);
    if (changes.wa_running?.newValue === false) {
      $("status").className = "status ok";
      $("status").textContent = "Varredura de origem encerrada. Exporte JSON/CSV.";
    }
  });

  $("file").addEventListener("change", async (ev) => {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = parseMarketingList(text);
      const alvos = montarAlvosMarketing(parsed, "");
      await chrome.storage.local.set({
        wa_phone_json_raw: text,
        wa_phone_json: `${file.name}: ${alvos.length} leads (marketing)`,
      });
      $("json-info").textContent = `${file.name}: ${alvos.length} leads`;
      $("status").className = "status ok";
      $("status").textContent = "Fila marketing importada.";
    } catch (e) {
      $("status").className = "status err";
      $("status").textContent = e instanceof Error ? e.message : "JSON marketing inválido";
    }
  });

  document.getElementById("btn-side")?.addEventListener("click", () => {
    void chrome.runtime.sendMessage({ type: "BG_OPEN_SIDEPANEL" });
  });

  async function iniciar(smoke: boolean) {
    const ok = await pingStatus($("status"));
    if (!ok) return;
    const store = await chrome.storage.local.get(["wa_phone_json_raw"]);
    const options = { ...lerOpcoes(), smoke };
    await chrome.storage.local.set({ wa_extras: options.extrasText, wa_lote: options.lote });
    const fallback = JSON.stringify({ mode: "marketing", leads: [] });
    const res = (await chrome.runtime.sendMessage({
      type: "BG_START",
      options,
      phoneJson: store.wa_phone_json_raw || fallback,
    })) as { ok?: boolean; error?: string; started?: boolean };

    if (!res?.ok) {
      $("status").className = "status err";
      $("status").textContent = res?.error || "Não foi possível iniciar.";
      return;
    }

    pintarProgresso({ ...emptyProgress(), running: true, smoke });
    $("status").className = "status ok";
    $("status").textContent = smoke
      ? "Smoke marketing: até 3 DMs, rolar até o início da conversa."
      : "Varredura de origem em andamento.";
  }

  $("btn-smoke").addEventListener("click", () => void iniciar(true));
  $("btn-start").addEventListener("click", () => void iniciar(false));
  $("btn-stop").addEventListener("click", () => {
    void chrome.runtime.sendMessage({ type: "BG_STOP" });
  });

  async function resultado(): Promise<ScanResult | null> {
    const s = await chrome.storage.local.get(["wa_result"]);
    return (s.wa_result as ScanResult) || null;
  }

  $("btn-json").addEventListener("click", async () => {
    const r = await resultado();
    if (!r) return;
    downloadBlob(
      new Blob(
        [
          JSON.stringify(
            {
              geradoEm: r.geradoEm,
              modo: "marketing",
              extensaoVersao: r.extensaoVersao,
              whatsappVersao: r.whatsappVersao,
              records: marketingRecords(r),
            },
            null,
            2
          ),
        ],
        { type: "application/json" }
      ),
      "origem-whatsapp.json"
    );
  });

  $("btn-csv").addEventListener("click", async () => {
    const r = await resultado();
    if (!r) return;
    downloadBlob(
      new Blob([marketingToCsv(marketingRecords(r))], { type: "text/csv;charset=utf-8" }),
      "origem-whatsapp.csv"
    );
  });
}
