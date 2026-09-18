/**
 * Único arquivo com querySelector. Fallback por aria-label, role, data-testid.
 * Nunca usar classes CSS minificadas como seletor principal.
 */

const FORBIDDEN = {
  compose: [
    "footer [contenteditable='true']",
    "[data-testid='conversation-compose-box-input']",
    "[aria-label='Digite uma mensagem']",
    "[aria-label='Type a message']",
    "div[contenteditable='true'][data-tab='10']",
  ],
  send: [
    "[data-testid='compose-btn-send']",
    "button[aria-label='Enviar']",
    "button[aria-label='Send']",
    "span[data-icon='send']",
    "span[data-icon='wds-ic-send-filled']",
  ],
} as const;

export const SELECTORS = {
  qr: [
    "canvas[aria-label*='QR']",
    "[data-testid='qrcode']",
    "div[data-ref] canvas",
    "div[aria-label*='QR code']",
    "[data-testid='intro-md-beta-logo-code']",
  ],
  loggedIn: [
    "#app [data-testid='chatlist']",
    "[data-testid='chat-list']",
    "#pane-side",
    "#side",
    "[aria-label='Lista de conversas']",
    "[aria-label='Chat list']",
  ],
  searchBox: [
    "[data-testid='chat-list-search']",
    "#pane-side input[data-tab='3']",
    "#side input[data-tab='3']",
    "#app input[data-tab='3']",
    "input[aria-label='Pesquisar ou começar uma nova conversa']",
    "input[aria-label='Search or start a new chat']",
    "div[contenteditable='true'][data-tab='3']",
    "[aria-label='Caixa de texto de pesquisa']",
    "[aria-label='Search input textbox']",
    "[aria-label='Pesquisar ou começar uma nova conversa']",
    "[aria-label='Search or start a new chat']",
    "div[title='Search input textbox']",
  ],
  searchOpen: [
    "[data-testid='chat-list-search']",
    "button[aria-label='Pesquisar ou começar uma nova conversa']",
    "button[aria-label='Search or start a new chat']",
    "button[aria-label='Search or start new chat']",
    "#side span[data-icon='search']",
    "#pane-side span[data-icon='search']",
  ],
  searchClear: [
    "[aria-label='Limpar pesquisa']",
    "[aria-label='Clear search']",
    "[data-testid='back']",
    "button[aria-label='Voltar']",
    "button[aria-label='Back']",
  ],
  chatList: ["[data-testid='chat-list']", "#pane-side", "#side", "[aria-label='Lista de conversas']"],
  chatListItem: [
    "[data-testid='cell-frame-container']",
    "#pane-side [role='listitem']",
    "#pane-side [role='row']",
    "#side [role='listitem']",
    "#side [role='row']",
    "[aria-label='Search results'] [role='listitem']",
    "[aria-label='Resultados da pesquisa'] [role='listitem']",
  ],
  conversation: ["#main", "[data-testid='conversation-panel-wrapper']"],
  conversationTitle: [
    "#main header [data-testid='conversation-info-header']",
    "#main header span[dir='auto'][title]",
    "#main header [title]",
    "#main header span[dir='auto']",
  ],
  messagePane: [
    "#main [data-testid='conversation-panel-messages']",
    "#main div[role='application']",
    "#main .copyable-area",
    "#main [tabindex='0'][role='application']",
  ],
  composeBox: [
    "footer [contenteditable='true']",
    "[data-testid='conversation-compose-box-input']",
    "[aria-label='Digite uma mensagem']",
    "[aria-label='Type a message']",
    "div[contenteditable='true'][data-tab='10']",
  ],
  message: ["#main div[data-id]", "#main div.message-in", "#main div.message-out"],
  copyable: ["[data-pre-plain-text]", ".copyable-text"],
  quoted: [
    "[data-testid='quoted-message']",
    "[aria-label*='mensagem citada']",
    "[aria-label*='Quoted']",
  ],
  image: ["img[src^='blob:']", "img[src^='https://']", "img[src^='data:']"],
  document: ["[data-testid='document-thumb']", "span[data-icon='document']", "a[href*='blob:']"],
  outgoingMark: [
    "[data-icon='msg-dblcheck']",
    "[data-icon='msg-check']",
    "[data-icon='msg-dblcheck-ack']",
    "[data-icon='msg-time']",
    "[data-testid='msg-dblcheck']",
  ],
  noResults: [
    "[data-testid='search-no-chats-or-contacts']",
    "span[title='Nenhum resultado encontrado']",
    "span[title='No results found']",
  ],
  labeled: ["#main [aria-label]", "#main [title]"],
  inicioConversa: [
    "[data-testid='conversation-start']",
    "[data-testid='encrypt-notice']",
    "[data-testid='intro-msg']",
  ],
} as const;

