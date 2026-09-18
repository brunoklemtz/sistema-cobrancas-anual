import { chaveTelefone, soDigitos } from "../utils/phones";
import { sleep, waitUntil } from "../utils/async";
import {
  chatItemLabel,
  clearSearchBox,
  conversationTitleText,
  fillSearchBox,
  noSearchResults,
  safeClick,
  searchBoxEl,
  select,
  selectAll,
  sessaoDeslogada,
} from "../selectors/whatsappSelectors";

export const abortFlag = { abort: false };

export function garantirSessao() {
  if (sessaoDeslogada()) {
    throw new Error("WhatsApp deslogado ou QR Code visível. Parando.");
  }
}

function last8(d: string) {
  const n = soDigitos(d);
  return n.slice(-8);
}

export function itemCombina(label: string, query: string, variants: string[]): boolean {
  const n = label.toLowerCase().replace(/\s+/g, " ");
  const q = query.toLowerCase().trim();
  if (q.length >= 4 && n.includes(q)) return true;
  const labelDigits = soDigitos(label);
  const keys = [query, ...variants].map((v) => last8(v)).filter((x) => x.length >= 8);
  for (const k of keys) {
    if (labelDigits.endsWith(k)) return true;
  }
  const chave = chaveTelefone(query);
  if (chave.length >= 10 && labelDigits.includes(chave)) return true;
  return false;
}

export async function abrirBusca(query: string): Promise<void> {
  garantirSessao();
  let box = searchBoxEl();
  if (!box) {
    const openBtn = select(document, "searchOpen");
    if (openBtn instanceof HTMLElement && !openBtn.closest("footer")) {
      safeClick(openBtn, "abrir pesquisa");
      await sleep(350, abortFlag);
    }
    box = searchBoxEl();
  }
  if (!box) throw new Error("Caixa de pesquisa não encontrada (não é a caixa de mensagem).");
  safeClick(box, "focar pesquisa");
  await sleep(200, abortFlag);
  fillSearchBox(box, query);
  await sleep(900, abortFlag);
  await waitUntil(
    () => selectAll(document, "chatListItem").length > 0 || noSearchResults(),
    4000,
    abortFlag
  );
}

export async function escolherResultado(
  query: string,
  variants: string[]
): Promise<boolean> {
  garantirSessao();
  if (noSearchResults()) return false;
  const items = selectAll(document, "chatListItem");
  const ranked = items
    .map((el) => ({ el, label: chatItemLabel(el) }))
    .filter((x) => x.label && !/^mensagens$|^messages$|^chats$|^contatos$|^contacts$/i.test(x.label))
    .filter((x) => itemCombina(x.label, query, variants));
  const alvo = ranked[0] || null;
  if (!alvo) return false;
  safeClick(alvo.el, "abrir conversa");
  await sleep(700, abortFlag);
  await waitUntil(() => !!select(document, "conversation"), 5000, abortFlag);
  return true;
}

export async function abrirConversa(query: string, variants: string[]): Promise<boolean> {
  await abrirBusca(query);
  const ok = await escolherResultado(query, variants);
  if (!ok) {
    try {
      clearSearchBox();
    } catch {
      /* ignore */
    }
    return false;
  }
  await sleep(400, abortFlag);
  return true;
}

export function tituloConversaAtual(): string {
  return conversationTitleText();
}

export async function rolarHistorico(opts: {
  fromIso: string;
  maxScrolls: number;
  onHarvest: () => string | null | Promise<string | null>;
}): Promise<void> {
  garantirSessao();
  const pane = select(document, "messagePane") || select(document, "conversation");
  if (!(pane instanceof HTMLElement)) throw new Error("Painel de mensagens não encontrado.");

  let estagnado = 0;
  let lastOldest = "";
  for (let i = 0; i < opts.maxScrolls; i++) {
    garantirSessao();
    if (abortFlag.abort) throw new Error("Varredura interrompida.");
    const oldest = await opts.onHarvest();
    if (oldest && oldest < opts.fromIso) return;
    if (oldest && oldest === lastOldest) estagnado += 1;
    else estagnado = 0;
    lastOldest = oldest || lastOldest;
    if (estagnado >= 3) return;

    const before = pane.scrollHeight;
    pane.scrollTop = 0;
    pane.dispatchEvent(new Event("scroll", { bubbles: true }));
    await sleep(650, abortFlag);
    if (pane.scrollHeight === before) {
      pane.scrollBy(0, -1800);
      await sleep(450, abortFlag);
    }
  }
  await opts.onHarvest();
}

export async function rolarAteInicio(opts: {
  maxScrolls: number;
  onHarvest: () => boolean | Promise<boolean>;
}): Promise<void> {
  garantirSessao();
  const pane = select(document, "messagePane") || select(document, "conversation");
  if (!(pane instanceof HTMLElement)) throw new Error("Painel de mensagens não encontrado.");

  let estagnado = 0;
  let lastHeight = -1;
  for (let i = 0; i < opts.maxScrolls; i++) {
    garantirSessao();
    if (abortFlag.abort) throw new Error("Varredura interrompida.");
    const inicio = await opts.onHarvest();
    if (inicio) return;
    if (pane.scrollHeight === lastHeight) estagnado += 1;
    else estagnado = 0;
    lastHeight = pane.scrollHeight;
    if (estagnado >= 3) return;

    pane.scrollTop = 0;
    pane.dispatchEvent(new Event("scroll", { bubbles: true }));
    await sleep(650, abortFlag);
    if (pane.scrollHeight === lastHeight) {
      pane.scrollBy(0, -1800);
      await sleep(400, abortFlag);
    }
  }
  await opts.onHarvest();
}
