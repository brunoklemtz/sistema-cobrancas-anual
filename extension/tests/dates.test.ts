import assert from "node:assert/strict";
import test from "node:test";
import { noPeriodo, parseDataMensagem } from "../src/utils/dates.ts";

test("parseia data do data-pre-plain-text do WhatsApp", () => {
  const p = parseDataMensagem("[14:35, 14/09/2026] Ana: ");
  assert.equal(p?.dataIso, "2026-09-14");
  assert.equal(p?.hora, "14:35");
});

test("filtra período inclusive", () => {
  assert.equal(noPeriodo("2026-09-01", "2026-08-16", "2026-09-14"), true);
  assert.equal(noPeriodo("2026-08-01", "2026-08-16", "2026-09-14"), false);
});