export type SelectorName = keyof typeof SELECTORS;

function tryQuery(root: ParentNode, sel: string): Element | null {
  try {
    return root.querySelector(sel);
  } catch {
    return null;
  }
}

export function select(root: ParentNode, name: SelectorName): Element | null {
  for (const sel of SELECTORS[name]) {
    const el = tryQuery(root, sel);
    if (el) return el;
  }
  return null;
}

export function selectAll(root: ParentNode, name: SelectorName): Element[] {
  const seen = new Set<Element>();
  const out: Element[] = [];
  for (const sel of SELECTORS[name]) {
    let list: NodeListOf<Element>;
    try {
      list = root.querySelectorAll(sel);
    } catch {
      continue;
    }
    for (const el of list) {
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }
  }
  return out;
}

export function isForbiddenTarget(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  if (el.closest("footer")) return true;
  for (const s of [...FORBIDDEN.compose, ...FORBIDDEN.send]) {
    try {
      if (el.matches(s) || el.closest(s)) return true;
    } catch {
      /* seletor com combinador, ignorar */
    }
  }
  const al = `${el.getAttribute("aria-label") || ""} ${el.getAttribute("data-testid") || ""}`.toLowerCase();
  return /digite uma mensagem|type a message|conversation-compose-box-input/.test(al);
}

export function assertNotCompose(el: Element | null, acao: string) {
  if (!el) return;
  if (el.closest("footer") || isForbiddenTarget(el)) {
    throw new Error(`Bloqueado: ${acao} atingiria caixa de mensagem ou Enviar.`);
  }
}

export function sessaoDeslogada(root: ParentNode = document): boolean {
  if (select(root, "qr")) return true;
  const texto = (root as Document).body?.innerText || "";
  if (
    /use o WhatsApp no seu celular|to use WhatsApp on your computer|QR code/i.test(texto) &&
    !select(root, "loggedIn")
  ) {
    return true;
  }
  return false;
}

export function whatsappVersao(): string {
  const meta = document.querySelector("meta[name='version'], meta[property='og:version']");
  if (meta instanceof HTMLMetaElement && meta.content) return meta.content;
  const html = document.documentElement.getAttribute("data-version") || "";
  const wa = document.querySelector("script[src*='whatsapp']");
  const src = wa instanceof HTMLScriptElement ? wa.src : "";
  return html || src.slice(-24) || location.hostname;
}

export function searchBoxEl(root: ParentNode = document): HTMLElement | null {
  for (const el of selectAll(root, "searchBox")) {
    if (!(el instanceof HTMLElement)) continue;
    const editable = el.isContentEditable ? el : el.querySelector("[contenteditable='true']");
    const box = editable instanceof HTMLElement ? editable : el;
    if (box.closest("footer") || isForbiddenTarget(box)) continue;
    return box;
  }
  return null;
}

