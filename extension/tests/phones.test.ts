import assert from "node:assert/strict";
import test from "node:test";
import { chaveTelefone, ehListaMarketing, montarAlvos, montarAlvosMarketing, parseMarketingList, parsePhoneList } from "../src/utils/phones.ts";

test("deduplica telefones e prefere isActiveForBilling", () => {
  const file = parsePhoneList(
    JSON.stringify({
      properties: [
        {
          propertyId: "1",
          propertyCode: "BH 01",
          tenantName: "Ana",
          status: "active",
          phones: [
            { number: "+55 47 99999-0000", digits: "47999990000", isActiveForBilling: false },
            { number: "+55 47 98888-1111", digits: "47988881111", isActiveForBilling: true },
          ],
        },
        {
          propertyCode: "BH 02",
          phones: [{ number: "+5547988881111", digits: "47988881111", isActiveForBilling: true }],
        },
      ],
      extras: [{ number: "+55 47 9908-8553" }],
    })
  );
  const alvos = montarAlvos(file, "+55 47 9908-8553\n47 9908-8553");
  assert.equal(alvos.filter((a) => a.propertyCode === "BH 01")[0].telefone, "+55 47 98888-1111");
  assert.equal(alvos.filter((a) => a.fonte === "extra").length, 1);
  assert.equal(chaveTelefone("+55 47 98888-1111"), "47988881111");
  const keys = new Set(alvos.map((a) => a.digits));
  assert.equal(keys.size, alvos.length);
});

test("aceita array cru de imóveis", () => {
  const file = parsePhoneList(
    JSON.stringify([{ propertyCode: "CK 10", phones: [{ number: "47911112222", digits: "47911112222" }] }])
  );
  assert.equal(file.properties?.length, 1);
  assert.equal(montarAlvos(file, "").length, 1);
});

test("lista marketing de leads", () => {
  const raw = JSON.stringify({
    mode: "marketing",
    leads: [
      { telefone: "+55 47 98888-1111", leadId: "1", origemAtual: "desconhecida" },
      { telefone: "47988881111", origemAtual: "marketplace", confiancaAtual: "media" },
    ],
  });
  assert.equal(ehListaMarketing(raw), true);
  const alvos = montarAlvosMarketing(parseMarketingList(raw), "");
  assert.equal(alvos.length, 1);
});

test("smoke marketing usa os leads, não o extra de leituras", () => {
  const file = parseMarketingList(
    JSON.stringify({
      mode: "marketing",
      leads: [
        { telefone: "554199508080", leadId: "a" },
        { telefone: "554799769444", leadId: "b" },
        { telefone: "554799476690", leadId: "c" },
      ],
    })
  );
  const alvos = montarAlvosMarketing(file, "+55 47 9908-8553").slice(0, 3);
  assert.equal(alvos[0].telefone, "554199508080");
  assert.equal(
    alvos.some((a) => a.telefone.includes("9908-8553") || a.digits.endsWith("99088553")),
    false
  );
});
