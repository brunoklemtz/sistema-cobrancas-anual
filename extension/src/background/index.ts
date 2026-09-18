import type { ScanOptions, ScanProgress, ScanResult } from "../types/index";

const WA = "https://web.whatsapp.com/*";

async function tabWhatsApp(): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ url: WA });
  const business = tabs.find((t) => /business/i.test(t.title || ""));
  const tab = business || tabs.find((t) => t.active) || tabs[0];
  if (!tab?.id) {
    throw new Error("Abra https://web.whatsapp.com/ no Chrome e faça login antes de varrer.");
  }
  return tab;
}

async function sendToContent(message: unknown): Promise<unknown> {
  const tab = await tabWhatsApp();
  try {
    return await chrome.tabs.sendMessage(tab.id!, message);
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      files: ["dist/content.js"],
    });
    return await chrome.tabs.sendMessage(tab.id!, message);
  }
}

function configurarSidePanel() {
  void chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true });
}

chrome.runtime.onInstalled.addListener(() => {
  configurarSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  configurarSidePanel();
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId != null) {
    void chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "BG_OPEN_SIDEPANEL") {
    chrome.windows.getCurrent().then((w) => {
      if (w.id != null) return chrome.sidePanel.open({ windowId: w.id });
    }).then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "BG_PING") {
    sendToContent({ type: "WA_PING" })
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  }

  if (msg.type === "BG_START") {
    const options = {
      modo: "marketing" as const,
      lote: 20,
      ...(msg.options as ScanOptions),
      includeGrupo: false,
      baixarFotos: false,
    };
    const phoneJson = String(msg.phoneJson || "");
    const extensaoVersao = chrome.runtime.getManifest().version;
    void chrome.storage.local.set({
      wa_running: true,
      wa_logs: [],
      wa_progress: {
        conversasFeitas: 0,
        conversasTotal: 0,
        mensagens: 0,
        fotos: 0,
        semConversa: 0,
        erros: 0,
        pendentes: 0,
        log: "",
        running: true,
        smoke: !!options.smoke,
      } satisfies ScanProgress,
    });
    sendToContent({
      type: "WA_SCAN_START",
      payload: { options, phoneJson, extensaoVersao },
    })
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  }

  if (msg.type === "BG_STOP") {
    sendToContent({ type: "WA_SCAN_STOP" })
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  }

  if (msg.type === "WA_PROGRESS") {
    const progress = msg.progress as Partial<ScanProgress>;
    void chrome.storage.local.get(["wa_logs", "wa_progress"]).then((cur) => {
      const logs = Array.isArray(cur.wa_logs) ? cur.wa_logs : [];
      if (progress.log) logs.push(progress.log);
      const prev = (cur.wa_progress || {}) as ScanProgress;
      return chrome.storage.local.set({
        wa_logs: logs.slice(-400),
        wa_progress: { ...prev, ...progress, running: true },
      });
    });
    return;
  }

  if (msg.type === "WA_DONE") {
    const result = msg.result as ScanResult;
    void chrome.storage.local.set({
      wa_running: false,
      wa_result: result,
      wa_progress: { ...result.progress, running: false },
      wa_logs: result.logs,
    });
    return;
  }

  if (msg.type === "WA_ERROR") {
    void chrome.storage.local.get(["wa_logs"]).then((cur) => {
      const logs = Array.isArray(cur.wa_logs) ? cur.wa_logs : [];
      logs.push(`[erro] ${msg.error}`);
      return chrome.storage.local.set({
        wa_running: false,
        wa_logs: logs,
        wa_progress: {
          conversasFeitas: 0,
          conversasTotal: 0,
          mensagens: 0,
          fotos: 0,
          semConversa: 0,
          erros: 1,
          pendentes: 0,
          log: String(msg.error),
          running: false,
          smoke: false,
        },
      });
    });
    return;
  }

  return false;
});
