/** Ecos do bot — nunca são origem de marketing. */
export function ehEcoBot(texto: string): boolean {
  const t = String(texto || "").trim();
  if (!t) return false;
  if (/^Recebi seu perfil pelo site/.test(t)) return true;
  if (/^Os disponíveis estão no site/.test(t)) return true;
  if (/^Imóveis disponíveis para locação anual/.test(t)) return true;
  if (/Imóveis disponíveis\s*[—-]\s*Itapema/i.test(t)) return true;
  if (/^Novo perfil no site/.test(t)) return true;
  if (/^O imóvel \*/.test(t)) return true;
  if (t.includes("Se quiser visitar ou tirar dúvida, é só responder aqui.")) return true;
  if (/^Oi, passando para saber se ainda tem interesse/.test(t)) return true;
  if (/^Oi!\s*Passando para saber se você ainda tem interesse/.test(t)) return true;
  if (/^Olá!\s*(\n\s*)*Trabalho com aluguel anual/.test(t)) return true;
  if (/serviço seguro da Meta|mensagens e liga[cç][oõ]es s[aã]o protegidas com a criptografia/i.test(t)) {
    return true;
  }
  return false;
}
