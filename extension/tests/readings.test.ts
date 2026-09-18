import assert from "node:assert/strict";
import test from "node:test";
import { candidatoLeitura, extrairCodigoImovel, extrairLeituras } from "../src/utils/readings.ts";

test("extrai água e luz sem inventar", () => {
  const a = extrairLeituras("água 1234 luz 5678");
  assert.equal(a.agua, 1234);
  assert.equal(a.luz, 5678);
  assert.equal(a.precisaRevisao, false);
});

test("dúvida vira precisaRevisao e não inventa número", () => {
  const a = extrairLeituras("fiz a leitura hoje");
  assert.equal(a.agua, null);
  assert.equal(a.luz, null);
  assert.equal(a.precisaRevisao, true);
  assert.equal(candidatoLeitura("bom dia"), false);
  assert.equal(candidatoLeitura("leitura água 4455"), true);
});

test("codigo do imóvel no texto", () => {
  assert.equal(extrairCodigoImovel("BH 01 água 100"), "BH 01");
  assert.equal(extrairCodigoImovel("sem código"), "");
});
