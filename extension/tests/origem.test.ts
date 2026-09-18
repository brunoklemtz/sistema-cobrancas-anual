import assert from "node:assert/strict";
import test from "node:test";
import { ehEcoBot } from "../src/utils/bot.ts";
import { classificarOrigemExt } from "../src/utils/origem.ts";

test("cartão instagram = meta alta", () => {
  const r = classificarOrigemExt("Olá", {
    anuncioInstagram: true,
    temCtwa: true,
  });
  assert.equal(r.origem, "meta");
  assert.equal(r.motivo, "cartao_instagram");
});

test("Você status / valor dessa = status", () => {
  assert.equal(classificarOrigemExt("Qual é o valor dessa?").origem, "status");
  assert.equal(
    classificarOrigemExt("Oi", { quotedStatus: true }).origem,
    "status"
  );
});

test("Oi livre = marketplace média", () => {
  const r = classificarOrigemExt("Oiii");
  assert.equal(r.origem, "marketplace");
  assert.equal(r.confianca, "media");
  assert.equal(r.motivo, "inicio_livre");
});

test("eco do bot não deve ser usado como texto de origem", () => {
  assert.equal(ehEcoBot("Imóveis disponíveis para locação anual — Itapema"), true);
  assert.equal(ehEcoBot("Olá!\n\nTrabalho com aluguel anual direto com o proprietário."), true);
  assert.equal(ehEcoBot("Oiii"), false);
});
