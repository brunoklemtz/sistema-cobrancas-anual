import { sessaoDeslogada, whatsappVersao } from "../selectors/whatsappSelectors";
import { pararVarredura, type ScanRequest } from "./scan";
import { executarVarreduraMarketing } from "./scanMarketing";
import { garantirSessao } from "./navigate";

type Incoming =
  | { type: "WA_PING" }
  | { type: "WA_SCAN_START"; payload: ScanRequest }
  | { type: "WA_SCAN_STOP" };

let running = false;

chrome.runtime.onMessage.addListener((msg: Incoming, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "WA_PING") {
    sendResponse({
      ok: true,
      loggedOut: sessaoDeslogada(),
      version: whatsappVersao(),
    });
    return true;
  }

  if (msg.type === "WA_SCAN_STOP") {
    pararVarredura();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "WA_SCAN_START") {
    if (running) {
      sendResponse({ ok: false, error: "Já existe uma varredura em andamento." });
      return true;
    }
    try {
      garantirSessao();
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      return true;
    }
    running = true;
    sendResponse({ ok: true, started: true });
    void executarVarreduraMarketing(msg.payload, (p) => {
      chrome.runtime.sendMessage({ type: "WA_PROGRESS", progress: p }).catch(() => {});
    })
      .then((result) => {
        running = false;
        return chrome.runtime.sendMessage({ type: "WA_DONE", result });
      })
      .catch((err: unknown) => {
        running = false;
        const error = err instanceof Error ? err.message : String(err);
        return chrome.runtime.sendMessage({ type: "WA_ERROR", error });
      })
      .catch(() => {});
    return true;
  }

  return false;
});
