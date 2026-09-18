import assert from "node:assert/strict";
import test from "node:test";
import { dedupeRegistros } from "../src/utils/dedupe.ts";
import type { ReadingRecord } from "../src/types/index.ts";

function rec(p: Partial<ReadingRecord>): ReadingRecord {
  return {
    propertyCode: "BH 01",
    propertyId: "x",
    tenantName: "Ana",
    telefone: "+55 47 90000-0000",
    fonte: "dm",
    dataMensagem: "2026-09-14",
    agua: null,
    luz: null,
    temFoto: false,
    fotoFileName: "",
    fotoBase64: "",
    trecho: "",
    precisaRevisao: false,
    semConversa: false,
    tipoConflito: "",
    messageId: "1",
    ...p,
  };
}

test("prefere registro com foto e número", () => {
  const out = dedupeRegistros([
    rec({ agua: 100, messageId: "a" }),
    rec({ agua: 100, temFoto: true, fotoBase64: "data:image/jpeg;base64,xx", fotoFileName: "f.jpg", messageId: "b" }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].temFoto, true);
  assert.equal(out[0].messageId, "b");
});

test("conflito de números não escolhe sozinho", () => {
  const out = dedupeRegistros([
    rec({ agua: 100, messageId: "a" }),
    rec({ agua: 200, messageId: "b" }),
  ]);
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => r.precisaRevisao && r.tipoConflito === "reading_conflict"));
});