export function conversationTitleText(root: ParentNode = document): string {
  const candidates = [
    "#main header span[dir='auto'][title]",
    "#main header button[title]",
    "#main header [data-testid='conversation-info-header']",
    "#main header span[dir='auto']",
    ...SELECTORS.conversationTitle,
  ];
  for (const sel of candidates) {
    let list: NodeListOf<Element>;
    try {
      list = root.querySelectorAll(sel);
    } catch {
      continue;
    }
    for (const el of list) {
      const text = ((el.textContent || "").trim() || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
      if (!text || /^(dados do perfil|profile details|ligação|liga[cç][aã]o|pesquisar|mais opções)$/i.test(text)) {
        continue;
      }
      return text;
    }
  }
  return "";
}

export function chatItemLabel(el: Element): string {
  return (
    el.getAttribute("title") ||
    el.getAttribute("aria-label") ||
    el.textContent ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function chatItemContactLabel(el: Element): string {
  const raw =
    el.getAttribute("title") ||
    el.getAttribute("aria-label") ||
    (el instanceof HTMLElement ? el.innerText : "") ||
    el.textContent ||
    "";
  const lines = raw
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/^\d{1,2}:\d{2}$|^ontem$|^hoje$/i.test(line))
    .filter((line) => !/^(conversa fixada|conversa favorita|conversa trancada)$/i.test(line))
    .filter((line) => !/^wds-|^ic-|^tail-/i.test(line));
  return (lines[0] || chatItemLabel(el)).replace(/\s+/g, " ").trim();
}

export function messageRoot(el: Element): Element {
  return el.closest("[data-id]") || el;
}

export function messageIdOf(el: Element): string {
  return messageRoot(el).getAttribute("data-id") || "";
}

export function prePlainTextOf(el: Element): string {
  const copy = select(el, "copyable");
  return (copy || el).getAttribute("data-pre-plain-text") || "";
}

export function quotedTextOf(el: Element): string {
  const q = select(el, "quoted");
  return (q?.textContent || "").replace(/\s+/g, " ").trim();
}

export function messageBodyText(el: Element): string {
  const quoted = quotedTextOf(el);
  const copy = select(el, "copyable") || el;
  let text = (copy.textContent || "").replace(/\s+/g, " ").trim();
  if (quoted) text = text.replace(quoted, "").trim();
  return text;
}

export function remetenteOf(el: Element): "me" | "other" {
  const pre = prePlainTextOf(el);
  if (/\]\s*(Você|You)\s*:/i.test(pre)) return "me";
  if (select(el, "outgoingMark")) return "me";
  return "other";
}

export function messageImages(el: Element): HTMLImageElement[] {
  return selectAll(el, "image").filter(
    (n): n is HTMLImageElement =>
      n instanceof HTMLImageElement &&
      n.naturalWidth > 40 &&
      !/emoji|sticker|icon/i.test(n.alt || n.getAttribute("src") || "")
  );
}

export function temDocumento(el: Element): boolean {
  return !!select(el, "document");
}

export function temImagem(el: Element): boolean {
  return messageImages(el).length > 0;
}

export function safeClick(el: Element, acao: string) {
  assertNotCompose(el, acao);
  const label = chatItemLabel(el).toLowerCase();
  if (/\benviar\b|\bsend\b/.test(label) && el.closest("footer")) {
    throw new Error(`Bloqueado: clique em Enviar (${acao}).`);
  }
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
  if (el instanceof HTMLElement) el.click();
  else el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
}

export function fillSearchBox(box: HTMLElement, text: string) {
  assertNotCompose(box, "preencher pesquisa");
  box.focus();
  if (box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement) {
    const proto =
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    proto?.call(box, text);
    if (box.value !== text) box.value = text;
    box.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    box.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(box);
  sel?.removeAllRanges();
  sel?.addRange(range);
  const ok = document.execCommand("insertText", false, text);
  if (!ok) {
    box.textContent = text;
    box.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
  }
  box.dispatchEvent(new Event("change", { bubbles: true }));
}

export function composeBoxEl(root: ParentNode = document): HTMLElement | null {
  for (const el of selectAll(root, "composeBox")) {
    if (!(el instanceof HTMLElement)) continue;
    const editable = el.isContentEditable ? el : el.querySelector("[contenteditable='true']");
    if (editable instanceof HTMLElement) return editable;
    return el;
  }
  return null;
}

export function sendButtonPresent(root: ParentNode = document): boolean {
  return FORBIDDEN.send.some((sel) => {
    try {
      return !!(root as Document).querySelector?.(sel);
    } catch {
      return false;
    }
  });
}

export function buttonByText(pattern: RegExp, root: ParentNode = document): HTMLElement | null {
  let list: NodeListOf<Element>;
  try {
    list = root.querySelectorAll("button, [role='button']");
  } catch {
    return null;
  }
  for (const el of list) {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (pattern.test(text) && el instanceof HTMLElement) return el;
  }
  return null;
}

export function fillComposeDraft(box: HTMLElement, text: string) {
  const hasDraft = () => (box.textContent || "").replace(/\s+/g, " ").trim().includes(text.replace(/\s+/g, " ").trim().slice(0, 25));
  box.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(box);
  sel?.removeAllRanges();
  sel?.addRange(range);
  document.execCommand("delete", false);
  const ok = document.execCommand("insertText", false, text);
  if (!ok) {
    box.textContent = text;
    box.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
  }
  if (!hasDraft()) {
    box.textContent = "";
    box.appendChild(document.createTextNode(text));
    box.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
  }
  box.dispatchEvent(new Event("change", { bubbles: true }));
}

export function clearSearchBox(root: ParentNode = document) {
  const btn = select(root, "searchClear");
  if (btn instanceof HTMLElement && !isForbiddenTarget(btn)) {
    safeClick(btn, "limpar pesquisa");
    return;
  }
  const box = searchBoxEl(root);
  if (!box) return;
  box.focus();
  if (box instanceof HTMLInputElement || box instanceof HTMLTextAreaElement) {
    box.value = "";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  document.execCommand("selectAll", false);
  document.execCommand("delete", false);
}

export function noSearchResults(root: ParentNode = document): boolean {
  return !!select(root, "noResults");
}

function blobPainel(root: ParentNode = document): string {
  const pane = select(root, "conversation") || select(root, "messagePane");
  const texto = pane instanceof HTMLElement ? pane.innerText : "";
  const labeled = selectAll(root, "labeled")
    .map((el) => `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`)
    .join(" ");
  return `${texto}\n${labeled}`.toLowerCase();
}

export function chegouInicioConversa(root: ParentNode = document): boolean {
  if (select(root, "inicioConversa")) return true;
  const blob = blobPainel(root);
  return /in[ií]cio da conversa|beginning of (this )?chat|criptografadas com a criptografia|end-to-end encrypted|as mensagens e as liga[cç][oõ]es s[aã]o protegidas/i.test(
    blob
  );
}

export function detectarContextoMarketing(root: ParentNode = document): {
  anuncioInstagram: boolean;
  anuncioFacebook: boolean;
  quotedStatus: boolean;
  cardMarketplace: boolean;
} {
  const blob = blobPainel(root);
  const instagram = /an[uú]ncio do instagram/.test(blob);
  const facebook = /an[uú]ncio do facebook/.test(blob) && !/informa[cç][oõ]es do vendedor/.test(blob);
  const quotedStatus =
    /voc[eê]\s*[·•.\-]?\s*status/.test(blob) ||
    /statusmention/.test(blob) ||
    /vi no status|status do whats/.test(blob);
  const cardMarketplace = /informa[cç][oõ]es do vendedor|detalhes do vendedor/.test(blob);
  return {
    anuncioInstagram: instagram,
    anuncioFacebook: facebook,
    quotedStatus,
    cardMarketplace: cardMarketplace && !instagram,
  };
}
